import { NextResponse } from "next/server";
import { toggleHabitCheck } from "@/lib/db/store";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const date = typeof body?.date === "string" ? body.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "日期格式应为 YYYY-MM-DD" }, { status: 400 });
  }
  const result = await toggleHabitCheck(id, date);
  if (!result) return NextResponse.json({ error: "习惯不存在" }, { status: 404 });
  return NextResponse.json(result);
}
