import type { Priority, Project, ScopeId, Settings, Task } from "@/lib/domain/types";

/**
 * 视图投影（纯函数）：把统一的任务数据投影为各视图所需的数据。
 * 所有视图只读取投影，不修改状态。
 */

export interface MatrixQuadrant {
  key: "q1" | "q2" | "q3" | "q4";
  label: string;
  hint: string;
  tasks: Task[];
}

const DAY = 24 * 60 * 60 * 1000;

export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysUntil(dueDate: string | null, now: Date): number {
  if (!dueDate) return Infinity;
  const d = new Date(dueDate + "T00:00:00");
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return (d.getTime() - today.getTime()) / DAY;
}

/** 距离某个 ISO 时间戳过去了几天（向下取整） */
export function daysSince(iso: string | null, now: Date = new Date()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY));
}

/** 未完成的可行动任务（所有列表的公共基底） */
function open(tasks: Task[]): Task[] {
  return tasks.filter(
    (t) => t.phase === "action" && t.status !== "done" && t.status !== "canceled",
  );
}

/** 紧急：有截止日期且 7 天内到期（含已超期） */
export function isUrgent(task: Task, now: Date): boolean {
  if (task.status === "done" || task.status === "canceled") return false;
  if (!task.dueDate) return false;
  return daysUntil(task.dueDate, now) <= 7;
}

/** 重要：priority <= 2 */
export function isImportant(task: Task): boolean {
  return task.priority <= 2;
}

export function quadrantOf(task: Task, now: Date): MatrixQuadrant["key"] {
  const urgent = isUrgent(task, now);
  const important = isImportant(task);
  if (important && urgent) return "q1";
  if (important && !urgent) return "q2";
  if (!important && urgent) return "q3";
  return "q4";
}

/**
 * 重要但不紧急（Q2）——最容易被挤掉的一类。
 * 四象限不再是日常视图，只在周回顾里作为一个提醒出现。
 */
export function selectImportantNotUrgent(tasks: Task[], now: Date = new Date()): Task[] {
  return open(tasks)
    .filter((t) => quadrantOf(t, now) === "q2")
    .sort(byOrderThenPriority);
}

export function selectInbox(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.phase === "inbox");
}

/** 库存：所有可执行的下一步（不含已开始的） */
export function selectNextActions(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.phase === "action" && t.status === "todo");
}

/** 在制品：正在做的事。有全局上限。 */
export function selectDoing(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.phase === "action" && t.status === "doing")
    .sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
}

export function selectWaiting(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.phase === "waiting" && t.status !== "done" && t.status !== "canceled")
    .sort((a, b) => waitingSince(a).localeCompare(waitingSince(b)));
}

/** 等待项的计时起点：最近一次「戳一下」，否则是创建时间 */
export function waitingSince(task: Task): string {
  return task.nudgedAt ?? task.createdAt;
}

export function selectSomeday(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.phase === "someday");
}

export function selectTrash(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.phase === "trash");
}

/**
 * 今天 = 我**承诺**今天做的事（plannedFor）+ 逾期置顶。
 * 注意：不再从 dueDate 自动推导——dueDate 是世界的要求，plannedFor 才是我的承诺。
 */
export function selectToday(tasks: Task[], now: Date = new Date()): Task[] {
  const todayStr = isoDay(now);
  const actionable = open(tasks);
  const planned = actionable.filter((t) => t.plannedFor === todayStr);
  const plannedIds = new Set(planned.map((t) => t.id));
  const overdue = actionable.filter(
    (t) => t.dueDate !== null && t.dueDate < todayStr && !plannedIds.has(t.id),
  );
  const overdueSorted = overdue.sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
  // 进行中的排在承诺列表最前面
  const plannedSorted = planned.sort((a, b) => {
    const ad = a.status === "doing" ? 0 : 1;
    const bd = b.status === "doing" ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return byOrderThenPriority(a, b);
  });
  return [...overdueSorted, ...plannedSorted];
}

/** 今天已承诺的条数（不含逾期——逾期是历史欠账，不占今天的额度） */
export function todayPlannedCount(tasks: Task[], now: Date = new Date()): number {
  const todayStr = isoDay(now);
  return open(tasks).filter((t) => t.plannedFor === todayStr).length;
}

export interface Capacity {
  used: number;
  max: number;
  remaining: number;
  over: boolean;
}

/** 今日容量（Ivy Lee：默认 6 条） */
export function todayCapacity(
  tasks: Task[],
  settings: Pick<Settings, "maxToday">,
  now: Date = new Date(),
): Capacity {
  const used = todayPlannedCount(tasks, now);
  const max = settings.maxToday;
  return { used, max, remaining: Math.max(0, max - used), over: used > max };
}

