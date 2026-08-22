import { describe, expect, it } from "vitest";
import { createHabit, createProject, createTask, emptyDb } from "@/lib/domain/factory";
import type { Db } from "@/lib/domain/types";
import { buildAgentContext } from "./context";

const now = new Date(2025, 0, 8); // 2025-01-08（周三）

describe("buildAgentContext", () => {
  it("各清单统计与任务行正确注入", () => {
    const db: Db = {
      ...emptyDb(),
      tasks: [
        createTask({ title: "今日任务", phase: "action", plannedFor: "2025-01-08", priority: 1 }),
        createTask({ title: "超期任务", phase: "action", dueDate: "2025-01-07", priority: 2 }),
        createTask({ title: "下一步", phase: "action", priority: 3 }),
        createTask({ title: "等待项", phase: "waiting" }),
        createTask({ title: "未澄清", phase: "inbox" }),
      ],
      projects: [createProject({ name: "无行动项目" })],
    };
    const s = buildAgentContext(db, now);
    expect(s).toContain("今天是 2025-01-08。");
    // 注入两条约束，马力据此才能提出有意义的建议
    expect(s).toContain("【约束】今天已承诺 1/6 条");
    expect(s).toContain("在制 0/3 个");
    // 逾期任务置顶进「今天」（视图一致性），因此今天=2
    expect(s).toContain("【今天（我承诺要做的）】2 个：");
    expect(s).toContain("今日任务");
    expect(s).toContain("【逾期】1 个：");
    expect(s).toContain("超期任务");
    expect(s).toContain("【等待】1 个：");
    expect(s).toContain("【收件箱】1 个待澄清");
    expect(s).toContain("【无下一步行动的项目】无行动项目");
    expect(s).toContain("id=");
  });

  it("习惯统计显示 x/7", () => {
    const h = createHabit("阅读");
    const db: Db = { ...emptyDb(), habits: [h] };
    db.habitChecks.push({ id: "c1", habitId: h.id, date: "2025-01-08" });
    db.habitChecks.push({ id: "c2", habitId: h.id, date: "2025-01-07" });
    const s = buildAgentContext(db, now);
    expect(s).toContain("阅读 2/7");
  });

  it("空数据时给出占位而不是报错", () => {
    const s = buildAgentContext(emptyDb(), now);
    expect(s).toContain("【今天（我承诺要做的）】0 个：");
    expect(s).toContain("【进行中】0 个：");
    expect(s).toContain("（无）");
    expect(s).toContain("（未设置）");
  });
});
