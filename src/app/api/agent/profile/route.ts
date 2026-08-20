import { NextResponse } from "next/server";
import { z } from "zod";
import { PERSONA_TEMPLATES } from "@/lib/agent/persona";
import { getAgentProfile, updateAgentProfile } from "@/lib/db/store";

const customSchema = z.object({
  role: z.array(z.string().max(200)).max(20).optional(),
  tone: z.array(z.string().max(200)).max(20).optional(),
  style: z.array(z.string().max(200)).max(20).optional(),
  boundaries: z.array(z.string().max(200)).max(20).optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(20).optional(),
  personaId: z
    .enum(PERSONA_TEMPLATES.map((p) => p.id) as [string, ...string[]])
    .optional(),
  custom: customSchema.optional(),
});

export async function GET() {
  const profile = await getAgentProfile();
  return NextResponse.json(profile);
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const profile = await updateAgentProfile(parsed.data as never);
  return NextResponse.json(profile);
}
