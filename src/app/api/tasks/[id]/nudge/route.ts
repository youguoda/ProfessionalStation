import { NextResponse } from "next/server";
import { nudgeTask } from "@/lib/db/store";

/** 等待项「戳一下」：重置等待计时并记一条活动历史 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const task = await nudgeTask(id);
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  return NextResponse.json(task);
}
