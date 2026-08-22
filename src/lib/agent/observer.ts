import type { Project, Settings, Task } from "@/lib/domain/types";
import {
  daysSince,
  isoDay,
  selectDoing,
  selectInbox,
  selectNextActions,
  selectWaiting,
  todayPlannedCount,
  waitingSince,
} from "@/lib/engine/selectors";

/**
 * 教练层的「观察」环节（纯函数，不调用 LLM）。
 *
 * 个人效率的难点全在**你不会开口的时刻**：连着五天把同一件事推到明天、
 * 等待里挂了三周、这周排了 40 小时完成了 12 小时。这些时候你不会去问 AI，
 * 所以 AI 必须自己出现。
 *
 * 设计红线：罕见、可关、一句话，一天最多一次。
 * 因此这里只负责**找出所有成立的模式并排序**，由调用方取第一条。
 */

export type NudgeKind =
  | "emptyToday"
  | "overcommit"
  | "noStart"
  | "wipOver"
  | "staleDoing"
  | "staleWaiting"
  | "repeatedlyDeferred"
  | "deadlineNoAction"
  | "zeroCompletion"
  | "throughputGap"
  | "inboxPileup";

export interface Observation {
  /** 稳定 id：同一天同一主体只会生成一次 */
  id: string;
  kind: NudgeKind;
  /** 越大越优先，只有第一条会被说出来 */
  severity: number;
  /** 给 LLM 的客观事实（不带语气） */
  evidence: string;
  /** 未配置 AI 时的兜底文案（已经是马力的语气） */
  fallback: string;
  taskId: string | null;
}

export interface ObserveInput {
  tasks: Task[];
  projects: Project[];
  settings: Pick<Settings, "maxToday" | "maxDoing" | "staleDays">;
  now?: Date;
}

/** 某天的完成数（含取消——取消也是一种了结） */
function endedOn(tasks: Task[], day: string): number {
  return tasks.filter(
    (t) =>
      (t.status === "done" || t.status === "canceled") &&
      (t.completedAt ?? "").slice(0, 10) === day,
  ).length;
}

/** 一条任务被反复推迟的次数：活动历史里「承诺某天做」出现过几次 */
export function deferCount(task: Task): number {
  return (task.history ?? []).filter((h) => h.label.startsWith("承诺")).length;
}

