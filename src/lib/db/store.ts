import { promises as fs } from "fs";
import path from "path";
import {
  createArea as makeArea,
  createHabit as makeHabit,
  createProject as makeProject,
  createTag as makeTag,
  createTask as makeTask,
  defaultAgentProfile,
  emptyDb,
  type NewTaskInput,
} from "@/lib/domain/factory";
import type {
  AgentProfile,
  Area,
  ChatMessage,
  Db,
  Habit,
  HabitCheck,
  MemoryNote,
  Project,
  Tag,
  Task,
} from "@/lib/domain/types";
import { nextDueDate } from "@/lib/domain/repeat";
import { transition, type TaskEvent, type TransitionResult } from "@/lib/engine/stateMachine";
import { isBlocked, wouldCreateCycle } from "@/lib/engine/selectors";
import { evaluateAutomations } from "@/lib/engine/automations";

/**
 * 文件持久化仓储（MVP：单用户、低并发）。
 * 数据存放在 process.env.DATA_DIR 或默认 `.data/db.json`。
 * 使用一个简单的 promise 队列串行化读改写，避免并发覆盖。
 */

let dbCache: Db | null = null;
let queue: Promise<unknown> = Promise.resolve();

function dataPath(): string {
  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
  return path.join(dir, "db.json");
}

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** 旧数据迁移归一化：补齐新增字段（habits/habitChecks/settings.automations/agentProfile/chatMessages/memoryNotes） */
function normalizeDb(raw: Partial<Db>): Db {
  const defaults = emptyDb();
  const db = (raw ?? {}) as Partial<Db>;
  const s = (db.settings ?? {}) as Partial<Db["settings"]>;
  return {
    ...defaults,
    ...db,
    tasks: Array.isArray(db.tasks) ? db.tasks : [],
    projects: Array.isArray(db.projects) ? db.projects : [],
    areas: Array.isArray(db.areas) ? db.areas : [],
    tags: Array.isArray(db.tags) ? db.tags : [],
    habits: Array.isArray(db.habits) ? db.habits : [],
    habitChecks: Array.isArray(db.habitChecks) ? db.habitChecks : [],
    weeklyReviews: Array.isArray(db.weeklyReviews) ? db.weeklyReviews : [],
    agentProfile: {
      ...defaultAgentProfile(),
      ...(db.agentProfile ?? {}),
      custom: {
        ...defaultAgentProfile().custom,
        ...((db.agentProfile as AgentProfile | undefined)?.custom ?? {}),
      },
    },
    chatMessages: Array.isArray(db.chatMessages) ? db.chatMessages : [],
    memoryNotes: Array.isArray(db.memoryNotes) ? db.memoryNotes : [],
    settings: {
      ...defaults.settings,
      ...s,
      kanbanWip: { ...defaults.settings.kanbanWip, ...(s.kanbanWip ?? {}) },
      automations: { ...defaults.settings.automations, ...(s.automations ?? {}) },
    },
  };
}

async function readDb(): Promise<Db> {
  if (dbCache) return dbCache;
  try {
    const raw = await fs.readFile(dataPath(), "utf-8");
    dbCache = normalizeDb(JSON.parse(raw));
    return dbCache!;
  } catch {
    dbCache = emptyDb();
    return dbCache;
  }
}

async function writeDb(db: Db): Promise<void> {
  const file = dataPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(db, null, 2), "utf-8");
  dbCache = db;
}

async function mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  return withLock(async () => {
    const db = await readDb();
    const result = await fn(db);
    await writeDb(db);
    return result;
  });
}

/** 仅测试用：清空内存缓存与写队列，配合临时 DATA_DIR 重置存储状态 */
export function __resetStore() {
  dbCache = null;
  queue = Promise.resolve();
}

// ---- Task ----

export async function listTasks(): Promise<Task[]> {
  const db = await readDb();
  return db.tasks;
}

export async function getTask(id: string): Promise<Task | null> {
  const db = await readDb();
  return db.tasks.find((t) => t.id === id) ?? null;
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  return mutate((db) => {
    const task = makeTask(input);
    task.order = db.tasks.length;
    db.tasks.push(task);
    return task;
  });
}

export type UpdateTaskResult =
  | { ok: true; task: Task }
  | { ok: false; error: string; code: "NOT_FOUND" | "INVALID_DEPENDENCY" };

export async function updateTask(
  id: string,
  patch: Partial<Omit<Task, "id" | "createdAt">>,
): Promise<UpdateTaskResult> {
  return mutate((db) => {
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return { ok: false, error: "任务不存在", code: "NOT_FOUND" };

    // 依赖校验：禁止自依赖与循环依赖
    if (patch.blockedBy) {
      for (const depId of patch.blockedBy) {
        if (wouldCreateCycle(id, depId, db.tasks)) {
          return {
            ok: false,
            error: "不能添加该依赖：会造成自依赖或循环依赖",
            code: "INVALID_DEPENDENCY",
          };
        }
      }
    }

    const next = {
      ...db.tasks[idx],
      ...patch,
      id: db.tasks[idx].id,
      createdAt: db.tasks[idx].createdAt,
      updatedAt: new Date().toISOString(),
    };
    db.tasks[idx] = next;
    return { ok: true, task: next };
  });
}

