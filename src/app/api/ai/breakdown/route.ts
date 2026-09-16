import { NextResponse } from "next/server";
import { aiBreakdown, getAiConfig, type BreakdownTurn } from "@/lib/ai/planner";

/** 把请求体里的对话记录清洗成可信的 turns（长度与角色都要兜住） */
function parseTurns(raw: unknown): BreakdownTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (t): t is { role: string; content: string } =>
        Boolean(t) &&
        typeof t === "object" &&
        typeof (t as { content?: unknown }).content === "string" &&
        (t as { content: string }).content.trim().length > 0,
    )
    .slice(-6)
    .map((t) => ({
      role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: t.content.trim().slice(0, 1000),
    }));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const notes = typeof body?.notes === "string" ? body.notes : "";
  const turns = parseTurns(body?.turns);
  if (!title) return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  if (!getAiConfig().enabled) {
    return NextResponse.json(
      { error: "未配置 AI_API_KEY，请在 .env 中设置并重启服务" },
      { status: 503 },
    );
  }
  try {
    const result = await aiBreakdown(title, notes, turns);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI 调用失败" },
      { status: 502 },
    );
  }
}
