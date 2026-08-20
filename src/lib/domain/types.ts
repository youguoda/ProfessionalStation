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
  /** 时间块时长（分钟，15–480） */
  durationMinutes: number;
  completedAt: string | null;
  projectId: string | null;
  areaId: string | null;
  /** 父任务（子任务） */
  parentId: string | null;
  /** 依赖：必须先完成的任务 id 列表 */
  blockedBy: string[];
  /** 重复规则：null | "daily" | "weekly" | "monthly" | "every:N:days" */
  repeatRule: string | null;
  /** 等待项：在等谁/什么 */
  waitingFor: string | null;
  /** 列表内排序序号 */
  order: number;
  /** 标签 id */
  tags: string[];
  /** 上下文 id（GTD @context） */
  contexts: string[];
  /** 今日「吃青蛙」标记 */
  isFrog: boolean;
  /** 活动历史（关键变更记录，上限 50） */
  history: Array<{ at: string; label: string }>;
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

/** 习惯（Atomic Habits 习惯追踪） */
export interface Habit {
  id: string;
  name: string;
  icon: string;
  createdAt: string;
}

/** 习惯打卡记录 */
export interface HabitCheck {
  id: string;
  habitId: string;
  /** 打卡日期，ISO date (YYYY-MM-DD) */
  date: string;
}

/** 自动化规则开关 */
export interface AutomationSettings {
  /** 超期任务自动标记为青蛙 */
  autoFlagOverdueFrog: boolean;
  /** 完成任务自动清除青蛙标记 */
  autoClearFrogOnDone: boolean;
  /** 等待超过 7 天的任务提醒 */
  staleWaitingReminder: boolean;
}

export type ThemeMode = "light" | "dark" | "system";

/** 导航范围（做什么 / 组织 / 回顾），视图模式与范围分离 */
export type ScopeId =
  | "inbox"
  | "today"
  | "upcoming"
  | "anytime"
  | "waiting"
  | "someday"
  | "para"
  | "habits"
  | "review"
  | "log"
  | "automation"
  | "settings"
  | "trash"
  | `project:${string}`
  | `area:${string}`;

/** 显示模式：作用于「当前所选范围」 */
export type DisplayMode = "list" | "kanban" | "matrix" | "timeblock";

export interface Settings {
  /** 全局默认工作流模式 */
  defaultMode: WorkflowMode;
  /** 看板各列 WIP 上限（-1 表示不限） */
  kanbanWip: Record<Status, number>;
  /** 自动化规则开关 */
  automations: AutomationSettings;
  /** 主题（浅色/深色/跟随系统） */
  theme: ThemeMode;
  /** 时间块视图的开始小时（0–23） */
  dayStartHour: number;
  /** 时间块视图的结束小时（0–24） */
  dayEndHour: number;
}

/** 马力可建议的操作类型（HITL：仅建议，经用户确认后执行） */
export type AgentToolName =
  | "create_task"
  | "complete_task"
  | "reschedule_task"
  | "set_priority"
  | "mark_frog"
  | "add_note";

/** 马力的人格配置 */
export interface AgentProfile {
  name: string;
  /** 预设模板 id（comrade/mentor/stern/empathic） */
  personaId: string;
  /** 四段自定义指令（与模板合并，可覆盖/追加） */
  custom: {
    role: string[];
    tone: string[];
    style: string[];
    boundaries: string[];
  };
  updatedAt: string;
}

/** 操作建议卡片 */
export interface ActionProposal {
  id: string;
  tool: AgentToolName;
  args: Record<string, unknown>;
  summary: string;
  status: "pending" | "approved" | "denied";
}

/** 对话消息 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposals: ActionProposal[];
  createdAt: string;
}

/** 马力写下的长期记忆笔记 */
export interface MemoryNote {
  id: string;
  content: string;
  createdAt: string;
}

export interface Db {
  tasks: Task[];
  projects: Project[];
  areas: Area[];
  tags: Tag[];
  habits: Habit[];
  habitChecks: HabitCheck[];
  weeklyReviews: WeeklyReview[];
  /** 周回顾进行中的草稿（持久化，中途切走不丢） */
  weeklyReviewDraft: { checklist: Record<string, boolean>; notes: string };
  settings: Settings;
  agentProfile: AgentProfile;
  chatMessages: ChatMessage[];
  memoryNotes: MemoryNote[];
  /** 对话早期摘要（滚动窗口：超阈值时把旧消息压缩进这里） */
  chatSummary: string;
}
