import { NextResponse } from "next/server";
import { dismissNudge, getDb, setLastNudge } from "@/lib/db/store";
import { topObservation } from "@/lib/agent/observer";
import { generateNudge } from "@/lib/agent/loop";
import { buildAgentContext } from "@/lib/agent/context";
import { isoDay } from "@/lib/engine/selectors";
import { nowIso } from "@/lib/domain/factory";
import type { CoachNudge } from "@/lib/domain/types";

/**
 * 教练层入口。
 *
 * 三条红线在这里强制执行：
 *   - **罕见**：没有模式成立就返回 null（大多数日子应该是 null）
 *   - **一天最多一次**：当天已生成过就直接复用，绝不再算第二条
 *   - **可关**：settings.coachEnabled = false 时直接返回 null
 */
export async function GET() {
  const db = await getDb();
  if (!db.settings.coachEnabled) {
    return NextResponse.json({ nudge: null });
  }

  const now = new Date();
  const today = isoDay(now);
  const last = db.lastNudge;

  // 当天已经说过了：忽略过就闭嘴，没忽略就复用同一句（不重新生成）
  if (last && last.day === today) {
    return NextResponse.json({ nudge: last.dismissed ? null : last });
  }

  const observation = topObservation({
    tasks: db.tasks,
    projects: db.projects,
    settings: db.settings,
    now,
  });
  if (!observation) {
    return NextResponse.json({ nudge: null });
  }

  // 有 AI 就用人格说；没有就用 observer 里已经写好的兜底文案
  const spoken = await generateNudge({
    profile: db.agentProfile,
    evidence: observation.evidence,
    context: buildAgentContext(db, now),
    memoryNotes: db.memoryNotes,
  });

  const nudge: CoachNudge = {
    id: observation.id,
    kind: observation.kind,
    text: spoken ?? observation.fallback,
    day: today,
    taskId: observation.taskId,
    dismissed: false,
    createdAt: nowIso(),
  };
  await setLastNudge(nudge);
  return NextResponse.json({ nudge });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body?.id !== "string") {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  const nudge = await dismissNudge(body.id);
  return NextResponse.json({ nudge });
}
