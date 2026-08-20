import { NextResponse } from "next/server";
import { aiSchedule } from "@/lib/ai/planner";
import { getDb } from "@/lib/db/store";

function startOfWeek(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export async function POST() {
  const db = await getDb();
  const result = await aiSchedule(db.tasks, startOfWeek());
  return NextResponse.json(result);
}
