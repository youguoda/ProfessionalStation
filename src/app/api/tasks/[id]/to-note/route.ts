import { NextResponse } from "next/server";
import { convertTaskToNote } from "@/lib/db/store";

/** 转化为笔记（终局之一）：内容留存到笔记，任务移入回收站可恢复 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await convertTaskToNote(id);
  if (!result) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  return NextResponse.json(result);
}
