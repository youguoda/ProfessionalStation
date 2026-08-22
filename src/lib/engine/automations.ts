import type { AutomationSettings, Task } from "@/lib/domain/types";
import { daysSince, selectStaleWaiting, waitingSince } from "./selectors";

/**
 * 自动化规则引擎（纯函数）。
 * 返回需要应用的补丁与提示消息，由存储层负责落地。
 *
 * 原则：自动化只做**机械清理**，不替用户做决定。
 * 「该不该继续做」这类判断留给周回顾的结算台。
 */

export interface AutomationPatch {
  id: string;
  patch: Partial<Task>;
}

export interface AutomationResult {
  patches: AutomationPatch[];
  notifications: string[];
}

export function evaluateAutomations(
  tasks: Task[],
  settings: AutomationSettings,
  staleDays = 7,
  now: Date = new Date(),
): AutomationResult {
  const patches: AutomationPatch[] = [];
  const notifications: string[] = [];

  // 1) 完成/取消的任务自动移出「今天」，保持今日清单干净
  if (settings.autoClearPlanOnDone) {
    for (const t of tasks) {
      if ((t.status === "done" || t.status === "canceled") && t.plannedFor !== null) {
        patches.push({ id: t.id, patch: { plannedFor: null } });
      }
    }
  }

  // 2) 等待超过阈值的任务提醒跟进
  if (settings.staleWaitingReminder) {
    for (const t of selectStaleWaiting(tasks, staleDays, now)) {
      notifications.push(
        `「${t.title}」已等待 ${daysSince(waitingSince(t), now)} 天，记得戳一下`,
      );
    }
  }

  return { patches, notifications };
}

export function defaultAutomationSettings(): AutomationSettings {
  return {
    autoClearPlanOnDone: true,
    staleWaitingReminder: false,
  };
}
