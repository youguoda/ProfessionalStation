import { describe, expect, it } from "vitest";
import { createProject, createTask } from "@/lib/domain/factory";
import {
  blockedIdSet,
  byOrderThenPriority,
  daysSince,
  doingCapacity,
  isBlocked,
  isImportant,
  isUrgent,
  needsWeeklyReview,
  quadrantOf,
  selectDoing,
  selectImportantNotUrgent,
  selectInbox,
  selectLog,
  selectNextActions,
  selectOverdue,
  selectReady,
  selectReviewStats,
  selectSettlement,
  selectSomeday,
  selectStaleDoing,
  selectStaleInbox,
  selectStaleSomeday,
  selectStaleWaiting,
  selectToday,
  selectTrash,
  selectUpcoming,
  selectWaiting,
  tasksForScope,
  todayCapacity,
  todayPlannedCount,
  waitingSince,
  wouldCreateCycle,
} from "./selectors";

const now = new Date(2025, 0, 8); // 2025-01-08（周三）
const TODAY = "2025-01-08";
const caps = { maxToday: 6, maxDoing: 3, staleDays: 7 };

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
    expect(selectWaiting(tasks).map((t) => t.title)).toEqual(["等"]);
    expect(selectSomeday(tasks).map((t) => t.title)).toEqual(["将"]);
    expect(selectTrash(tasks).map((t) => t.title)).toEqual(["废"]);
  });

  it("库存（下一步）不含已开始的任务，在制品单独一条线", () => {
    expect(selectNextActions(tasks).map((t) => t.title)).toEqual(["行"]);
    expect(selectDoing(tasks).map((t) => t.title)).toEqual(["做"]);
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

  it("已完成不紧急", () => {
    expect(
      isUrgent(createTask({ title: "x", phase: "action", status: "done", dueDate: "2025-01-09" }), now),
    ).toBe(false);
  });

  it("priority≤2 为重要", () => {
    expect(isImportant(createTask({ title: "x", priority: 1 }))).toBe(true);
    expect(isImportant(createTask({ title: "x", priority: 3 }))).toBe(false);
  });

  it("四象限归类", () => {
    expect(quadrantOf(createTask({ title: "x", phase: "action", priority: 1, dueDate: "2025-01-09" }), now)).toBe("q1");
    expect(quadrantOf(createTask({ title: "x", phase: "action", priority: 1, dueDate: null }), now)).toBe("q2");
    expect(quadrantOf(createTask({ title: "x", phase: "action", priority: 4, dueDate: "2025-01-09" }), now)).toBe("q3");
    expect(quadrantOf(createTask({ title: "x", phase: "action", priority: 4, dueDate: null }), now)).toBe("q4");
  });

  it("selectImportantNotUrgent 只取 Q2（周回顾的提醒项）", () => {
    const tasks = [
      createTask({ title: "q1", phase: "action", priority: 1, dueDate: "2025-01-09" }),
      createTask({ title: "q2", phase: "action", priority: 2, dueDate: null }),
      createTask({ title: "q4", phase: "action", priority: 4, dueDate: null }),
      createTask({ title: "已完成q2", phase: "action", status: "done", priority: 1 }),
    ];
    expect(selectImportantNotUrgent(tasks, now).map((t) => t.title)).toEqual(["q2"]);
  });
});

