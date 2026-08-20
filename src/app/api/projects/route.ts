import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/db/store";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const body = await req.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "项目名不能为空" }, { status: 400 });
  const project = await createProject(name);
  return NextResponse.json(project, { status: 201 });
}
