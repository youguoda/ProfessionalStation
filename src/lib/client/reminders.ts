import type { Task } from "@/lib/domain/types";
import { isoDay } from "@/lib/engine/selectors";

/**
 * 任务到期提醒（客户端浏览器通知）。
 * 加载时检查：今天到期（含逾期）的未完成行动任务。
 * 同任务每次会话只提醒一次。
 */

const SESSION_NOTIFIED = new Set<string>();

export function checkReminders(tasks: Task[], now: Date = new Date()): string[] {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return [];
  }
  const today = isoDay(now);
  const messages: string[] = [];
  for (const t of tasks) {
    if (t.phase !== "action" || t.status === "done" || t.status === "canceled") continue;
    if (!t.dueDate) continue;
    const dueToday = t.dueDate === today;
    const overdue = t.dueDate < today;
    if ((dueToday || overdue) && !SESSION_NOTIFIED.has(t.id)) {
      SESSION_NOTIFIED.add(t.id);
      messages.push(overdue ? `已逾期：${t.title}` : `今天到期：${t.title}`);
    }
  }
  for (const msg of messages.slice(0, 5)) {
    try {
      new Notification("ProfessionalStation 提醒", { body: msg });
    } catch {
      /* ignore */
    }
  }
  return messages;
}
