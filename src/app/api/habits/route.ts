import { NextResponse } from "next/server";
import { createHabit, listHabitChecks, listHabits } from "@/lib/db/store";

export async function GET() {
  const habits = await listHabits();
  const checks = await listHabitChecks();
  return NextResponse.json({ habits, checks });
}

export async function POST(req: Request) {
  const body = await req.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "习惯名不能为空" }, { status: 400 });
  const icon = typeof body?.icon === "string" && body.icon ? body.icon : "🎯";
  const habit = await createHabit(name, icon);
  return NextResponse.json(habit, { status: 201 });
}