export async function transitionTask(id: string, event: TaskEvent): Promise<TransitionResult> {
  return mutate((db) => {
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return { ok: false as const, error: "任务不存在" };
    const task = db.tasks[idx];

    // 依赖阻断：被阻塞的任务不能开始执行
    if (event.type === "start" && isBlocked(task, db.tasks)) {
      return { ok: false as const, error: "存在未完成的依赖任务，无法开始" };
    }

    const result = transition(task, event);
    if (result.ok) {
      db.tasks[idx] = result.task;

      // 重复任务：完成后自动生成下一次
      if (result.task.status === "done" && result.task.repeatRule) {
        const today = new Date().toISOString().slice(0, 10);
        const baseDate = result.task.dueDate ?? today;
        const nextDate = nextDueDate(result.task.repeatRule, baseDate) ?? baseDate;
        const next = makeTask({
          title: result.task.title,
          notes: result.task.notes,
          priority: result.task.priority,
          effort: result.task.effort,
          dueDate: nextDate,
          projectId: result.task.projectId,
          areaId: result.task.areaId,
          tags: result.task.tags,
          contexts: result.task.contexts,
          repeatRule: result.task.repeatRule,
          phase: "action",
          status: "todo",
        });
        next.order = db.tasks.length;
        db.tasks.push(next);
      }
    }
    return result;
  });
}

export async function deleteTask(id: string): Promise<boolean> {
  return mutate((db) => {
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return false;
    const t = db.tasks[idx];
    if (t.phase !== "trash") {
      db.tasks[idx] = { ...t, phase: "trash", updatedAt: new Date().toISOString() };
    } else {
      db.tasks.splice(idx, 1);
    }
    return true;
  });
}

// ---- Project ----

export async function listProjects(): Promise<Project[]> {
  const db = await readDb();
  return db.projects;
}

export async function createProject(name: string): Promise<Project> {
  return mutate((db) => {
    const p = makeProject({ name });
    db.projects.push(p);
    return p;
  });
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<Project | null> {
  return mutate((db) => {
    const idx = db.projects.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const next = { ...db.projects[idx], ...patch, id, updatedAt: new Date().toISOString() };
    db.projects[idx] = next;
    return next;
  });
}

export async function deleteProject(id: string): Promise<boolean> {
  return mutate((db) => {
    const idx = db.projects.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    db.projects.splice(idx, 1);
    db.tasks.forEach((t) => {
      if (t.projectId === id) t.projectId = null;
    });
    return true;
  });
}

// ---- Area ----

export async function listAreas(): Promise<Area[]> {
  const db = await readDb();
  return db.areas;
}

export async function createArea(name: string): Promise<Area> {
  return mutate((db) => {
    const a = makeArea({ name });
    db.areas.push(a);
    return a;
  });
}

export async function deleteArea(id: string): Promise<boolean> {
  return mutate((db) => {
    const idx = db.areas.findIndex((a) => a.id === id);
    if (idx < 0) return false;
    db.areas.splice(idx, 1);
    db.tasks.forEach((t) => {
      if (t.areaId === id) t.areaId = null;
    });
    return true;
  });
}

// ---- Tag / Context ----

export async function listTags(): Promise<Tag[]> {
  const db = await readDb();
  return db.tags;
}

export async function getOrCreateTag(name: string, kind: Tag["kind"] = "tag"): Promise<Tag> {
  return mutate((db) => {
    const trimmed = name.trim();
    const existing = db.tags.find((t) => t.name === trimmed && t.kind === kind);
    if (existing) return existing;
    const tag = makeTag(trimmed, kind);
    db.tags.push(tag);
    return tag;
  });
}

// ---- Habit ----

export async function listHabits(): Promise<Habit[]> {
  const db = await readDb();
  return db.habits;
}

export async function listHabitChecks(): Promise<HabitCheck[]> {
  const db = await readDb();
  return db.habitChecks;
}

export async function createHabit(name: string, icon?: string): Promise<Habit> {
  return mutate((db) => {
    const h = makeHabit(name, icon);
    db.habits.push(h);
    return h;
  });
}

export async function deleteHabit(id: string): Promise<boolean> {
  return mutate((db) => {
    const idx = db.habits.findIndex((h) => h.id === id);
    if (idx < 0) return false;
    db.habits.splice(idx, 1);
    db.habitChecks = db.habitChecks.filter((c) => c.habitId !== id);
    return true;
  });
}

/** 切换某习惯在某天的打卡状态，返回新的打卡状态 */
export async function toggleHabitCheck(
  habitId: string,
  date: string,
): Promise<{ checked: boolean } | null> {
  return mutate((db) => {
    if (!db.habits.some((h) => h.id === habitId)) return null;
    const idx = db.habitChecks.findIndex((c) => c.habitId === habitId && c.date === date);
    if (idx >= 0) {
      db.habitChecks.splice(idx, 1);
      return { checked: false };
    }
    db.habitChecks.push({ id: crypto.randomUUID(), habitId, date });
    return { checked: true };
  });
}

// ---- Weekly Review ----

export async function listWeeklyReviews(): Promise<Db["weeklyReviews"]> {
  const db = await readDb();
  return db.weeklyReviews;
}

export async function createWeeklyReview(input: {
  notes: string;
  checklist: Record<string, boolean>;
}): Promise<Db["weeklyReviews"][number]> {
  return mutate((db) => {
    const now = new Date().toISOString();
    const review = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      notes: input.notes,
      checklist: input.checklist,
      createdAt: now,
      updatedAt: now,
    };
    db.weeklyReviews.push(review);
    return review;
  });
}

