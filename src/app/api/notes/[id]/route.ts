import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteNote, updateNote } from "@/lib/db/store";

const patchSchema = z.object({
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  projectId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const note = await updateNote(id, parsed.data);
  if (!note) return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  return NextResponse.json(note);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deleteNote(id);
  if (!ok) return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
