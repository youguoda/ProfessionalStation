import { NextResponse } from "next/server";
import { transitionTask } from "@/lib/db/store";
import type { TaskEvent } from "@/lib/engine/stateMachine";

const EVENT_TYPES = [
  "clarify",
  "start",
  "stop",
  "complete",
  "reopen",
  "cancel",
  "trash",
  "restore",
] as const;

const CLARIFY_TARGETS = ["action", "waiting", "someday"] as const;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  if (!body || typeof body !== "object" || !EVENT_TYPES.includes(body.type)) {
    return NextResponse.json({ error: "非法事件类型" }, { status: 400 });
  }

  let event: TaskEvent;
  if (body.type === "clarify") {
    if (!CLARIFY_TARGETS.includes(body.target)) {
      return NextResponse.json({ error: "非法澄清目标" }, { status: 400 });
    }
    event = { type: "clarify", target: body.target };
  } else if (body.type === "cancel") {
    event = {
      type: "cancel",
      reason: typeof body.reason === "string" ? body.reason.slice(0, 200) : undefined,
    };
  } else {
    event = { type: body.type };
  }

  const result = await transitionTask(id, event);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ task: result.task, spawned: result.spawned ?? null });
}