describe("selectToday：承诺，不是查询结果", () => {
  it("只取 plannedFor === 今天；截止日不再自动进入今日", () => {
    const tasks = [
      createTask({ title: "承诺今天", phase: "action", plannedFor: TODAY }),
      createTask({ title: "今天到期但没承诺", phase: "action", dueDate: TODAY }),
      createTask({ title: "无关", phase: "action" }),
    ];
    expect(selectToday(tasks, now).map((t) => t.title)).toEqual(["承诺今天"]);
  });

  it("进行中的排在承诺列表最前面，其余按优先级", () => {
    const tasks = [
      createTask({ title: "P1待办", phase: "action", plannedFor: TODAY, priority: 1 }),
      createTask({ title: "P4进行中", phase: "action", plannedFor: TODAY, priority: 4, status: "doing" }),
      createTask({ title: "P2待办", phase: "action", plannedFor: TODAY, priority: 2 }),
    ];
    expect(selectToday(tasks, now).map((t) => t.title)).toEqual([
      "P4进行中",
      "P1待办",
      "P2待办",
    ]);
  });

  it("逾期置顶，越久远越靠前，且不重复计入已承诺的那条", () => {
    const tasks = [
      createTask({ title: "承诺今天", phase: "action", plannedFor: TODAY }),
      createTask({ title: "逾期1天", phase: "action", dueDate: "2025-01-07" }),
      createTask({ title: "逾期3天", phase: "action", dueDate: "2025-01-05" }),
      createTask({ title: "逾期且已承诺", phase: "action", dueDate: "2025-01-06", plannedFor: TODAY }),
    ];
    const titles = selectToday(tasks, now).map((t) => t.title);
    expect(titles.slice(0, 2)).toEqual(["逾期3天", "逾期1天"]);
    expect(titles.filter((t) => t === "逾期且已承诺")).toHaveLength(1);
  });

  it("已完成/已取消不进今日", () => {
    const tasks = [
      createTask({ title: "done", phase: "action", status: "done", plannedFor: TODAY }),
      createTask({ title: "canceled", phase: "action", status: "canceled", plannedFor: TODAY }),
    ];
    expect(selectToday(tasks, now)).toEqual([]);
  });
});

describe("容量：Ivy Lee 与 WIP", () => {
  it("todayPlannedCount 不含逾期——逾期是历史欠账，不占今天的额度", () => {
    const tasks = [
      createTask({ title: "承诺", phase: "action", plannedFor: TODAY }),
      createTask({ title: "逾期", phase: "action", dueDate: "2025-01-01" }),
    ];
    expect(todayPlannedCount(tasks, now)).toBe(1);
    expect(selectToday(tasks, now)).toHaveLength(2);
  });

  it("todayCapacity 计算剩余额度与超额标记", () => {
    const under = Array.from({ length: 4 }, (_, i) =>
      createTask({ title: `t${i}`, phase: "action", plannedFor: TODAY }),
    );
    const c1 = todayCapacity(under, caps, now);
    expect(c1).toMatchObject({ used: 4, max: 6, remaining: 2, over: false });

    const over = Array.from({ length: 8 }, (_, i) =>
      createTask({ title: `t${i}`, phase: "action", plannedFor: TODAY }),
    );
    const c2 = todayCapacity(over, caps, now);
    expect(c2).toMatchObject({ used: 8, remaining: 0, over: true });
  });

  it("doingCapacity 统计在制品", () => {
    const tasks = [
      createTask({ title: "a", phase: "action", status: "doing" }),
      createTask({ title: "b", phase: "action", status: "doing" }),
      createTask({ title: "c", phase: "action", status: "todo" }),
    ];
    expect(doingCapacity(tasks, caps)).toMatchObject({ used: 2, max: 3, remaining: 1, over: false });
  });
});

describe("等待：计时与「戳一下」", () => {
  it("waitingSince 优先用最近一次戳的时间", () => {
    const t = createTask({ title: "等", phase: "waiting" });
    t.createdAt = "2024-12-01T00:00:00.000Z";
    expect(waitingSince(t)).toBe(t.createdAt);
    t.nudgedAt = "2025-01-06T00:00:00.000Z";
    expect(waitingSince(t)).toBe(t.nudgedAt);
  });

  it("daysSince 计算过去天数，null 记 0", () => {
    expect(daysSince(null, now)).toBe(0);
    expect(daysSince("2025-01-01T00:00:00.000Z", now)).toBeGreaterThanOrEqual(6);
  });
});