/** 在制品容量（WIP：默认 3 个） */
export function doingCapacity(
  tasks: Task[],
  settings: Pick<Settings, "maxDoing">,
): Capacity {
  const used = selectDoing(tasks).length;
  const max = settings.maxDoing;
  return { used, max, remaining: Math.max(0, max - used), over: used > max };
}

export function selectOverdue(tasks: Task[], now: Date = new Date()): Task[] {
  const todayStr = isoDay(now);
  return open(tasks)
    .filter((t) => t.dueDate !== null && t.dueDate < todayStr)
    .sort(byOrderThenPriority);
}

/** 未来 7 天：截止或已承诺落在 (今天, 今天+7] 的任务 */
export function selectUpcoming(tasks: Task[], now: Date = new Date()): Task[] {
  const today = isoDay(now);
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  const endStr = isoDay(end);
  return open(tasks)
    .filter((t) => {
      const d = upcomingDay(t);
      return d !== null && d > today && d <= endStr;
    })
    .sort((a, b) => (upcomingDay(a)! < upcomingDay(b)! ? -1 : 1));
}

/** Upcoming 的分组日期：优先承诺日，其次截止日 */
export function upcomingDay(task: Task): string | null {
  return task.plannedFor ?? task.dueDate ?? task.scheduledAt?.slice(0, 10) ?? null;
}

/** 已完成日志：按完成时间倒序（含已取消，取消也是一种终局） */
export function selectLog(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.status === "done" || t.status === "canceled")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
}

/** 是否需要周回顾：最近一次回顾距今已 7 天（或从未回顾） */
export function needsWeeklyReview(
  reviews: Array<{ date: string }>,
  now: Date = new Date(),
): boolean {
  const dates = reviews.map((r) => r.date).sort();
  const last = dates[dates.length - 1];
  if (!last) return true;
  const lastMs = new Date(last + "T00:00:00Z").getTime();
  const todayMs = new Date(isoDay(now) + "T00:00:00Z").getTime();
  return (todayMs - lastMs) / DAY >= 7;
}

// ---- 结算（周回顾）----

/** 停滞的在制品：开始超过 staleDays 天还没结束 */
export function selectStaleDoing(
  tasks: Task[],
  staleDays: number,
  now: Date = new Date(),
): Task[] {
  return selectDoing(tasks).filter((t) => daysSince(t.startedAt, now) >= staleDays);
}

/** 停滞的等待项：超过 staleDays 天没被戳过 */
export function selectStaleWaiting(
  tasks: Task[],
  staleDays: number,
  now: Date = new Date(),
): Task[] {
  return selectWaiting(tasks).filter((t) => daysSince(waitingSince(t), now) >= staleDays);
}

/** 长期没动的「将来/也许」：默认 90 天 */
export function selectStaleSomeday(
  tasks: Task[],
  days = 90,
  now: Date = new Date(),
): Task[] {
  return selectSomeday(tasks).filter((t) => daysSince(t.updatedAt, now) >= days);
}

/** 收件箱滞留：捕获超过 7 天还没澄清 */
export function selectStaleInbox(tasks: Task[], now: Date = new Date()): Task[] {
  return selectInbox(tasks).filter((t) => daysSince(t.createdAt, now) >= 7);
}

export interface SettlementItem {
  task: Task;
  kind: "doing" | "waiting" | "someday" | "inbox";
  reason: string;
}

/**
 * 「需要你结算的」——周回顾的核心。
 * 每一条都必须做一个决定，不提供「稍后再说」。
 */
export function selectSettlement(
  tasks: Task[],
  settings: Pick<Settings, "staleDays">,
  now: Date = new Date(),
): SettlementItem[] {
  const staleDays = settings.staleDays;
  const items: SettlementItem[] = [];
  for (const t of selectStaleDoing(tasks, staleDays, now)) {
    items.push({ task: t, kind: "doing", reason: `进行中 ${daysSince(t.startedAt, now)} 天` });
  }
  for (const t of selectStaleWaiting(tasks, staleDays, now)) {
    items.push({
      task: t,
      kind: "waiting",
      reason: `等待 ${daysSince(waitingSince(t), now)} 天`,
    });
  }
  for (const t of selectStaleInbox(tasks, now)) {
    items.push({ task: t, kind: "inbox", reason: `滞留 ${daysSince(t.createdAt, now)} 天未澄清` });
  }
  for (const t of selectStaleSomeday(tasks, 90, now)) {
    items.push({ task: t, kind: "someday", reason: `${daysSince(t.updatedAt, now)} 天没动过` });
  }
  return items;
}

