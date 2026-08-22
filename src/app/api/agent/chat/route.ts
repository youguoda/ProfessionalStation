import { NextResponse } from "next/server";
import { buildAgentContext } from "@/lib/agent/context";
import { extractMemoryFacts } from "@/lib/agent/facts";
import { streamAgentReply } from "@/lib/agent/loop";
import { splitForSummary, summarizeChat } from "@/lib/agent/summary";
import { getAiConfig } from "@/lib/ai/planner";
import {
  addMemoryNote,
  appendChatMessages,
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
 *   event: token  {type:"token", text:"..."}   打字机增量
 *   event: done   {type:"done", messages:[...]} 完整消息列表（含建议卡片）
 *   event: error  {type:"error", error:"..."}
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

  // 对话摘要滚动窗口：超阈值时把旧消息压缩进 chatSummary
  let history = db.chatMessages;
  let summary = db.chatSummary;
  const split = splitForSummary(history);
  if (split) {
    try {
      summary = await summarizeChat(summary, split.toSummarize);
      await setChatSummary(summary);
      history = split.keep;
    } catch {
      /* 摘要失败不阻塞对话 */
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        let reply = "";
        const result = await streamAgentReply(
          {
            profile: db.agentProfile,
            history,
            context: buildAgentContext(db),
            memoryNotes: db.memoryNotes,
            summary,
            userText: text,
          },
          (delta) => {
            reply += delta;
            send({ type: "token", text: delta });
          },
        );

        const proposals = result.proposals.map((p) => ({
          id: crypto.randomUUID(),
          tool: p.tool,
          args: p.args,
          summary: p.summary,
          status: "pending" as const,
        }));

        await appendChatMessages([
          { role: "user" as const, content: text },
          { role: "assistant" as const, content: result.reply, proposals },
        ]);

        // 后台提炼记忆笔记（不阻塞响应）
        void extractMemoryFacts(text, result.reply, db.memoryNotes)
          .then(async (facts) => {
            for (const fact of facts) await addMemoryNote(fact);
          })
          .catch(() => {});

        send({ type: "done", messages: await listChatMessages() });
        controller.close();
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : "AI 调用失败" });
        controller.close();
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
