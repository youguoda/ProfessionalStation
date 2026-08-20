import { NextResponse } from "next/server";
import { buildAgentContext } from "@/lib/agent/context";
import { runAgentTurn } from "@/lib/agent/loop";
import { getAiConfig } from "@/lib/ai/planner";
import {
  appendChatMessages,
  clearChat,
  getDb,
  listChatMessages,
} from "@/lib/db/store";

export async function GET() {
  const messages = await listChatMessages();
  return NextResponse.json(messages);
}

export async function DELETE() {
  await clearChat();
  return NextResponse.json({ ok: true });
}

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
  try {
    const result = await runAgentTurn({
      profile: db.agentProfile,
      history: db.chatMessages,
      context: buildAgentContext(db),
      memoryNotes: db.memoryNotes,
      userText: text,
    });

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

    const messages = await listChatMessages();
    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI 调用失败" },
      { status: 502 },
    );
  }
}
