/**
 * 领域类型定义。
 * 设计核心：任务用「澄清阶段 phase」与「执行状态 status」两个正交维度描述，
 * 一个数据模型服务 GTD / 看板 / 四象限 / PARA / 时间块多套视图。
 */

/** 澄清阶段（GTD 澄清结果） */
export type Phase =
  | "inbox" // 已捕获，未澄清
  | "action" // 可行动的下一步行动
  | "waiting" // 等待他人/依赖
  | "someday" // 将来/也许
  | "reference" // 参考资料
  | "trash"; // 回收站（软删除）

/** 执行状态（看板列） */
export type Status = "todo" | "doing" | "done" | "canceled";

/** 优先级：P1 最高 */
export type Priority = 1 | 2 | 3 | 4;

/** 工作流模式 */
export type WorkflowMode = "gtd" | "kanban" | "matrix" | "para" | "timeblock";

export interface Task {
  id: string;
  title: string;
  notes: string;
  phase: Phase;
  status: Status;
  priority: Priority;
  /** 努力值（斐波那契），供价值-努力/四象限使用；null 表示未评估 */
  effort: number | null;
  /** 截止日期，ISO date (YYYY-MM-DD) */
  dueDate: string | null;
  /** 开始日期，ISO date (YYYY-MM-DD) */
  startDate: string | null;
  /** 已排期到具体时间块，ISO datetime */
  scheduledAt: string | null;
  completedAt: string | null;
  projectId: string | null;
  areaId: string | null;
  /** 父任务（子任务） */
  parentId: string | null;
  /** 列表内排序序号 */
  order: number;
  /** 标签 id */
  tags: string[];
  /** 上下文 id（GTD @context） */
  contexts: string[];
  /** 今日「吃青蛙」标记 */
  isFrog: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  goal: string | null;
  deadline: string | null;
  mode: WorkflowMode;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Area {
  id: string;
  name: string;
  description: string;
  icon: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  kind: "tag" | "context";
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyReview {
  id: string;
  date: string; // ISO date
  notes: string;
  checklist: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  /** 全局默认工作流模式 */
  defaultMode: WorkflowMode;
  /** 看板各列 WIP 上限（-1 表示不限） */
  kanbanWip: Record<Status, number>;
}

export interface Db {
  tasks: Task[];
  projects: Project[];
  areas: Area[];
  tags: Tag[];
  weeklyReviews: WeeklyReview[];
  settings: Settings;
}
