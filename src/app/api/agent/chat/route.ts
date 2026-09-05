import { NextResponse } from "next/server";
import { buildAgentContext } from "@/lib/agent/context";
import { extractMemoryFacts } from "@/lib/agent/facts";
import { streamReply, proposeAgentActions } from "@/lib/agent/loop";
import { splitForSummary, summarizeChat } from "@/lib/agent/summary";
import { getAiConfig } from "@/lib/ai/planner";
import {
  addMemoryNote,
  appendChatMessages,
  appendProposals,
  clearChat,
  getDb,
  listChatMessages,
  setChatSummary,
} from "@/lib/db/store";

export async function GET() {
  const messages = await listChatMessages();
  return NextResponse.json(messages);
}

export async function DELETE() {
  await clearChat();
  return NextResponse.json({ ok: true });
}

/**
 * 流式对话（SSE）：
 *   event: phase     {type:"phase", phase:"context"|"model"}   阶段变化（思考等待期的感知）
 *   event: reasoning {type:"reasoning", text:"..."}            推理模型的思考增量（先于正文）
 *   event: token     {type:"token", text:"..."}                打字机增量
 *   event: done      {type:"done", messages:[...]}             回复落库，立即可继续输入
 *   event: proposals {type:"proposals", messages:[...]}        建议卡片就绪后单独推送
 *   event: error     {type:"error", error:"..."}
 *
 * done 不等建议二次调用——慢端点上一次聊天不必排两次队。
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
  if (!getAiConfig().enabled) {
    return NextResponse.json(
      { error: "未配置 AI_API_KEY，请在 .env 中设置并重启服务" },
      { status: 503 },
    );
  }

  const db = await getDb();

  // 对话摘要滚动窗口：发送侧只取「最近窗口 + 已有摘要」，压缩在本轮
  // 回复交付之后进行（见下方 post-done 段）——慢端点上不让摘要的又一次
  // 排队挡在用户和首 token 之间。还没有摘要时首次全量发送，压缩随后补上。
  let history = db.chatMessages;
  let summary = db.chatSummary;
  const split = splitForSummary(history);
  if (split && summary.trim()) {
    history = split.keep;
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      // 心跳：慢端点首 token 可能要等很久，SSE 注释行保活（客户端解析器忽略）
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* 连接已关闭 */
        }
      }, 15_000);
      try {
        send({ type: "phase", phase: "context" });
        const context = buildAgentContext(db);
        send({ type: "phase", phase: "model" });

        const result = await streamReply(
          {
            profile: db.agentProfile,
            history,
            context,
            memoryNotes: db.memoryNotes,
            summary,
            userText: text,
            thinking: db.settings.agentThinking,
          },
          (delta) => send({ type: "token", text: delta }),
          // 思考过程实时转发（推理模型才有；先于正文到达）
          (delta) => send({ type: "reasoning", text: delta }),
        );

        const saved = await appendChatMessages([
          { role: "user" as const, content: text },
          {
            role: "assistant" as const,
            content: result.reply,
            reasoning: result.reasoning.slice(0, 4000) || undefined,
            proposals: [],
          },
        ]);
        const assistantMsg = saved[saved.length - 1];
        send({ type: "done", messages: saved });

        // 建议二次调用：回复已经交付，这里慢慢来；就绪后单独推送
        const proposals = await proposeAgentActions(
          db.agentProfile,
          history,
          text,
          result.reply,
          context,
          summary,
        );
        if (proposals.length > 0) {
          const mapped = proposals.map((p) => ({
            id: crypto.randomUUID(),
            tool: p.tool,
            args: p.args,
            summary: p.summary,
            status: "pending" as const,
          }));
          const messages = await appendProposals(assistantMsg.id, mapped);
          if (messages) send({ type: "proposals", messages });
        }

        // 滚动摘要：回复已交付，这里把旧消息压缩进 chatSummary，供下一轮
        // 使用（串行在建议调用之后，控制并发）。失败不影响任何已交付内容。
        try {
          const savedSplit = splitForSummary(saved);
          if (savedSplit) {
            const nextSummary = await summarizeChat(summary, savedSplit.toSummarize);
            await setChatSummary(nextSummary);
          }
        } catch {
          /* 摘要失败不影响对话 */
        }

        // 后台提炼记忆笔记（不阻塞响应）
        void extractMemoryFacts(text, result.reply, db.memoryNotes)
          .then(async (facts) => {
            for (const fact of facts) await addMemoryNote(fact);
          })
          .catch(() => {});

        controller.close();
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : "AI 调用失败" });
        controller.close();
      } finally {
        clearInterval(heartbeat);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // 反代（Nginx）默认会缓冲响应，打字机会变成「等半天，然后一次性蹦出来」
      "X-Accel-Buffering": "no",
    },
  });
}