describe("停滞检测与结算台", () => {
  function staleSet() {
    const doing = createTask({ title: "拖了很久的活", phase: "action", status: "doing" });
    doing.startedAt = "2024-12-20T00:00:00.000Z";
    const freshDoing = createTask({ title: "刚开始", phase: "action", status: "doing" });
    freshDoing.startedAt = "2025-01-07T00:00:00.000Z";
    const waiting = createTask({ title: "等报价", phase: "waiting" });
    waiting.createdAt = "2024-12-01T00:00:00.000Z";
    const inbox = createTask({ title: "很久没澄清", phase: "inbox" });
    inbox.createdAt = "2024-12-01T00:00:00.000Z";
    const someday = createTask({ title: "学 Rust", phase: "someday" });
    someday.updatedAt = "2024-06-01T00:00:00.000Z";
    return { doing, freshDoing, waiting, inbox, someday };
  }

  it("分别识别在制/等待/收件箱/将来的停滞条目", () => {
    const s = staleSet();
    const all = Object.values(s);
    expect(selectStaleDoing(all, 7, now).map((t) => t.title)).toEqual(["拖了很久的活"]);
    expect(selectStaleWaiting(all, 7, now).map((t) => t.title)).toEqual(["等报价"]);
    expect(selectStaleInbox(all, now).map((t) => t.title)).toEqual(["很久没澄清"]);
    expect(selectStaleSomeday(all, 90, now).map((t) => t.title)).toEqual(["学 Rust"]);
  });

  it("selectSettlement 汇总所有需要做决定的条目，并带上原因", () => {
    const s = staleSet();
    const items = selectSettlement(Object.values(s), caps, now);
    expect(items.map((i) => i.kind)).toEqual(["doing", "waiting", "inbox", "someday"]);
    expect(items.every((i) => i.reason.length > 0)).toBe(true);
    expect(items.map((i) => i.task.title)).not.toContain("刚开始");
  });

  it("干净的系统没有待结算条目", () => {
    const tasks = [createTask({ title: "正常", phase: "action" })];
    expect(selectSettlement(tasks, caps, now)).toEqual([]);
  });
});

describe("selectOverdue / selectUpcoming / selectLog", () => {
  it("超期 = 截止日期早于今天且未完成", () => {
    const tasks = [
      createTask({ title: "over", phase: "action", dueDate: "2025-01-07" }),
      createTask({ title: "today", phase: "action", dueDate: TODAY }),
      createTask({ title: "done", phase: "action", status: "done", dueDate: "2025-01-07" }),
    ];
    expect(selectOverdue(tasks, now).map((t) => t.title)).toEqual(["over"]);
  });

  it("Upcoming 覆盖今天之后的 7 天，承诺日优先于截止日", () => {
    const tasks = [
      createTask({ title: "明天承诺", phase: "action", plannedFor: "2025-01-09" }),
      createTask({ title: "第七天截止", phase: "action", dueDate: "2025-01-15" }),
      createTask({ title: "第八天", phase: "action", dueDate: "2025-01-16" }),
      createTask({ title: "今天", phase: "action", plannedFor: TODAY }),
      createTask({ title: "超期", phase: "action", dueDate: "2025-01-07" }),
    ];
    expect(selectUpcoming(tasks, now).map((t) => t.title)).toEqual(["明天承诺", "第七天截止"]);
  });

  it("selectLog 按完成时间倒序，且包含已取消（取消也是终局）", () => {
    const a = createTask({ title: "a", phase: "action", status: "done" });
    a.completedAt = "2025-01-01T10:00:00.000Z";
    const b = createTask({ title: "b", phase: "action", status: "canceled" });
    b.completedAt = "2025-01-02T10:00:00.000Z";
    const c = createTask({ title: "c", phase: "action", status: "todo" });
    expect(selectLog([a, b, c]).map((t) => t.title)).toEqual(["b", "a"]);
  });
});

describe("selectReviewStats", () => {
  it("统计本周吞吐、停滞与无下一步行动的项目", () => {
    const p1 = createProject({ name: "P1" });
    const p2 = createProject({ name: "P2" });
    const p3 = createProject({ name: "P3", archived: true });

    const doneThisWeek = createTask({ title: "done", phase: "action", status: "done" });
    doneThisWeek.completedAt = "2025-01-06T10:00:00.000Z";
    const canceledThisWeek = createTask({ title: "cancel", phase: "action", status: "canceled" });
    canceledThisWeek.completedAt = "2025-01-06T10:00:00.000Z";
    const doneLongAgo = createTask({ title: "old", phase: "action", status: "done" });
    doneLongAgo.completedAt = "2024-11-01T10:00:00.000Z";
    doneLongAgo.createdAt = "2024-11-01T10:00:00.000Z";

    const stale = createTask({ title: "stale", phase: "inbox" });
    stale.createdAt = "2024-12-01T00:00:00.000Z";

    const tasks = [
      doneThisWeek,
      canceledThisWeek,
      doneLongAgo,
      stale,
      createTask({ title: "over", phase: "action", dueDate: "2025-01-07" }),
      createTask({ title: "wait", phase: "waiting" }),
      createTask({ title: "doing", phase: "action", status: "doing" }),
      createTask({ title: "p2-action", phase: "action", status: "todo", projectId: p2.id }),
    ];

    const stats = selectReviewStats(tasks, [p1, p2, p3], now);
    expect(stats.completedThisWeek).toBe(1);
    expect(stats.canceledThisWeek).toBe(1);
    expect(stats.inboxStale).toBe(1);
    expect(stats.overdue).toBe(1);
    expect(stats.waitingCount).toBe(1);
    expect(stats.doing).toBe(1);
    expect(stats.projectsWithoutAction).toEqual(["P1"]);
  });

  it("total 不含回收站", () => {
    const tasks = [
      createTask({ title: "a", phase: "action" }),
      createTask({ title: "b", phase: "trash" }),
    ];
    expect(selectReviewStats(tasks, [], now).total).toBe(1);
  });
});

