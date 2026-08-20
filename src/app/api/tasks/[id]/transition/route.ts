import { NextResponse } from "next/server";
import { transitionTask } from "@/lib/db/store";

const EVENT_TYPES = ["clarify", "start", "complete", "reopen", "cancel", "setStatus", "trash", "restore"] as const;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  if (!body || typeof body !== "object" || !EVENT_TYPES.includes(body.type)) {
    return NextResponse.json({ error: "非法事件类型" }, { status: 400 });
  }

  const event =
    body.type === "clarify"
      ? { type: "clarify" as const, target: body.target }
      : body.type === "setStatus"
        ? { type: "setStatus" as const, status: body.status }
        : { type: body.type };

  const result = await transitionTask(id, event as never);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ task: result.task, spawned: result.spawned ?? null });
}
