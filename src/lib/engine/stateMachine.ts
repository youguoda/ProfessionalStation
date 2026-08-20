import type { Phase, Status, Task } from "@/lib/domain/types";
import { nowIso } from "@/lib/domain/factory";

/**
 * 统一任务状态机引擎。
 *
 * 这是「唯一」的状态转换真相源：视图层不允许绕过它直接修改 phase/status，
 * 从而保证 GTD / 看板 / 四象限等多视图对同一任务的状态始终一致。
 *
 * 两个正交维度：
 *   - phase（澄清阶段）：inbox → action / waiting / someday / reference / trash
 *   - status（执行状态）：todo → doing → done（+ canceled）
 */

export type ClarifyTarget = Extract<Phase, "action" | "waiting" | "someday" | "reference">;

export type TaskEvent =
  | { type: "clarify"; target: ClarifyTarget }
  | { type: "start" }
  | { type: "complete" }
  | { type: "reopen" }
  | { type: "cancel" }
  | { type: "setStatus"; status: Status }
  | { type: "trash" }
  | { type: "restore" };

export type TransitionResult =
  | { ok: true; task: Task }
  | { ok: false; error: string };

function ok(task: Task): TransitionResult {
  return { ok: true, task: { ...task, updatedAt: nowIso() } };
}

function err(error: string): TransitionResult {
  return { ok: false, error };
}

/** 允许「开始执行」的阶段 */
const EXECUTABLE: Phase[] = ["action"];
/** 允许「完成」的阶段（等待项也可在等待结束时直接勾选完成） */
const COMPLETABLE: Phase[] = ["action", "waiting"];

export function transition(task: Task, event: TaskEvent): TransitionResult {
  switch (event.type) {
    case "clarify": {
      if (task.phase !== "inbox" && task.phase !== "trash") {
        return err(`只有收件箱中的任务才能被澄清（当前：${task.phase}）`);
      }
      const status = event.target === "action" ? "todo" : task.status;
      return ok({ ...task, phase: event.target, status });
    }

    case "start": {
      if (!EXECUTABLE.includes(task.phase)) {
        return err(`只有「下一步行动」任务才能开始执行（当前：${task.phase}）`);
      }
      if (task.status === "doing") {
        return err("任务已在进行中");
      }
      return ok({ ...task, status: "doing" });
    }

    case "complete": {
      if (!COMPLETABLE.includes(task.phase)) {
        return err(`当前阶段（${task.phase}）的任务不能直接完成`);
      }
      if (task.status === "done") {
        return err("任务已完成");
      }
      return ok({ ...task, status: "done", completedAt: nowIso() });
    }

    case "reopen": {
      if (task.status !== "done" && task.status !== "canceled") {
        return err("只有已完成/已取消的任务才能重新打开");
      }
      return ok({ ...task, status: "todo", completedAt: null });
    }

    case "cancel": {
      if (task.status === "done") {
        return err("已完成的任务不能取消，请使用「重新打开」");
      }
      return ok({ ...task, status: "canceled" });
    }

    case "setStatus": {
      // 看板拖拽列移动：仅对「行动」阶段任务有效
      if (task.phase !== "action") {
        return err(`只有「下一步行动」任务才能在看板中移动（当前：${task.phase}）`);
      }
      const completedAt = event.status === "done" ? nowIso() : null;
      return ok({ ...task, status: event.status, completedAt });
    }

    case "trash": {
      if (task.phase === "trash") {
        return err("任务已在回收站");
      }
      return ok({ ...task, phase: "trash" });
    }

    case "restore": {
      if (task.phase !== "trash") {
        return err("只有回收站中的任务才能恢复");
      }
      return ok({ ...task, phase: "inbox", status: "todo" });
    }

    default: {
      const _exhaustive: never = event;
      return err(`未知事件：${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** 批量应用事件，遇到错误即停止并返回错误 */
export function transitionMany(task: Task, events: TaskEvent[]): TransitionResult {
  let current = task;
  for (const event of events) {
    const result = transition(current, event);
    if (!result.ok) return result;
    current = result.task;
  }
  return ok(current);
}
