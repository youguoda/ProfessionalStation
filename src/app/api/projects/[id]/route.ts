import { NextResponse } from "next/server";
import { deleteProject, updateProject } from "@/lib/db/store";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.goal === "string" || body.goal === null) patch.goal = body.goal;
  if (typeof body.deadline === "string" || body.deadline === null) patch.deadline = body.deadline;
  if (typeof body.archived === "boolean") patch.archived = body.archived;
  const project = await updateProject(id, patch as never);
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  return NextResponse.json(project);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deleteProject(id);
  if (!ok) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
