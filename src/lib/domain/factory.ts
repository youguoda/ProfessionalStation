import type { AgentProfile, Area, Db, Habit, Note, Project, Tag, Task } from "./types";
import { DEFAULT_MAX_DOING, DEFAULT_MAX_TODAY, DEFAULT_STALE_DAYS } from "./constants";

export function uid(): string {
  // 浏览器与 Node 18+ 均可用
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export interface NewTaskInput {
  title: string;
  notes?: string;
  priority?: Task["priority"];
  effort?: number | null;
  dueDate?: string | null;
  plannedFor?: string | null;
  startDate?: string | null;
  scheduledAt?: string | null;
  projectId?: string | null;
  areaId?: string | null;
  parentId?: string | null;
  tags?: string[];
  phase?: Task["phase"];
  status?: Task["status"];
  completedAt?: string | null;
  blockedBy?: string[];
  repeatRule?: string | null;
  waitingFor?: string | null;
}

export function createTask(input: NewTaskInput): Task {
  const now = nowIso();
  const phase = input.phase ?? "inbox";
  return {
    id: uid(),
    title: input.title.trim(),
    notes: input.notes ?? "",
    phase,
    status: input.status ?? "todo",
    priority: input.priority ?? 3,
    effort: input.effort ?? null,
    dueDate: input.dueDate ?? null,
    plannedFor: input.plannedFor ?? null,
    startDate: input.startDate ?? null,
    scheduledAt: input.scheduledAt ?? null,
    startedAt: null,
    completedAt: input.completedAt ?? null,
    canceledReason: null,
    projectId: input.projectId ?? null,
    areaId: input.areaId ?? null,
    parentId: input.parentId ?? null,
    blockedBy: input.blockedBy ?? [],
    repeatRule: input.repeatRule ?? null,
    waitingFor: input.waitingFor ?? null,
    nudgedAt: null,
    order: 0,
    tags: input.tags ?? [],
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

export interface NewNoteInput {
  content: string;
  tags?: string[];
  projectId?: string | null;
  taskId?: string | null;
}

export function createNote(input: NewNoteInput): Note {
  const now = nowIso();
  return {
    id: uid(),
    content: input.content,
    tags: input.tags ?? [],
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createProject(input: Partial<Project> & { name: string }): Project {
  const now = nowIso();
  return {
    id: uid(),
    name: input.name.trim(),
    goal: input.goal ?? null,
    deadline: input.deadline ?? null,
    archived: input.archived ?? false,
    createdAt: now,
    updatedAt: now,
  };
}

export function createArea(input: Partial<Area> & { name: string }): Area {
  const now = nowIso();
  return {
    id: uid(),
    name: input.name.trim(),
    description: input.description ?? "",
    icon: input.icon ?? "📁",
    archived: input.archived ?? false,
    createdAt: now,
    updatedAt: now,
  };
}

export function createTag(name: string): Tag {
  const now = nowIso();
  return {
    id: uid(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
  };
}

export function createHabit(name: string, icon: string = "🎯"): Habit {
  return {
    id: uid(),
    name: name.trim(),
    icon,
    createdAt: nowIso(),
  };
}

/** 马力默认人格（损友模板：毒舌教练） */
export function defaultAgentProfile(): AgentProfile {
  return {
    name: "马力",
    personaId: "roaster",
    custom: { role: [], tone: [], style: [], boundaries: [] },
    updatedAt: nowIso(),
  };
}

export function defaultSettings(): Db["settings"] {
  return {
    automations: {
      autoClearPlanOnDone: true,
      staleWaitingReminder: false,
    },
    theme: "system",
    maxToday: DEFAULT_MAX_TODAY,
    maxDoing: DEFAULT_MAX_DOING,
    staleDays: DEFAULT_STALE_DAYS,
    coachEnabled: true,
  };
}

export function emptyDb(): Db {
  return {
    tasks: [],
    notes: [],
    projects: [],
    areas: [],
    tags: [],
    habits: [],
    habitChecks: [],
    weeklyReviews: [],
    weeklyReviewDraft: { checklist: {}, notes: "" },
    settings: defaultSettings(),
    agentProfile: defaultAgentProfile(),
    chatMessages: [],
    memoryNotes: [],
    chatSummary: "",
    lastNudge: null,
  };
}