export interface ReviewStats {
  completedThisWeek: number;
  canceledThisWeek: number;
  createdThisWeek: number;
  inboxStale: number;
  overdue: number;
  waitingCount: number;
  doing: number;
  total: number;
  projectsWithoutAction: string[];
}

export function selectReviewStats(
  tasks: Task[],
  projects: Project[],
  now: Date = new Date(),
): ReviewStats {
  const weekAgo = now.getTime() - 7 * DAY;
  const inWeek = (iso: string | null) =>
    iso !== null && new Date(iso).getTime() >= weekAgo;

  return {
    completedThisWeek: tasks.filter((t) => t.status === "done" && inWeek(t.completedAt)).length,
    canceledThisWeek: tasks.filter((t) => t.status === "canceled" && inWeek(t.completedAt)).length,
    createdThisWeek: tasks.filter((t) => inWeek(t.createdAt)).length,
    inboxStale: selectStaleInbox(tasks, now).length,
    overdue: selectOverdue(tasks, now).length,
    waitingCount: selectWaiting(tasks).length,
    doing: selectDoing(tasks).length,
    total: tasks.filter((t) => t.phase !== "trash").length,
    projectsWithoutAction: projects
      .filter((p) => !p.archived)
      .filter(
        (p) => !tasks.some((t) => t.projectId === p.id && t.phase === "action" && t.status === "todo"),
      )
      .map((p) => p.name),
  };
}

// ---- 范围投影 ----

/** 范围 → 任务列表 */
export function tasksForScope(
  scope: ScopeId,
  tasks: Task[],
  now: Date = new Date(),
): Task[] {
  switch (scope) {
    case "inbox":
      return selectInbox(tasks);
    case "today":
      return selectToday(tasks, now);
    case "doing":
      return selectDoing(tasks);
    case "upcoming":
      return selectUpcoming(tasks, now);
    case "anytime":
      return selectNextActions(tasks);
    case "waiting":
      return selectWaiting(tasks);
    case "someday":
      return selectSomeday(tasks);
    case "trash":
      return selectTrash(tasks);
    default:
      break;
  }
  if (scope.startsWith("project:")) {
    const id = scope.slice("project:".length);
    return tasks.filter(
      (t) =>
        t.projectId === id &&
        t.phase !== "trash" &&
        t.status !== "done" &&
        t.status !== "canceled",
    );
  }
  if (scope.startsWith("area:")) {
    const id = scope.slice("area:".length);
    return tasks.filter(
      (t) =>
        t.areaId === id &&
        t.phase !== "trash" &&
        t.status !== "done" &&
        t.status !== "canceled",
    );
  }
  return [];
}

export function byOrderThenPriority(a: Task, b: Task): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.order - b.order;
}

export function priorityOf(task: Task): Priority {
  return task.priority;
}

/** 依赖判断：任务是否被未完成的依赖阻塞 */
export function isBlocked(task: Task, tasks: Task[]): boolean {
  if (task.blockedBy.length === 0) return false;
  return task.blockedBy.some((id) => {
    const dep = tasks.find((t) => t.id === id);
    if (!dep) return false;
    return dep.phase !== "trash" && dep.status !== "done" && dep.status !== "canceled";
  });
}

/** 一次性计算所有被阻塞任务的 id 集合（供列表容器下发，避免每个 TaskItem O(n) 扫描） */
export function blockedIdSet(tasks: Task[]): Set<string> {
  const active = new Set(
    tasks
      .filter((t) => t.phase !== "trash" && t.status !== "done" && t.status !== "canceled")
      .map((t) => t.id),
  );
  const blocked = new Set<string>();
  for (const t of tasks) {
    if (t.blockedBy.some((id) => active.has(id))) blocked.add(t.id);
  }
  return blocked;
}

/** 可执行的下一步行动（排除被阻塞的） */
export function selectReady(tasks: Task[]): Task[] {
  return selectNextActions(tasks).filter((t) => !isBlocked(t, tasks));
}

/**
 * 依赖成环检测：若把 depId 加入 taskId 的 blockedBy，是否形成环。
 */
export function wouldCreateCycle(taskId: string, depId: string, tasks: Task[]): boolean {
  if (taskId === depId) return true;
  const visited = new Set<string>();
  const stack = [depId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const t = tasks.find((x) => x.id === cur);
    if (t) for (const next of t.blockedBy) stack.push(next);
  }
  return false;
}
