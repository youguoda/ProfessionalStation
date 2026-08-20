import type { Phase, Priority, Status, WorkflowMode } from "./types";

export const PHASES: Phase[] = ["inbox", "action", "waiting", "someday", "reference", "trash"];
export const STATUSES: Status[] = ["todo", "doing", "done", "canceled"];
export const MODES: WorkflowMode[] = ["gtd", "kanban", "matrix", "para", "timeblock"];

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

/** 优先级色条（任务行左侧 3px） */
export const PRIORITY_BAR: Record<Priority, string> = {
  1: "bg-destructive",
  2: "bg-warning",
  3: "bg-primary/70",
  4: "bg-muted-foreground/40",
};

export const EFFORT_OPTIONS = [1, 2, 3, 5, 8] as const;

export const PHASE_LABELS: Record<Phase, string> = {
  inbox: "收件箱",
  action: "下一步行动",
  waiting: "等待",
  someday: "将来/也许",
  reference: "参考资料",
  trash: "回收站",
};

export const STATUS_LABELS: Record<Status, string> = {
  todo: "待办",
  doing: "进行中",
  done: "已完成",
  canceled: "已取消",
};

export const MODE_LABELS: Record<WorkflowMode, string> = {
  gtd: "GTD",
  kanban: "看板",
  matrix: "四象限",
  para: "PARA",
  timeblock: "时间块",
};
