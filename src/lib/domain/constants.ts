import type { Phase, Priority, Status } from "./types";

export const PHASES: Phase[] = ["inbox", "action", "waiting", "someday", "trash"];
export const STATUSES: Status[] = ["todo", "doing", "done", "canceled"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: "P1 · 最高",
  2: "P2 · 高",
  3: "P3 · 中",
  4: "P4 · 低",
};

export const PRIORITY_SHORT: Record<Priority, string> = {
  1: "P1",
  2: "P2",
  3: "P3",
  4: "P4",
};

/** 优先级色条（任务行左侧 3px）。P3 为默认值，不着色以免满屏噪音。 */
export const PRIORITY_BAR: Record<Priority, string> = {
  1: "bg-destructive",
  2: "bg-warning",
  3: "bg-transparent",
  4: "bg-transparent",
};

export const EFFORT_OPTIONS = [1, 2, 3, 5, 8] as const;

export const PHASE_LABELS: Record<Phase, string> = {
  inbox: "收件箱",
  action: "下一步行动",
  waiting: "等待",
  someday: "将来/也许",
  trash: "回收站",
};

export const STATUS_LABELS: Record<Status, string> = {
  todo: "待办",
  doing: "进行中",
  done: "已完成",
  canceled: "已取消",
};

/** 默认约束值：Ivy Lee「每天 6 件事」+ 看板 WIP 上限 3 */
export const DEFAULT_MAX_TODAY = 6;
export const DEFAULT_MAX_DOING = 3;
/** 判定停滞的天数阈值 */
export const DEFAULT_STALE_DAYS = 7;
