import type { Phase, Task } from "@/lib/domain/types";
import { nowIso } from "@/lib/domain/factory";

/**
 * 统一任务状态机引擎。
 *
 * 这是「唯一」的状态转换真相源：视图层不允许绕过它直接修改 phase/status。
 *
 * 两个正交维度：
 *   - phase（库存/澄清阶段）：inbox → action / waiting / someday / trash
 *   - status（流动/执行状态）：todo → doing → done（+ canceled）
 *
 * 终局有四种，只有一种是「完成」：
 *   done（做了）/ canceled（决定不做）/ trash（不该存在）/ 转化（拆分或转成笔记）。
 */

export type ClarifyTarget = Extract<Phase, "action" | "waiting" | "someday">;

export type TaskEvent =
  | { type: "clarify"; target: ClarifyTarget }
  /** 激活：someday/waiting 提回下一步（孵化成熟或等待结束，重新回到行动） */
  | { type: "activate" }
  /** 搁置：action → someday（决定近期不推进，放回孵化器） */
  | { type: "defer" }
  | { type: "start" }
  /** 等结果：活还在跑，但跑的不是我——让出 WIP 名额，计时不停 */
  | { type: "awaitResult" }
  /** 重新上手：从「等结果」回到真正的在制品，重新占用 WIP 名额 */
  | { type: "resumeWork" }
  /** 放回待办：把在制品退回库存，不算失败 */
  | { type: "stop" }
  | { type: "complete" }
  | { type: "reopen" }
  | { type: "cancel"; reason?: string }
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
      return ok({ ...task, phase: event.target, status, awaitingResult: false });
    }

    case "activate": {
      if (task.phase !== "someday" && task.phase !== "waiting") {
        return err(`只有「将来/也许」或「等待」中的任务才能提回下一步（当前：${task.phase}）`);
      }
      if (task.status === "done" || task.status === "canceled") {
        return err(`任务已${task.status === "done" ? "完成" : "取消"}，请使用「重新打开」`);
      }
      return ok({ ...task, phase: "action", status: "todo", waitingFor: null, awaitingResult: false });
    }

    case "defer": {
      if (task.phase !== "action") {
        return err(`只有「下一步行动」任务才能放到将来/也许（当前：${task.phase}）`);
      }
      if (task.status === "done" || task.status === "canceled") {
        return err(`任务已${task.status === "done" ? "完成" : "取消"}，请使用「重新打开」`);
      }
      // 搁置即释放占用的所有额度：在制品名额与今天的承诺
      return ok({
        ...task,
        phase: "someday",
        status: "todo",
        startedAt: null,
        plannedFor: null,
        awaitingResult: false,
      });
    }

    case "start": {
      if (!EXECUTABLE.includes(task.phase)) {
        return err(`只有「下一步行动」任务才能开始执行（当前：${task.phase}）`);
      }
      if (task.status === "doing") {
        return err("任务已在进行中");
      }
      return ok({ ...task, status: "doing", startedAt: nowIso(), awaitingResult: false });
    }

    case "awaitResult": {
      if (task.status !== "doing") {
        return err("只有进行中的任务才能挂成「等结果」");
      }
      if (task.awaitingResult) {
        return err("任务已经在等结果了");
      }
      // 计时不重置：等结果也是在耗时间，停滞判定照常把它拎出来
      return ok({ ...task, awaitingResult: true });
    }

    case "resumeWork": {
      if (!task.awaitingResult) {
        return err("任务不在「等结果」状态");
      }
      return ok({ ...task, status: "doing", awaitingResult: false });
    }

    case "stop": {
      if (task.status !== "doing") {
        return err("只有进行中的任务才能放回待办");
      }
      return ok({ ...task, status: "todo", startedAt: null, awaitingResult: false });
    }

    case "complete": {
      if (!COMPLETABLE.includes(task.phase)) {
        return err(`当前阶段（${task.phase}）的任务不能直接完成`);
      }
      if (task.status === "done") {
        return err("任务已完成");
      }
      return ok({
        ...task,
        status: "done",
        completedAt: nowIso(),
        startedAt: null,
        awaitingResult: false,
      });
    }

    case "reopen": {
      if (task.status !== "done" && task.status !== "canceled") {
        return err("只有已完成/已取消的任务才能重新打开");
      }
      return ok({
        ...task,
        status: "todo",
        completedAt: null,
        canceledReason: null,
        awaitingResult: false,
      });
    }

    case "cancel": {
      if (task.status === "done") {
        return err("已完成的任务不能取消，请使用「重新打开」");
      }
      if (task.status === "canceled") {
        return err("任务已取消");
      }
      return ok({
        ...task,
        status: "canceled",
        completedAt: nowIso(),
        startedAt: null,
        canceledReason: event.reason?.trim() || null,
        awaitingResult: false,
      });
    }

    case "trash": {
      if (task.phase === "trash") {
        return err("任务已在回收站");
      }
      // 扔进回收站的东西不该还挂着「进行中」——它既不在做，也不占名额。
      // done/canceled 是终局，保留原状态，回收站才能如实显示它当初的下场。
      return ok({
        ...task,
        phase: "trash",
        status: task.status === "doing" ? "todo" : task.status,
        plannedFor: null,
        startedAt: null,
        awaitingResult: false,
      });
    }

    case "restore": {
      if (task.phase !== "trash") {
        return err("只有回收站中的任务才能恢复");
      }
      return ok({ ...task, phase: "inbox", status: "todo", awaitingResult: false });
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
