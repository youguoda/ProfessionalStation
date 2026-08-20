import { NextResponse } from "next/server";
import { deleteHabit } from "@/lib/db/store";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deleteHabit(id);
  if (!ok) return NextResponse.json({ error: "习惯不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
