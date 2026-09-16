import { NextResponse } from "next/server";
import { completeRitual, ritualPending } from "@/lib/db/store";

/** 今天还要不要弹开机仪式 */
export async function GET() {
  return NextResponse.json({ pending: await ritualPending() });
}

/** 挑完了（或明确跳过）：记下今天已做，当天不再拦 */
export async function POST() {
  return NextResponse.json({ day: await completeRitual(), pending: false });
}