export function observe(input: ObserveInput): Observation[] {
  const now = input.now ?? new Date();
  const { tasks, projects, settings } = input;
  const today = isoDay(now);
  const hour = now.getHours();

  const out: Observation[] = [];
  const open = tasks.filter(
    (t) => t.phase === "action" && t.status !== "done" && t.status !== "canceled",
  );
  const doing = selectDoing(tasks);
  const waiting = selectWaiting(tasks);
  const inbox = selectInbox(tasks);
  const next = selectNextActions(tasks);
  const planned = todayPlannedCount(tasks, now);
  const doneToday = endedOn(tasks, today);

  // 1) 早上打开，今天一条都没承诺，但库存里有活
  if (hour < 12 && planned === 0 && next.length > 0) {
    out.push({
      id: `emptyToday:${today}`,
      kind: "emptyToday",
      severity: 40,
      evidence: `今天还没承诺任何事，库存里有 ${next.length} 条可做的下一步。`,
      fallback: `今天一条都没排。库存里躺着 ${next.length} 条，你打算靠它们自己长腿跑过来吗？`,
      taskId: null,
    });
  }

  // 2) 超额承诺
  if (planned > settings.maxToday) {
    out.push({
      id: `overcommit:${today}`,
      kind: "overcommit",
      severity: 70,
      evidence: `今天承诺了 ${planned} 条，自己设的上限是 ${settings.maxToday} 条。`,
      fallback: `今天排了 ${planned} 条，你自己定的上限是 ${settings.maxToday}。定规则的和破规则的是同一个人，这事你不觉得有点尴尬？`,
      taskId: null,
    });
  }

  // 3) 下午了，承诺了一堆，一件没开始也没完成
  if (hour >= 14 && planned > 0 && doing.length === 0 && doneToday === 0) {
    out.push({
      id: `noStart:${today}`,
      kind: "noStart",
      severity: 75,
      evidence: `今天承诺了 ${planned} 条，已经 ${hour} 点了，一件没开始也没完成。`,
      fallback: `${hour} 点了，今天承诺的 ${planned} 条一件没动。是任务太难，还是列清单本身就已经让你有成就感了？`,
      taskId: null,
    });
  }

  // 4) 在制品超上限
  if (doing.length > settings.maxDoing) {
    out.push({
      id: `wipOver:${today}`,
      kind: "wipOver",
      severity: 80,
      evidence: `同时进行 ${doing.length} 件，上限是 ${settings.maxDoing} 件。`,
      fallback: `同时开着 ${doing.length} 件。你不是在并行，你是在把每一件都做慢。`,
      taskId: null,
    });
  }

  // 5) 某件事开始很久还没结束
  const stuck = doing
    .map((t) => ({ t, d: daysSince(t.startedAt, now) }))
    .filter((x) => x.d >= settings.staleDays)
    .sort((a, b) => b.d - a.d)[0];
  if (stuck) {
    out.push({
      id: `staleDoing:${stuck.t.id}:${today}`,
      kind: "staleDoing",
      severity: 85,
      evidence: `「${stuck.t.title}」已经进行 ${stuck.d} 天还没结束。`,
      fallback: `「${stuck.t.title}」开工 ${stuck.d} 天了。它到底是在做，还是只是没被你正式承认已经放弃？`,
      taskId: stuck.t.id,
    });
  }

  // 6) 等待挂太久没戳
  const cold = waiting
    .map((t) => ({ t, d: daysSince(waitingSince(t), now) }))
    .filter((x) => x.d >= settings.staleDays)
    .sort((a, b) => b.d - a.d)[0];
  if (cold) {
    out.push({
      id: `staleWaiting:${cold.t.id}:${today}`,
      kind: "staleWaiting",
      severity: 60,
      evidence: `「${cold.t.title}」已经等了 ${cold.d} 天没有跟进。`,
      fallback: `「${cold.t.title}」等了 ${cold.d} 天。等待不是策略，是你把责任外包给了别人的记性。`,
      taskId: cold.t.id,
    });
  }

  // 7) 同一件事被反复推迟——这通常不是任务，是心结
  const deferred = open
    .map((t) => ({ t, n: deferCount(t) }))
    .filter((x) => x.n >= 3)
    .sort((a, b) => b.n - a.n)[0];
  if (deferred) {
    out.push({
      id: `deferred:${deferred.t.id}:${today}`,
      kind: "repeatedlyDeferred",
      severity: 90,
      evidence: `「${deferred.t.title}」已经被排进「今天」${deferred.n} 次，一次都没做完。`,
      fallback: `「${deferred.t.title}」你排了 ${deferred.n} 次今天。这已经不是任务了，是心结。要么现在拆开，要么承认你不想做。`,
      taskId: deferred.t.id,
    });
  }

  // 8) 项目截止在即但没有下一步行动
  for (const p of projects.filter((x) => !x.archived && x.deadline)) {
    const left = Math.round(
      (new Date(p.deadline + "T00:00:00").getTime() -
        new Date(today + "T00:00:00").getTime()) /
        86400000,
    );
    if (left < 0 || left > 3) continue;
    const hasNext = tasks.some(
      (t) => t.projectId === p.id && t.phase === "action" && t.status === "todo",
    );
    if (hasNext) continue;
    out.push({
      id: `deadline:${p.id}:${today}`,
      kind: "deadlineNoAction",
      severity: 95,
      evidence: `项目「${p.name}」还有 ${left} 天截止，但一条下一步行动都没有。`,
      fallback: `「${p.name}」还有 ${left} 天到期，下一步行动是零条。祝贺你，你把项目管理简化成了许愿。`,
      taskId: null,
    });
  }

  // 9) 一周颗粒无收
  const endedThisWeek = tasks.filter(
    (t) =>
      (t.status === "done" || t.status === "canceled") &&
      t.completedAt !== null &&
      now.getTime() - new Date(t.completedAt).getTime() <= 7 * 86400000,
  ).length;
  if (endedThisWeek === 0 && open.length >= 3) {
    out.push({
      id: `zeroCompletion:${today}`,
      kind: "zeroCompletion",
      severity: 88,
      evidence: `最近 7 天一条任务都没有结束，手上还有 ${open.length} 条未完成。`,
      fallback: `七天，零结束，${open.length} 条挂着。这个系统现在唯一的功能是提醒你有多少事没做。`,
      taskId: null,
    });
  }

  // 10) 进得比出得多
  const createdThisWeek = tasks.filter(
    (t) => now.getTime() - new Date(t.createdAt).getTime() <= 7 * 86400000,
  ).length;
  if (createdThisWeek >= 5 && createdThisWeek > endedThisWeek * 2 && endedThisWeek > 0) {
    out.push({
      id: `throughputGap:${today}`,
      kind: "throughputGap",
      severity: 50,
      evidence: `本周新建 ${createdThisWeek} 条，只结束了 ${endedThisWeek} 条。`,
      fallback: `本周进 ${createdThisWeek} 出 ${endedThisWeek}。照这个比例，你的收件箱会比你活得久。`,
      taskId: null,
    });
  }

  // 11) 收件箱堆积
  if (inbox.length >= 10) {
    out.push({
      id: `inbox:${today}`,
      kind: "inboxPileup",
      severity: 45,
      evidence: `收件箱堆了 ${inbox.length} 条没澄清。`,
      fallback: `收件箱 ${inbox.length} 条。捕获很爽是吧？澄清才是要付的账。`,
      taskId: null,
    });
  }

  return out.sort((a, b) => b.severity - a.severity);
}

/** 取当下最该说的那一条；没有就返回 null（大多数日子应该是 null） */
export function topObservation(input: ObserveInput): Observation | null {
  return observe(input)[0] ?? null;
}