describe("tasksForScope", () => {
  it("按项目过滤，排除已完成与回收站", () => {
    const p = createProject({ name: "P" });
    const inP = createTask({ title: "项目任务", phase: "action", projectId: p.id });
    const doneInP = createTask({ title: "已完成", phase: "action", projectId: p.id, status: "done" });
    const out = createTask({ title: "无关", phase: "action" });
    expect(tasksForScope(`project:${p.id}`, [inP, doneInP, out]).map((t) => t.title)).toEqual([
      "项目任务",
    ]);
  });

  it("doing 范围返回在制品", () => {
    const tasks = [
      createTask({ title: "做", phase: "action", status: "doing" }),
      createTask({ title: "没做", phase: "action", status: "todo" }),
    ];
    expect(tasksForScope("doing", tasks).map((t) => t.title)).toEqual(["做"]);
  });

  it("未知范围返回空数组", () => {
    expect(tasksForScope("settings", [createTask({ title: "x" })])).toEqual([]);
  });
});

describe("needsWeeklyReview", () => {
  it("从未回顾或超 7 天需回顾", () => {
    expect(needsWeeklyReview([], now)).toBe(true);
    expect(needsWeeklyReview([{ date: "2024-12-31" }], now)).toBe(true);
    expect(needsWeeklyReview([{ date: "2025-01-05" }], now)).toBe(false);
  });
});

describe("排序", () => {
  it("byOrderThenPriority：priority 升序，再 order 升序", () => {
    const a = createTask({ title: "a", priority: 3 });
    a.order = 0;
    const b = createTask({ title: "b", priority: 1 });
    b.order = 5;
    const c = createTask({ title: "c", priority: 1 });
    c.order = 2;
    expect([a, b, c].sort(byOrderThenPriority).map((t) => t.title)).toEqual(["c", "b", "a"]);
  });
});

describe("isBlocked / selectReady", () => {
  it("依赖未完成则阻塞", () => {
    const dep = createTask({ title: "dep", phase: "action", status: "todo" });
    const t = createTask({ title: "a", phase: "action", blockedBy: [dep.id] });
    expect(isBlocked(t, [dep, t])).toBe(true);
  });

  it("依赖完成 / 缺失 / 在回收站均不阻塞", () => {
    const done = createTask({ title: "dep", phase: "action", status: "done" });
    const trashed = createTask({ title: "dep2", phase: "trash", status: "todo" });
    expect(isBlocked(createTask({ title: "a", phase: "action", blockedBy: [done.id] }), [done])).toBe(false);
    expect(isBlocked(createTask({ title: "a", phase: "action", blockedBy: ["missing"] }), [])).toBe(false);
    expect(isBlocked(createTask({ title: "a", phase: "action", blockedBy: [trashed.id] }), [trashed])).toBe(false);
  });

  it("selectReady 排除被阻塞的任务", () => {
    const dep = createTask({ title: "dep", phase: "action", status: "todo" });
    const blocked = createTask({ title: "blocked", phase: "action", blockedBy: [dep.id] });
    const ready = createTask({ title: "ready", phase: "action" });
    expect(selectReady([dep, blocked, ready]).map((t) => t.title)).toEqual(["dep", "ready"]);
  });

  it("blockedIdSet 一次性计算被阻塞集合", () => {
    const dep = createTask({ title: "dep", phase: "action", status: "todo" });
    const blocked = createTask({ title: "blocked", phase: "action", blockedBy: [dep.id] });
    const ready = createTask({ title: "ready", phase: "action" });
    const set = blockedIdSet([dep, blocked, ready]);
    expect(set.has(blocked.id)).toBe(true);
    expect(set.has(ready.id)).toBe(false);
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
});
