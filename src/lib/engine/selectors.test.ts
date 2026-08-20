import { describe, expect, it } from "vitest";
import { createProject, createTask } from "@/lib/domain/factory";
import type { Settings } from "@/lib/domain/types";
import {
  byFrogThenPriority,
  byOrderThenPriority,
  isBlocked,
  isImportant,
  isUrgent,
  quadrantOf,
  selectInbox,
  selectKanban,
  selectMatrix,
  selectNextActions,
  selectOverdue,
  selectReady,
  selectReviewStats,
  selectSomeday,
  selectToday,
  selectTrash,
  selectWaiting,
  wouldCreateCycle,
} from "./selectors";

const now = new Date(2025, 0, 8); // 2025-01-08（周三）

describe("基础清单过滤", () => {
  const tasks = [
    createTask({ title: "收", phase: "inbox" }),
    createTask({ title: "行", phase: "action", status: "todo" }),
    createTask({ title: "做", phase: "action", status: "doing" }),
    createTask({ title: "等", phase: "waiting" }),
    createTask({ title: "将", phase: "someday" }),
    createTask({ title: "废", phase: "trash" }),
  ];

  it("各清单按 phase/status 精确过滤", () => {
    expect(selectInbox(tasks).map((t) => t.title)).toEqual(["收"]);
    expect(selectNextActions(tasks).map((t) => t.title)).toEqual(["行"]);
    expect(selectWaiting(tasks).map((t) => t.title)).toEqual(["等"]);
    expect(selectSomeday(tasks).map((t) => t.title)).toEqual(["将"]);
    expect(selectTrash(tasks).map((t) => t.title)).toEqual(["废"]);
  });
});

describe("isUrgent / isImportant / quadrantOf", () => {
  it("7 天边界：第 7 天紧急，第 8 天不紧急", () => {
    expect(isUrgent(createTask({ title: "x", phase: "action", dueDate: "2025-01-15" }), now)).toBe(true);
    expect(isUrgent(createTask({ title: "x", phase: "action", dueDate: "2025-01-16" }), now)).toBe(false);
  });

  it("超期视为紧急，无截止不紧急", () => {
    expect(isUrgent(createTask({ title: "x", phase: "action", dueDate: "2025-01-01" }), now)).toBe(true);
    expect(isUrgent(createTask({ title: "x", phase: "action", dueDate: null }), now)).toBe(false);
  });

  it("已完成/已取消不紧急", () => {
    expect(isUrgent(createTask({ title: "x", phase: "action", status: "done", dueDate: "2025-01-09" }), now)).toBe(false);
  });

  it("priority≤2 为重要", () => {
    expect(isImportant(createTask({ title: "x", priority: 1 }))).toBe(true);
    expect(isImportant(createTask({ title: "x", priority: 2 }))).toBe(true);
    expect(isImportant(createTask({ title: "x", priority: 3 }))).toBe(false);
    expect(isImportant(createTask({ title: "x", priority: 4 }))).toBe(false);
  });

  it("四象限归类", () => {
    expect(quadrantOf(createTask({ title: "x", phase: "action", priority: 1, dueDate: "2025-01-09" }), now)).toBe("q1");
    expect(quadrantOf(createTask({ title: "x", phase: "action", priority: 1, dueDate: null }), now)).toBe("q2");
    expect(quadrantOf(createTask({ title: "x", phase: "action", priority: 4, dueDate: "2025-01-09" }), now)).toBe("q3");
    expect(quadrantOf(createTask({ title: "x", phase: "action", priority: 4, dueDate: null }), now)).toBe("q4");
  });
});

