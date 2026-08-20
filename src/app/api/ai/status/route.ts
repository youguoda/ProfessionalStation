import { NextResponse } from "next/server";
import { getAiConfig } from "@/lib/ai/planner";

export async function GET() {
  const cfg = getAiConfig();
  return NextResponse.json({
    enabled: cfg.enabled,
    model: cfg.model,
    baseUrl: cfg.enabled ? cfg.baseUrl : null,
  });
}
