import { NextResponse } from "next/server";
import { getOrCreateTag, listTags } from "@/lib/db/store";

export async function GET() {
  const tags = await listTags();
  return NextResponse.json(tags);
}

export async function POST(req: Request) {
  const body = await req.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const kind = body?.kind === "context" ? "context" : "tag";
  if (!name) return NextResponse.json({ error: "标签名不能为空" }, { status: 400 });
  const tag = await getOrCreateTag(name, kind);
  return NextResponse.json(tag, { status: 201 });
}