describe("selectKanban", () => {
  const settings: Settings = {
    defaultMode: "gtd",
    kanbanWip: { todo: 2, doing: 1, done: -1, canceled: -1 },
    automations: {
      autoFlagOverdueFrog: true,
      autoClearFrogOnDone: true,
      staleWaitingReminder: false,
    },
  };

  it("按 status 分列、按优先级排序、wip 取自 settings", () => {
    const tasks = [
      createTask({ title: "t2", phase: "action", status: "todo", priority: 2 }),
      createTask({ title: "t1", phase: "action", status: "todo", priority: 1 }),
      createTask({ title: "d1", phase: "action", status: "doing", priority: 3 }),
    ];
    const cols = selectKanban(tasks, settings);
    expect(cols.map((c) => c.status)).toEqual(["todo", "doing", "done", "canceled"]);
    expect(cols[0].tasks.map((t) => t.title)).toEqual(["t1", "t2"]);
    expect(cols[0].wip).toBe(2);
    expect(cols[1].tasks.map((t) => t.title)).toEqual(["d1"]);
    expect(cols[1].wip).toBe(1);
    expect(cols[2].tasks).toEqual([]);
    expect(cols[2].wip).toBe(-1);
  });
});

describe("selectMatrix", () => {
  it("四象限分桶正确", () => {
    const tasks = [
      createTask({ title: "q1", phase: "action", priority: 1, dueDate: "2025-01-09" }),
      createTask({ title: "q2", phase: "action", priority: 2, dueDate: null }),
      createTask({ title: "q3", phase: "action", priority: 4, dueDate: "2025-01-09" }),
      createTask({ title: "q4", phase: "action", priority: 4, dueDate: null }),
      createTask({ title: "done", phase: "action", status: "done", priority: 1, dueDate: "2025-01-09" }),
    ];
    const m = selectMatrix(tasks, now);
    expect(m[0].tasks.map((t) => t.title)).toEqual(["q1"]);
    expect(m[1].tasks.map((t) => t.title)).toEqual(["q2"]);
    expect(m[2].tasks.map((t) => t.title)).toEqual(["q3"]);
    expect(m[3].tasks.map((t) => t.title)).toEqual(["q4"]);
  });
});

describe("selectToday / selectOverdue", () => {
  it("今日 = 今日到期 + 今日开始 + 青蛙；青蛙优先排序", () => {
    const tasks = [
      createTask({ title: "A", phase: "action", dueDate: "2025-01-08", priority: 2 }),
      createTask({ title: "B", phase: "action", isFrog: true, priority: 4 }),
      createTask({ title: "C", phase: "action", startDate: "2025-01-08", priority: 1 }),
      createTask({ title: "D", phase: "action", dueDate: "2025-01-20", priority: 1 }),
      createTask({ title: "E", phase: "action", status: "done", dueDate: "2025-01-08" }),
    ];
    expect(selectToday(tasks, now).map((t) => t.title)).toEqual(["B", "C", "A"]);
  });

  it("超期 = 截止日期早于今天且未完成", () => {
    const tasks = [
      createTask({ title: "over", phase: "action", dueDate: "2025-01-07" }),
      createTask({ title: "today", phase: "action", dueDate: "2025-01-08" }),
      createTask({ title: "future", phase: "action", dueDate: "2025-01-09" }),
      createTask({ title: "nodue", phase: "action", dueDate: null }),
      createTask({ title: "done", phase: "action", status: "done", dueDate: "2025-01-07" }),
    ];
    expect(selectOverdue(tasks, now).map((t) => t.title)).toEqual(["over"]);
  });
});

describe("selectReviewStats", () => {
  it("统计滞留/超期/无行动项目/等待", () => {
    const p1 = createProject({ name: "P1" });
    const p2 = createProject({ name: "P2" });
    const p3 = createProject({ name: "P3", archived: true });
    const stale = createTask({ title: "stale", phase: "inbox" });
    stale.createdAt = "2024-12-01T00:00:00.000Z";
    const fresh = createTask({ title: "fresh", phase: "inbox" });
    fresh.createdAt = "2025-01-07T00:00:00.000Z";
    const tasks = [
      stale,
      fresh,
      createTask({ title: "over", phase: "action", dueDate: "2025-01-07" }),
      createTask({ title: "wait", phase: "waiting" }),
      createTask({ title: "p2-action", phase: "action", status: "todo", projectId: p2.id }),
    ];
    const stats = selectReviewStats(tasks, [p1, p2, p3], now);
    expect(stats.inboxStale).toBe(1);
    expect(stats.overdue).toBe(1);
    expect(stats.waitingCount).toBe(1);
    expect(stats.total).toBe(5);
    expect(stats.projectsWithoutAction).toEqual(["P1"]);
  });
});

