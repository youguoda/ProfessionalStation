import { describe, expect, it } from "vitest";
import { createTask, emptyDb } from "@/lib/domain/factory";
import type { Db } from "@/lib/domain/types";
import { buildWeekFacts, fallbackReviewDraft, weekFactsText } from "./review";

const NOW = new Date("2026-09-10T09:00:00.000Z");
const iso = (daysAgo: number) =>
  new Date(NOW.getTime() - daysAgo * 86400000).toISOString();

function dbWith(partial: Partial<Db>): Db {
  return { ...emptyDb(), ...partial };
}

describe("周复盘素材", () => {
  it("只收本周的完成与放弃", () => {
    const db = dbWith({
      tasks: [
        { ...createTask({ title: "结了的" }), status: "done", completedAt: iso(2) },
        { ...createTask({ title: "上个月结的" }), status: "done", completedAt: iso(30) },
        {
          ...createTask({ title: "放弃的" }),
          status: "canceled",
          completedAt: iso(3),
          canceledReason: "需求没了",
        },
      ],
    });
    const facts = buildWeekFacts(db, NOW);
    expect(facts.done.map((t) => t.title)).toEqual(["结了的"]);
    expect(facts.canceled.map((t) => t.title)).toEqual(["放弃的"]);
    expect(weekFactsText(facts)).toContain("需求没了");
  });

  it("把本周说过的话收成话题", () => {
    const db = dbWith({
      chatMessages: [
        { id: "1", role: "user", content: "多 agent 调试卡住了", proposals: [], createdAt: iso(1) },
        { id: "2", role: "assistant", content: "那你打算怎么办", proposals: [], createdAt: iso(1) },
        { id: "3", role: "user", content: "很久以前的事", proposals: [], createdAt: iso(40) },
      ],
    });
    expect(buildWeekFacts(db, NOW).topics).toEqual(["多 agent 调试卡住了"]);
  });
});

describe("兜底初稿（无 AI 时）", () => {
  it("三段齐全，且带上真实数字与任务名", () => {
    const db = dbWith({
      tasks: [{ ...createTask({ title: "写完文档" }), status: "done", completedAt: iso(1) }],
    });
    const draft = fallbackReviewDraft(buildWeekFacts(db, NOW));
    expect(draft).toContain("本周做得好的：");
    expect(draft).toContain("烂尾或放弃的，以及原因：");
    expect(draft).toContain("下周最重要的一件事：");
    expect(draft).toContain("写完文档");
    // 关键：兜底也必须是**有内容的**初稿，不能退回一个空模板
    expect(draft.length).toBeGreaterThan(40);
  });

  it("一条没结时直接点破「只进不出」", () => {
    const db = dbWith({
      tasks: [{ ...createTask({ title: "新建的" }), createdAt: iso(1) }],
    });
    const draft = fallbackReviewDraft(buildWeekFacts(db, NOW));
    expect(draft).toContain("一条都没结");
  });

  it("挂着的在制品会成为「下周最重要的一件事」", () => {
    const db = dbWith({
      tasks: [
        {
          ...createTask({ title: "挂了很久的量化", phase: "action", status: "doing" }),
          startedAt: iso(20),
        },
      ],
    });
    const draft = fallbackReviewDraft(buildWeekFacts(db, NOW));
    expect(draft).toContain("挂了很久的量化");
  });
});
