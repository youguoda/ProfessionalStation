import { NextResponse } from "next/server";
import { z } from "zod";
import { createTask, listTasks } from "@/lib/db/store";

const taskSchema = z.object({
  title: z.string().min(1, "标题不能为空"),
  notes: z.string().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  effort: z.number().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  areaId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  contexts: z.array(z.string()).optional(),
  isFrog: z.boolean().optional(),
  phase: z.enum(["inbox", "action", "waiting", "someday", "reference", "trash"]).optional(),
  status: z.enum(["todo", "doing", "done", "canceled"]).optional(),
});

export async function GET() {
  const tasks = await listTasks();
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = taskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const task = await createTask(parsed.data);
  return NextResponse.json(task, { status: 201 });
}
