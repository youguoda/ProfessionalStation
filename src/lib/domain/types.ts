/**
 * 领域类型定义。
 *
 * 设计核心：任务用「澄清阶段 phase」与「执行状态 status」两个正交维度描述。
 *   - phase 是 GTD 的**库存**维度：可以无限长，不设上限。
 *   - status 是看板的**流动**维度：doing 有全局硬上限（在制品约束）。
 * 「库存无限，在制有限」——两套方法论在同一个模型里各管一维，不冲突。
 */

/** 澄清阶段（GTD 澄清结果） */
export type Phase =
  | "inbox" // 已捕获，未澄清
  | "action" // 可行动的下一步行动
  | "waiting" // 等待他人/依赖
  | "someday" // 将来/也许
  | "trash"; // 回收站（软删除）

/** 执行状态 */
export type Status = "todo" | "doing" | "done" | "canceled";

/** 优先级：P1 最高。已降级为可选的高级字段，默认 P3。 */
export type Priority = 1 | 2 | 3 | 4;

export interface Task {
  id: string;
  title: string;
  notes: string;
  phase: Phase;
  status: Status;
  priority: Priority;
  /** 努力值（斐波那契）；null 表示未评估。高级字段。 */
  effort: number | null;
  /** 截止日期 = **世界对我的要求**，ISO date (YYYY-MM-DD) */
  dueDate: string | null;
  /** 我承诺哪天做 = **我对自己的承诺**，ISO date；今天视图的唯一来源 */
  plannedFor: string | null;
  startDate: string | null;
  /** 固定时刻（hard landscape：真的必须在那一刻发生的事，如会议），ISO datetime */
  scheduledAt: string | null;
  /** 进入 doing 的时刻，用于「已进行 N 天」 */
  startedAt: string | null;
  completedAt: string | null;
  /** 取消原因（终局之一：有意识地决定不做） */
  canceledReason: string | null;
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
  /** 最近一次「戳一下」的时间（等待项跟进） */
  nudgedAt: string | null;
  /** 列表内排序序号 */
  order: number;
  /** 标签 id（高级字段） */
  tags: string[];
  /** 活动历史（关键变更记录，上限 50） */
  history: Array<{ at: string; label: string }>;
  createdAt: string;
  updatedAt: string;
}

/**
 * 笔记 / 工作日志。
 * 从任务系统里独立出来：笔记没有 status / priority / dueDate，
 * 它只有内容、时间、标签，以及可选的任务/项目关联。
 */
export interface Note {
  id: string;
  content: string;
  tags: string[];
  projectId: string | null;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  goal: string | null;
  deadline: string | null;
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
  /** 完成任务自动移出「今天」 */
  autoClearPlanOnDone: boolean;
  /** 等待超过 N 天的任务提醒 */
  staleWaitingReminder: boolean;
}

export type ThemeMode = "light" | "dark" | "system";

/**
 * 导航范围。分四组，对应任务生命周期：
 *   处理（inbox/today/doing/waiting）→ 库存（anytime/upcoming/someday）
 *   → 组织（project/area/notes/habits）→ 结算（review/log）
 */
export type ScopeId =
  | "inbox"
  | "today"
  | "doing"
  | "waiting"
  | "upcoming"
  | "anytime"
  | "someday"
  | "notes"
  | "habits"
  | "review"
  | "log"
  | "automation"
  | "settings"
  | "trash"
  | `project:${string}`
  | `area:${string}`;

export interface Settings {
  /** 自动化规则开关 */
  automations: AutomationSettings;
  /** 主题（浅色/深色/跟随系统） */
  theme: ThemeMode;
  /** 「今天」的条数上限（Ivy Lee Method，默认 6） */
  maxToday: number;
  /** 同时「进行中」的上限（WIP，默认 3） */
  maxDoing: number;
  /** 判定「停滞」的天数阈值（进行中 / 等待，默认 7） */
  staleDays: number;
  /** 教练模式：允许马力在发现模式时主动开口（一天最多一次） */
  coachEnabled: boolean;
}

/**
 * 马力主动说的那一句话。
 * 一天最多一条，被忽略后当天不再出现——罕见才有杀伤力。
 */
export interface CoachNudge {
  /** 稳定 id（kind + 主体 + 日期），用于当天去重 */
  id: string;
  kind: string;
  text: string;
  /** 生成当天，ISO date */
  day: string;
  taskId: string | null;
  dismissed: boolean;
  createdAt: string;
}

/** 马力可建议的操作类型（HITL：仅建议，经用户确认后执行） */
export type AgentToolName =
  | "create_task"
  | "complete_task"
  | "reschedule_task"
  | "set_priority"
  | "plan_today"
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
  notes: Note[];
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
  /** 马力最近一次主动开口（用于「一天最多一次」的节流） */
  lastNudge: CoachNudge | null;
}
