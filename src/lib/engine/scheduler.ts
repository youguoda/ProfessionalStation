import type { Task } from "@/lib/domain/types";
import { isoDay } from "./selectors";

/**
 * 启发式智能排期（纯函数，确定性）。
 * 规则：候选任务按「优先级升序 → 努力值降序 → order」排序，
 * 依次分配到一周内的空闲小时槽（避开已有排期），每天最多 maxPerDay 个。
 */

export interface SlotSuggestion {
  taskId: string;
  scheduledAt: string;
}

export interface ScheduleOptions {
  /** 可选小时槽，默认 9-11 点与 14-17 点 */
  hours?: number[];
  /** 每天最多排几个，默认 3 */
  maxPerDay?: number;
  /** 是否包含周末，默认仅工作日 */
  includeWeekend?: boolean;
}

export function suggestSchedule(
  tasks: Task[],
  weekStart: Date,
  opts: ScheduleOptions = {},
): SlotSuggestion[] {
  const hours = opts.hours ?? [9, 10, 11, 14, 15, 16, 17];
  const maxPerDay = opts.maxPerDay ?? 3;
  const includeWeekend = opts.includeWeekend ?? false;

  const candidates = tasks
    .filter(
      (t) =>
        t.phase === "action" &&
        t.status !== "done" &&
        t.status !== "canceled" &&
        !t.scheduledAt,
    )
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const ea = a.effort ?? 1;
      const eb = b.effort ?? 1;
      if (ea !== eb) return eb - ea;
      return a.order - b.order;
    });

  // 已有排期占用的槽位
  const busy = new Map<string, Set<number>>();
  for (const t of tasks) {
    if (!t.scheduledAt) continue;
    const day = t.scheduledAt.slice(0, 10);
    const hour = Number(t.scheduledAt.slice(11, 13));
    if (!busy.has(day)) busy.set(day, new Set());
    busy.get(day)!.add(hour);
  }

  const dayCount = includeWeekend ? 7 : 5;
  const days = Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return isoDay(d);
  });

  const used = new Map<string, Set<number>>();
  const suggestions: SlotSuggestion[] = [];

  outer: for (const t of candidates) {
    for (const day of days) {
      if ((used.get(day)?.size ?? 0) >= maxPerDay) continue;
      const dayUsed = used.get(day) ?? new Set<number>();
      const dayBusy = busy.get(day) ?? new Set<number>();
      const hour = hours.find((h) => !dayUsed.has(h) && !dayBusy.has(h));
      if (hour === undefined) continue;
      dayUsed.add(hour);
      used.set(day, dayUsed);
      suggestions.push({
        taskId: t.id,
        scheduledAt: `${day}T${String(hour).padStart(2, "0")}:00:00`,
      });
      continue outer;
    }
  }

  return suggestions;
}
