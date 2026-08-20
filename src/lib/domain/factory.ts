import type { Area, Db, Project, Settings, Task, Tag } from "./types";

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
  startDate?: string | null;
  scheduledAt?: string | null;
  projectId?: string | null;
  areaId?: string | null;
  parentId?: string | null;
  tags?: string[];
  contexts?: string[];
  isFrog?: boolean;
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
    status: input.status ?? (phase === "action" ? "todo" : "todo"),
    priority: input.priority ?? 3,
    effort: input.effort ?? null,
    dueDate: input.dueDate ?? null,
    startDate: input.startDate ?? null,
    scheduledAt: input.scheduledAt ?? null,
    completedAt: input.completedAt ?? null,
    projectId: input.projectId ?? null,
    areaId: input.areaId ?? null,
    parentId: input.parentId ?? null,
    blockedBy: input.blockedBy ?? [],
    repeatRule: input.repeatRule ?? null,
    waitingFor: input.waitingFor ?? null,
    order: 0,
    tags: input.tags ?? [],
    contexts: input.contexts ?? [],
    isFrog: input.isFrog ?? false,
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
    mode: input.mode ?? "gtd",
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

export function createTag(name: string, kind: Tag["kind"] = "tag"): Tag {
  const now = nowIso();
  return {
    id: uid(),
    name: name.trim(),
    kind,
    createdAt: now,
    updatedAt: now,
  };
}

export function emptyDb(): Db {
  return {
    tasks: [],
    projects: [],
    areas: [],
    tags: [],
    weeklyReviews: [],
    settings: {
      defaultMode: "gtd",
      kanbanWip: { todo: -1, doing: -1, done: -1, canceled: -1 },
    },
  };
}
