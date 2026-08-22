import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/db/store";

function clampInt(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.min(max, Math.max(min, Math.round(v)));
}

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const patch: Record<string, unknown> = {};

  if (body.theme === "light" || body.theme === "dark" || body.theme === "system") {
    patch.theme = body.theme;
  }
  const maxToday = clampInt(body.maxToday, 1, 20);
  if (maxToday !== undefined) patch.maxToday = maxToday;
  const maxDoing = clampInt(body.maxDoing, 1, 10);
  if (maxDoing !== undefined) patch.maxDoing = maxDoing;
  const staleDays = clampInt(body.staleDays, 1, 90);
  if (staleDays !== undefined) patch.staleDays = staleDays;
  if (typeof body.coachEnabled === "boolean") patch.coachEnabled = body.coachEnabled;

  if (body.automations && typeof body.automations === "object") {
    const a = body.automations as Record<string, unknown>;
    const automations: Record<string, boolean> = {};
    for (const key of ["autoClearPlanOnDone", "staleWaitingReminder"]) {
      if (typeof a[key] === "boolean") automations[key] = a[key] as boolean;
    }
    patch.automations = automations;
  }

  const settings = await updateSettings(patch as never);
  return NextResponse.json(settings);
}