describe("排序", () => {
  it("byOrderThenPriority：priority 升序，再 order 升序", () => {
    const a = createTask({ title: "a", priority: 3 }); a.order = 0;
    const b = createTask({ title: "b", priority: 1 }); b.order = 5;
    const c = createTask({ title: "c", priority: 1 }); c.order = 2;
    expect([a, b, c].sort(byOrderThenPriority).map((t) => t.title)).toEqual(["c", "b", "a"]);
  });

  it("byFrogThenPriority：青蛙优先，再 priority", () => {
    const a = createTask({ title: "a", priority: 1, isFrog: false });
    const b = createTask({ title: "b", priority: 4, isFrog: true });
    const c = createTask({ title: "c", priority: 2, isFrog: false });
    expect([a, b, c].sort(byFrogThenPriority).map((t) => t.title)).toEqual(["b", "a", "c"]);
  });
});

describe("isBlocked / selectReady", () => {
  it("依赖未完成则阻塞", () => {
    const dep = createTask({ title: "dep", phase: "action", status: "todo" });
    const t = createTask({ title: "a", phase: "action", blockedBy: [dep.id] });
    expect(isBlocked(t, [dep, t])).toBe(true);
  });

  it("依赖完成则不阻塞", () => {
    const dep = createTask({ title: "dep", phase: "action", status: "done" });
    const t = createTask({ title: "a", phase: "action", blockedBy: [dep.id] });
    expect(isBlocked(t, [dep, t])).toBe(false);
  });

  it("依赖缺失视为不阻塞（容错）", () => {
    const t = createTask({ title: "a", phase: "action", blockedBy: ["missing"] });
    expect(isBlocked(t, [t])).toBe(false);
  });

  it("依赖在回收站视为不阻塞", () => {
    const dep = createTask({ title: "dep", phase: "trash", status: "todo" });
    const t = createTask({ title: "a", phase: "action", blockedBy: [dep.id] });
    expect(isBlocked(t, [dep, t])).toBe(false);
  });

  it("selectReady 排除被阻塞的任务", () => {
    const dep = createTask({ title: "dep", phase: "action", status: "todo" });
    const blocked = createTask({ title: "blocked", phase: "action", blockedBy: [dep.id] });
    const ready = createTask({ title: "ready", phase: "action" });
    expect(selectReady([dep, blocked, ready]).map((t) => t.title)).toEqual(["dep", "ready"]);
  });
});

describe("wouldCreateCycle 成环检测", () => {
  it("自依赖成环", () => {
    const a = createTask({ title: "a", phase: "action" });
    expect(wouldCreateCycle(a.id, a.id, [a])).toBe(true);
  });

  it("直接互依成环（A 依赖 B，而 B 已依赖 A）", () => {
    const a = createTask({ title: "a", phase: "action" });
    const b = createTask({ title: "b", phase: "action", blockedBy: [a.id] });
    expect(wouldCreateCycle(a.id, b.id, [a, b])).toBe(true);
  });

  it("间接成环（A→B→C→A）", () => {
    const a = createTask({ title: "a", phase: "action" });
    const b = createTask({ title: "b", phase: "action", blockedBy: [a.id] });
    const c = createTask({ title: "c", phase: "action", blockedBy: [b.id] });
    expect(wouldCreateCycle(a.id, c.id, [a, b, c])).toBe(true);
  });

  it("合法依赖不成环", () => {
    const a = createTask({ title: "a", phase: "action" });
    const b = createTask({ title: "b", phase: "action" });
    expect(wouldCreateCycle(a.id, b.id, [a, b])).toBe(false);
  });

  it("依赖链与目标无关时不成环", () => {
    const a = createTask({ title: "a", phase: "action" });
    const x = createTask({ title: "x", phase: "action" });
    const b = createTask({ title: "b", phase: "action", blockedBy: [x.id] });
    expect(wouldCreateCycle(a.id, b.id, [a, b])).toBe(false);
  });
});
