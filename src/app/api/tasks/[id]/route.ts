import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteTask, getTask, updateTask } from "@/lib/db/store";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const patchSchema = z.object({
  title: z.string().optional(),
  notes: z.string().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  effort: z.number().nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  plannedFor: isoDate.nullable().optional(),
  startDate: isoDate.nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  areaId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  blockedBy: z.array(z.string()).optional(),
  repeatRule: z.string().nullable().optional(),
  waitingFor: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  order: z.number().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const task = await getTask(id);
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  return NextResponse.json(task);
}

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
  const result = await updateTask(id, parsed.data);
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result.task);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deleteTask(id);
  if (!ok) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
