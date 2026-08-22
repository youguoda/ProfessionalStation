import { NextResponse } from "next/server";
import { z } from "zod";
import { createNote, listNotes } from "@/lib/db/store";

const noteSchema = z.object({
  content: z.string().min(1, "内容不能为空"),
  tags: z.array(z.string()).optional(),
  projectId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
});

export async function GET() {
  const notes = await listNotes();
  return NextResponse.json(notes);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const note = await createNote(parsed.data);
  return NextResponse.json(note, { status: 201 });
}
