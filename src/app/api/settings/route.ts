import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/db/store";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if (typeof body.defaultMode === "string") patch.defaultMode = body.defaultMode;
  if (body.kanbanWip && typeof body.kanbanWip === "object") patch.kanbanWip = body.kanbanWip;
  if (body.theme === "light" || body.theme === "dark" || body.theme === "system") {
    patch.theme = body.theme;
  }
  if (typeof body.dayStartHour === "number") patch.dayStartHour = body.dayStartHour;
  if (typeof body.dayEndHour === "number") patch.dayEndHour = body.dayEndHour;
  if (body.automations && typeof body.automations === "object") {
    const a = body.automations as Record<string, unknown>;
    const automations: Record<string, boolean> = {};
    for (const key of ["autoFlagOverdueFrog", "autoClearFrogOnDone", "staleWaitingReminder"]) {
      if (typeof a[key] === "boolean") automations[key] = a[key] as boolean;
    }
    patch.automations = automations;
  }
  const settings = await updateSettings(patch as never);
  return NextResponse.json(settings);
}
