import { NextResponse } from "next/server";
import { aiBreakdown, getAiConfig } from "@/lib/ai/planner";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const notes = typeof body?.notes === "string" ? body.notes : "";
  if (!title) return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  if (!getAiConfig().enabled) {
    return NextResponse.json(
      { error: "未配置 AI_API_KEY，请在 .env 中设置并重启服务" },
      { status: 503 },
    );
  }
  try {
    const titles = await aiBreakdown(title, notes);
    return NextResponse.json({ titles });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI 调用失败" },
      { status: 502 },
    );
  }
}
