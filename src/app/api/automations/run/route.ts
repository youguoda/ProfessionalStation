import { NextResponse } from "next/server";
import { runAutomations } from "@/lib/db/store";

export async function POST() {
  const result = await runAutomations();
  return NextResponse.json(result);
}
