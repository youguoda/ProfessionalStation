import { describe, expect, it } from "vitest";
import { createTask } from "@/lib/domain/factory";
import { suggestSchedule } from "./scheduler";

// 周一：2025-01-06
const monday = new Date(2025, 0, 6);

describe("suggestSchedule 智能排期", () => {
  it("按优先级排序分配空闲槽，每天最多 maxPerDay 个", () => {
    const t1 = createTask({ title: "P1-高努力", phase: "action", priority: 1, effort: 5 });
    const t2 = createTask({ title: "P1-低努力", phase: "action", priority: 1, effort: 1 });
    const t3 = createTask({ title: "P2", phase: "action", priority: 2 });
    const t4 = createTask({ title: "P3", phase: "action", priority: 3 });
    const t5 = createTask({ title: "P4", phase: "action", priority: 4 });

    const r = suggestSchedule([t1, t2, t3, t4, t5], monday, { maxPerDay: 3, hours: [9, 10, 11] });

    expect(r).toEqual([
      { taskId: t1.id, scheduledAt: "2025-01-06T09:00:00" },
      { taskId: t2.id, scheduledAt: "2025-01-06T10:00:00" },
      { taskId: t3.id, scheduledAt: "2025-01-06T11:00:00" },
      { taskId: t4.id, scheduledAt: "2025-01-07T09:00:00" },
      { taskId: t5.id, scheduledAt: "2025-01-07T10:00:00" },
    ]);
  });

  it("避开已有排期占用的槽位", () => {
    const busy = createTask({ title: "已排期", phase: "action", scheduledAt: "2025-01-06T09:00:00" });
    const t1 = createTask({ title: "新任务", phase: "action", priority: 1 });
    const r = suggestSchedule([busy, t1], monday, { maxPerDay: 1, hours: [9, 10] });
    expect(r).toEqual([{ taskId: t1.id, scheduledAt: "2025-01-06T10:00:00" }]);
  });

  it("排除已完成/已排期任务，并跳过已被占用的槽位", () => {
    const done = createTask({ title: "done", phase: "action", status: "done" });
    const sched = createTask({ title: "sched", phase: "action", scheduledAt: "2025-01-06T09:00:00" });
    const inbox = createTask({ title: "inbox", phase: "inbox" });
    const t = createTask({ title: "candidate", phase: "action" });
    const r = suggestSchedule([done, sched, inbox, t], monday, { maxPerDay: 1, hours: [9] });
    // 周一 09:00 已被 sched 占用 → 顺延到周二 09:00
    expect(r).toEqual([{ taskId: t.id, scheduledAt: "2025-01-07T09:00:00" }]);
  });

  it("容量不足时不再分配", () => {
    const t1 = createTask({ title: "a", phase: "action", priority: 1 });
    const t2 = createTask({ title: "b", phase: "action", priority: 2 });
    const t3 = createTask({ title: "c", phase: "action", priority: 3 });
    const t4 = createTask({ title: "d", phase: "action", priority: 4 });
    const t5 = createTask({ title: "e", phase: "action", priority: 4 });
    // 每天 2 个、共 5 个工作日 → 容量 10，够用；改 maxPerDay=1 → 容量 5，全排
    const r = suggestSchedule([t1, t2, t3, t4, t5], monday, { maxPerDay: 1, hours: [9] });
    expect(r).toHaveLength(5);
    expect(r[0].scheduledAt).toBe("2025-01-06T09:00:00");
    expect(r[4].scheduledAt).toBe("2025-01-10T09:00:00");
  });
});
