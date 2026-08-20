import type { Priority, Project, Settings, Task } from "@/lib/domain/types";

/**
 * 视图投影（纯函数）：把统一的任务数据投影为各方法论视图所需的数据。
 * 所有视图只读取投影，不修改状态。
 */

export interface KanbanColumn {
  status: Task["status"];
  tasks: Task[];
  wip: number;
}

export interface MatrixQuadrant {
  key: "q1" | "q2" | "q3" | "q4";
  label: string;
  hint: string;
  tasks: Task[];
}

const DAY = 24 * 60 * 60 * 1000;

function daysUntil(dueDate: string | null, now: Date): number {
  if (!dueDate) return Infinity;
  const d = new Date(dueDate + "T23:59:59");
  return (d.getTime() - now.getTime()) / DAY;
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

export function selectInbox(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.phase === "inbox");
}

export function selectNextActions(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.phase === "action" && t.status === "todo");
}

export function selectWaiting(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.phase === "waiting");
}

export function selectSomeday(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.phase === "someday");
}

export function selectTrash(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.phase === "trash");
}

export function selectKanban(tasks: Task[], settings: Settings): KanbanColumn[] {
  const order: Task["status"][] = ["todo", "doing", "done", "canceled"];
  return order.map((status) => {
    const list = tasks
      .filter((t) => t.phase === "action" && t.status === status)
      .sort(byOrderThenPriority);
    return { status, tasks: list, wip: settings.kanbanWip[status] ?? -1 };
  });
}

export function selectMatrix(tasks: Task[], now: Date = new Date()): MatrixQuadrant[] {
  const actionable = tasks.filter(
    (t) => t.phase === "action" && t.status !== "done" && t.status !== "canceled",
  );
  const buckets: Record<MatrixQuadrant["key"], Task[]> = { q1: [], q2: [], q3: [], q4: [] };
  for (const t of actionable) buckets[quadrantOf(t, now)].push(t);
  return [
    { key: "q1", label: "重要且紧急", hint: "立即做", tasks: buckets.q1.sort(byOrderThenPriority) },
    { key: "q2", label: "重要不紧急", hint: "排期做", tasks: buckets.q2.sort(byOrderThenPriority) },
    { key: "q3", label: "紧急不重要", hint: "委派/简化", tasks: buckets.q3.sort(byOrderThenPriority) },
    { key: "q4", label: "不紧急不重要", hint: "删除", tasks: buckets.q4.sort(byOrderThenPriority) },
  ];
}

export function selectToday(tasks: Task[], now: Date = new Date()): Task[] {
  const todayStr = isoDay(now);
  return tasks
    .filter((t) => t.phase === "action" && t.status !== "done" && t.status !== "canceled")
    .filter((t) => t.dueDate === todayStr || t.startDate === todayStr || t.isFrog)
    .sort(byFrogThenPriority);
}

export function selectOverdue(tasks: Task[], now: Date = new Date()): Task[] {
  const todayStr = isoDay(now);
  return tasks
    .filter((t) => t.phase === "action" && t.status !== "done" && t.status !== "canceled")
    .filter((t) => t.dueDate !== null && t.dueDate < todayStr)
    .sort(byOrderThenPriority);
}

export function selectReviewStats(
  tasks: Task[],
  projects: Project[],
  now: Date = new Date(),
) {
  const SEVEN_DAYS = 7 * DAY;
  const inboxStale = tasks.filter(
    (t) => t.phase === "inbox" && now.getTime() - new Date(t.createdAt).getTime() > SEVEN_DAYS,
  ).length;
  const overdue = selectOverdue(tasks, now).length;
  const projectsWithoutAction = projects
    .filter((p) => !p.archived)
    .filter((p) => !tasks.some((t) => t.projectId === p.id && t.phase === "action" && t.status === "todo"))
    .map((p) => p.name);
  const waitingCount = tasks.filter((t) => t.phase === "waiting").length;
  return { inboxStale, overdue, projectsWithoutAction, waitingCount, total: tasks.length };
}

export function byOrderThenPriority(a: Task, b: Task): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.order - b.order;
}

export function byFrogThenPriority(a: Task, b: Task): number {
  if (a.isFrog !== b.isFrog) return a.isFrog ? -1 : 1;
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.order - b.order;
}

export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

/** 可执行的下一步行动（排除被阻塞的） */
export function selectReady(tasks: Task[]): Task[] {
  return tasks.filter(
    (t) => t.phase === "action" && t.status === "todo" && !isBlocked(t, tasks),
  );
}
