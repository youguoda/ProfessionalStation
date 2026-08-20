import { NextResponse } from "next/server";
import { setProposalStatus } from "@/lib/db/store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const messageId = typeof body?.messageId === "string" ? body.messageId : "";
  const proposalId = typeof body?.proposalId === "string" ? body.proposalId : "";
  const status =
    body?.status === "approved" || body?.status === "denied" ? body.status : "";
  if (!messageId || !proposalId || !status) {
    return NextResponse.json({ error: "参数不合法" }, { status: 400 });
  }
  const msg = await setProposalStatus(messageId, proposalId, status);
  if (!msg) return NextResponse.json({ error: "建议不存在" }, { status: 404 });
  return NextResponse.json(msg);
}
