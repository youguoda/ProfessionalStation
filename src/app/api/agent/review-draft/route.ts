import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/store";
import { generateReviewDraft } from "@/lib/agent/loop";
import { buildAgentContext } from "@/lib/agent/context";
import { buildWeekFacts, fallbackReviewDraft, weekFactsText } from "@/lib/agent/review";

/**
 * 周复盘笔记的初稿。
 *
 * 复盘笔记长期是空的，不是因为不想复盘，而是因为对着空白框从头写太贵。
 * 这里把动作从「写」降到「改」——AI 不可用时用真实数据本地拼一份，
 * 依然是有内容的初稿，不会退回空白。
 */
export async function POST() {
  const db = await getDb();
  const now = new Date();
  const facts = buildWeekFacts(db, now);

  const spoken = await generateReviewDraft({
    profile: db.agentProfile,
    facts: weekFactsText(facts),
    context: buildAgentContext(db, now),
    memoryNotes: db.memoryNotes,
  });

  return NextResponse.json({
    draft: spoken ?? fallbackReviewDraft(facts),
    byAi: spoken !== null,
  });
}
