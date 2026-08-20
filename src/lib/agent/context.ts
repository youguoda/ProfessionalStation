import type { Db, Task } from "@/lib/domain/types";
import {
  isoDay,
  selectInbox,
  selectNextActions,
  selectOverdue,
  selectReviewStats,
  selectToday,
  selectWaiting,
} from "@/lib/engine/selectors";

/**
 * 把用户的计划数据压缩成注入给马力的上下文（纯函数，控制 token 预算）。
 */

const MAX = 8;

function taskLine(t: Task): string {
  const due = t.dueDate ? `，截止 ${t.dueDate}` : "";
  return `[id=${t.id}] ${t.title}（P${t.priority}${due}）`;
}

export function buildAgentContext(db: Db, now: Date = new Date()): string {
  const today = selectToday(db.tasks, now);
  const next = selectNextActions(db.tasks);
  const overdue = selectOverdue(db.tasks, now);
  const waiting = selectWaiting(db.tasks);
  const inbox = selectInbox(db.tasks);
  const stats = selectReviewStats(db.tasks, db.projects, now);

  const dayKeys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - i));
    return isoDay(d);
  });
  const habitLines = db.habits.map((h) => {
    const checked = dayKeys.filter((d) =>
      db.habitChecks.some((c) => c.habitId === h.id && c.date === d),
    ).length;
    return `${h.name} ${checked}/7`;
  });

  const lines: string[] = [];
  lines.push(`今天是 ${isoDay(now)}。`);

  lines.push(`【今日】${today.length} 个任务：`);
  if (today.length) lines.push(...today.slice(0, MAX).map((t) => "- " + taskLine(t)));
  else lines.push("- （无）");

  lines.push(`【下一步行动】${next.length} 个：`);
  if (next.length) lines.push(...next.slice(0, MAX).map((t) => "- " + taskLine(t)));
  else lines.push("- （无）");

  lines.push(`【超期】${overdue.length} 个：`);
  if (overdue.length) lines.push(...overdue.slice(0, MAX).map((t) => "- " + taskLine(t)));
  else lines.push("- （无）");

  lines.push(`【等待】${waiting.length} 个：`);
  if (waiting.length) lines.push(...waiting.slice(0, MAX).map((t) => "- " + taskLine(t)));
  else lines.push("- （无）");

  lines.push(`【收件箱】${inbox.length} 个待澄清`);
  lines.push(`【习惯】${habitLines.length ? habitLines.join("；") : "（未设置）"}`);
  if (stats.projectsWithoutAction.length > 0) {
    lines.push(`【无下一步行动的项目】${stats.projectsWithoutAction.join("、")}`);
  }
  return lines.join("\n");
}
