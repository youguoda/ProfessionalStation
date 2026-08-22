import { NextResponse } from "next/server";
import { resetTaskData } from "@/lib/db/store";

/**
 * 清空任务与笔记（保留项目/领域/设置/人格）。
 * 用于从测试数据切换到真实使用——需要显式 confirm 才执行。
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "RESET") {
    return NextResponse.json({ error: "需要 confirm: \"RESET\"" }, { status: 400 });
  }
  const counts = await resetTaskData();
  return NextResponse.json(counts);
}
