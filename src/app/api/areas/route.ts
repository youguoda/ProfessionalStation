import { NextResponse } from "next/server";
import { createArea, listAreas } from "@/lib/db/store";

export async function GET() {
  const areas = await listAreas();
  return NextResponse.json(areas);
}

export async function POST(req: Request) {
  const body = await req.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "领域名不能为空" }, { status: 400 });
  const area = await createArea(name);
  return NextResponse.json(area, { status: 201 });
}
