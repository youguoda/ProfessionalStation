import type { Task } from "@/lib/domain/types";
import { isoDay } from "@/lib/engine/selectors";

/**
 * 任务到期提醒（客户端浏览器通知）。
 * 纯函数部分：reminderMessages 计算「今天到期/已逾期」的提醒；
 * checkReminders 负责权限、会话去重与 Notification 副作用。
 */

export interface Reminder {
  taskId: string;
  message: string;
  overdue: boolean;
}

export function reminderMessages(tasks: Task[], now: Date = new Date()): Reminder[] {
  const today = isoDay(now);
  const out: Reminder[] = [];
  for (const t of tasks) {
    if (t.phase !== "action" || t.status === "done" || t.status === "canceled") continue;
    if (!t.dueDate) continue;
    if (t.dueDate === today) {
      out.push({ taskId: t.id, message: `今天到期：${t.title}`, overdue: false });
    } else if (t.dueDate < today) {
      out.push({ taskId: t.id, message: `已逾期：${t.title}`, overdue: true });
    }
  }
  // 逾期提醒置顶（组内保持任务顺序）
  return out.sort((a, b) => Number(b.overdue) - Number(a.overdue));
}

const SESSION_NOTIFIED = new Set<string>();

export function checkReminders(tasks: Task[], now: Date = new Date()): string[] {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return [];
  }
  const reminders = reminderMessages(tasks, now).filter(
    (r) => !SESSION_NOTIFIED.has(r.taskId),
  );
  const messages: string[] = [];
  for (const r of reminders.slice(0, 5)) {
    SESSION_NOTIFIED.add(r.taskId);
    messages.push(r.message);
    try {
      new Notification("ProfessionalStation 提醒", { body: r.message });
    } catch {
      /* ignore */
    }
  }
  return messages;
}