// ---- Settings ----

export async function getSettings(): Promise<Db["settings"]> {
  const db = await readDb();
  return db.settings;
}

export async function updateSettings(patch: Partial<Db["settings"]>): Promise<Db["settings"]> {
  return mutate((db) => {
    db.settings = { ...db.settings, ...patch };
    return db.settings;
  });
}

// ---- Automations ----

export async function runAutomations(): Promise<{
  applied: number;
  notifications: string[];
  tasks: Task[];
}> {
  return mutate((db) => {
    const result = evaluateAutomations(db.tasks, db.settings.automations);
    let applied = 0;
    for (const p of result.patches) {
      const idx = db.tasks.findIndex((t) => t.id === p.id);
      if (idx >= 0) {
        db.tasks[idx] = { ...db.tasks[idx], ...p.patch, updatedAt: new Date().toISOString() };
        applied += 1;
      }
    }
    return { applied, notifications: result.notifications, tasks: db.tasks };
  });
}

// ---- Agent（马力） ----

export async function getAgentProfile(): Promise<AgentProfile> {
  const db = await readDb();
  return db.agentProfile;
}

export async function updateAgentProfile(
  patch: Partial<Omit<AgentProfile, "custom">> & {
    custom?: Partial<AgentProfile["custom"]>;
  },
): Promise<AgentProfile> {
  return mutate((db) => {
    db.agentProfile = {
      ...db.agentProfile,
      ...patch,
      custom: {
        role: patch.custom?.role ?? db.agentProfile.custom.role,
        tone: patch.custom?.tone ?? db.agentProfile.custom.tone,
        style: patch.custom?.style ?? db.agentProfile.custom.style,
        boundaries: patch.custom?.boundaries ?? db.agentProfile.custom.boundaries,
      },
      updatedAt: new Date().toISOString(),
    };
    return db.agentProfile;
  });
}

export async function listChatMessages(): Promise<ChatMessage[]> {
  const db = await readDb();
  return db.chatMessages;
}

export async function appendChatMessages(
  messages: Array<{
    role: ChatMessage["role"];
    content: string;
    proposals?: ChatMessage["proposals"];
  }>,
): Promise<ChatMessage[]> {
  return mutate((db) => {
    for (const m of messages) {
      db.chatMessages.push({
        id: crypto.randomUUID(),
        role: m.role,
        content: m.content,
        proposals: m.proposals ?? [],
        createdAt: new Date().toISOString(),
      });
    }
    if (db.chatMessages.length > 200) {
      db.chatMessages = db.chatMessages.slice(-200);
    }
    return db.chatMessages;
  });
}

export async function clearChat(): Promise<void> {
  return mutate((db) => {
    db.chatMessages = [];
  });
}

export async function setProposalStatus(
  messageId: string,
  proposalId: string,
  status: "approved" | "denied",
): Promise<ChatMessage | null> {
  return mutate((db) => {
    const msg = db.chatMessages.find((m) => m.id === messageId);
    if (!msg) return null;
    const p = msg.proposals.find((x) => x.id === proposalId);
    if (!p) return null;
    if (p.status === "pending") p.status = status; // 幂等
    return msg;
  });
}

export async function listMemoryNotes(): Promise<MemoryNote[]> {
  const db = await readDb();
  return db.memoryNotes;
}

export async function addMemoryNote(content: string): Promise<MemoryNote> {
  return mutate((db) => {
    const note = {
      id: crypto.randomUUID(),
      content: content.trim().slice(0, 500),
      createdAt: new Date().toISOString(),
    };
    db.memoryNotes.push(note);
    if (db.memoryNotes.length > 100) db.memoryNotes = db.memoryNotes.slice(-100);
    return note;
  });
}

export async function getDb(): Promise<Db> {
  return readDb();
}
