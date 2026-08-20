import type { AutomationSettings, Task } from "@/lib/domain/types";
import { selectOverdue } from "./selectors";

/**
 * 自动化规则引擎（纯函数）。
 * 内置规则：
 *   1. 超期任务自动标记为青蛙
 *   2. 完成任务自动清除青蛙标记
 *   3. 等待超过 7 天的任务提醒
 * 返回需要应用的补丁与提示消息，由存储层负责落地。
 */

export interface AutomationPatch {
  id: string;
  patch: Partial<Task>;
}

export interface AutomationResult {
  patches: AutomationPatch[];
  notifications: string[];
}

const STALE_WAITING_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

export function evaluateAutomations(
  tasks: Task[],
  settings: AutomationSettings,
  now: Date = new Date(),
): AutomationResult {
  const patches: AutomationPatch[] = [];
  const notifications: string[] = [];

  // 1) 超期任务自动标记青蛙
  if (settings.autoFlagOverdueFrog) {
    for (const t of selectOverdue(tasks, now)) {
      if (!t.isFrog) {
        patches.push({ id: t.id, patch: { isFrog: true } });
        notifications.push(`🐸 已把超期任务「${t.title}」自动标记为青蛙`);
      }
    }
  }

  // 2) 已完成任务自动清除青蛙标记
  if (settings.autoClearFrogOnDone) {
    for (const t of tasks) {
      if ((t.status === "done" || t.status === "canceled") && t.isFrog) {
        patches.push({ id: t.id, patch: { isFrog: false } });
        notifications.push(`✓ 已完成任务「${t.title}」自动清除青蛙标记`);
      }
    }
  }

  // 3) 等待超过 7 天的任务提醒
  if (settings.staleWaitingReminder) {
    for (const t of tasks) {
      if (t.phase !== "waiting") continue;
      if (now.getTime() - new Date(t.createdAt).getTime() > STALE_WAITING_DAYS * DAY) {
        notifications.push(`⏳ 「${t.title}」已等待超过 ${STALE_WAITING_DAYS} 天，记得跟进`);
      }
    }
  }

  return { patches, notifications };
}

export function defaultAutomationSettings(): AutomationSettings {
  return {
    autoFlagOverdueFrog: true,
    autoClearFrogOnDone: true,
    staleWaitingReminder: false,
  };
}
