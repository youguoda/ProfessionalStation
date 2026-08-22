import { promises as fs } from "fs";
import path from "path";
import {
  createArea as makeArea,
  createHabit as makeHabit,
  createNote as makeNote,
  createProject as makeProject,
  createTag as makeTag,
  createTask as makeTask,
  defaultAgentProfile,
  defaultSettings,
  emptyDb,
  nowIso,
  uid,
  type NewNoteInput,
  type NewTaskInput,
} from "@/lib/domain/factory";
import type {
  AgentProfile,
  Area,
  ChatMessage,
  CoachNudge,
  Db,
  Habit,
  HabitCheck,
  MemoryNote,
  Note,
  Project,
  Tag,
  Task,
} from "@/lib/domain/types";
import { nextDueDate } from "@/lib/domain/repeat";
import { transition, type TaskEvent } from "@/lib/engine/stateMachine";
import { doingCapacity, isBlocked, isoDay, wouldCreateCycle } from "@/lib/engine/selectors";
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

/** 旧数据形态（迁移用）：这些字段已从模型中移除 */
type LegacyTask = Omit<Task, "phase"> & {
  isFrog?: boolean;
  contexts?: string[];
  durationMinutes?: number;
  /** 旧模型里 reference 是一个 phase，现在它是独立的笔记实体 */
  phase: Task["phase"] | "reference";
};

/**
 * 旧数据迁移归一化。三件事：
 *   1. 补齐新增字段（plannedFor / startedAt / canceledReason / nudgedAt）
 *   2. 丢弃已删除字段（isFrog / contexts / durationMinutes）；isFrog=true 迁移为「今天做」
 *   3. phase=reference 的任务转成独立的笔记实体
 */
function normalizeDb(raw: Partial<Db>): Db {
  const defaults = emptyDb();
  const db = (raw ?? {}) as Omit<Partial<Db>, "tasks"> & { tasks?: LegacyTask[] };
  const s = (db.settings ?? {}) as Partial<Db["settings"]> & {
    automations?: Partial<Db["settings"]["automations"]> & { autoClearFrogOnDone?: boolean };
  };
  const today = isoDay(new Date());

  const migratedNotes: Note[] = Array.isArray(db.notes) ? db.notes.map(normalizeNote) : [];
  const tasks: Task[] = [];

  for (const legacy of Array.isArray(db.tasks) ? db.tasks : []) {
    // reference 任务 → 笔记
    if (legacy.phase === "reference") {
      migratedNotes.push(
        makeNoteFrom({
          content: legacy.notes ? `${legacy.title}\n\n${legacy.notes}` : legacy.title,
          tags: Array.isArray(legacy.tags) ? legacy.tags : [],
          projectId: legacy.projectId ?? null,
          createdAt: legacy.createdAt,
        }),
      );
      continue;
    }
    const {
      isFrog,
      contexts: _contexts,
      durationMinutes: _durationMinutes,
      ...rest
    } = legacy;
    tasks.push({
      ...rest,
      phase: legacy.phase,
      plannedFor:
        typeof legacy.plannedFor === "string" || legacy.plannedFor === null
          ? legacy.plannedFor
          : isFrog
            ? today
            : null,
      startedAt: legacy.startedAt ?? (legacy.status === "doing" ? legacy.updatedAt : null),
      canceledReason: legacy.canceledReason ?? null,
      nudgedAt: legacy.nudgedAt ?? null,
      tags: Array.isArray(legacy.tags) ? legacy.tags : [],
      history: Array.isArray(legacy.history) ? legacy.history : [],
    });
  }

  return {
    ...defaults,
    ...db,
    tasks,
    notes: migratedNotes,
    projects: Array.isArray(db.projects) ? db.projects : [],
    areas: Array.isArray(db.areas) ? db.areas : [],
    tags: Array.isArray(db.tags) ? db.tags : [],
    habits: Array.isArray(db.habits) ? db.habits : [],
    habitChecks: Array.isArray(db.habitChecks) ? db.habitChecks : [],
    weeklyReviews: Array.isArray(db.weeklyReviews) ? db.weeklyReviews : [],
    weeklyReviewDraft:
      db.weeklyReviewDraft && typeof db.weeklyReviewDraft === "object"
        ? {
            checklist:
              db.weeklyReviewDraft.checklist &&
              typeof db.weeklyReviewDraft.checklist === "object"
                ? db.weeklyReviewDraft.checklist
                : {},
            notes: typeof db.weeklyReviewDraft.notes === "string" ? db.weeklyReviewDraft.notes : "",
          }
        : { checklist: {}, notes: "" },
    agentProfile: migrateProfile(db.agentProfile),
    chatMessages: Array.isArray(db.chatMessages) ? db.chatMessages : [],
    memoryNotes: Array.isArray(db.memoryNotes) ? db.memoryNotes : [],
    chatSummary: typeof db.chatSummary === "string" ? db.chatSummary : "",
    lastNudge: normalizeNudge(db.lastNudge),
    settings: {
      ...defaults.settings,
      theme: s.theme ?? defaults.settings.theme,
      maxToday: numberOr(s.maxToday, defaults.settings.maxToday, 1, 20),
      maxDoing: numberOr(s.maxDoing, defaults.settings.maxDoing, 1, 10),
      staleDays: numberOr(s.staleDays, defaults.settings.staleDays, 1, 90),
      coachEnabled:
        typeof s.coachEnabled === "boolean"
          ? s.coachEnabled
          : defaults.settings.coachEnabled,
      automations: {
        autoClearPlanOnDone:
          s.automations?.autoClearPlanOnDone ??
          s.automations?.autoClearFrogOnDone ??
          defaults.settings.automations.autoClearPlanOnDone,
        staleWaitingReminder:
          s.automations?.staleWaitingReminder ??
          defaults.settings.automations.staleWaitingReminder,
      },
    },
  };
}

function numberOr(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;
}

/**
 * 人格迁移：从未自定义过的旧「战友」档案升级为「损友」。
 * 用户改过任何一段自定义指令就原样保留——不覆盖别人的手笔。
 */
function migrateProfile(raw: Db["agentProfile"] | undefined): AgentProfile {
  const defaults = defaultAgentProfile();
  const custom = {
    ...defaults.custom,
    ...((raw as AgentProfile | undefined)?.custom ?? {}),
  };
  const untouched =
    custom.role.length === 0 &&
    custom.tone.length === 0 &&
    custom.style.length === 0 &&
    custom.boundaries.length === 0;
  const personaId =
    raw?.personaId === "comrade" && untouched ? defaults.personaId : raw?.personaId;
  return { ...defaults, ...(raw ?? {}), personaId: personaId ?? defaults.personaId, custom };
}

function normalizeNudge(raw: unknown): CoachNudge | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as Partial<CoachNudge>;
  if (typeof n.id !== "string" || typeof n.text !== "string" || typeof n.day !== "string") {
    return null;
  }
  return {
    id: n.id,
    kind: typeof n.kind === "string" ? n.kind : "unknown",
    text: n.text,
    day: n.day,
    taskId: typeof n.taskId === "string" ? n.taskId : null,
    dismissed: n.dismissed === true,
    createdAt: n.createdAt ?? nowIso(),
  };
}

function normalizeNote(n: Partial<Note>): Note {
  const now = nowIso();
  return {
    id: n.id ?? uid(),
    content: typeof n.content === "string" ? n.content : "",
    tags: Array.isArray(n.tags) ? n.tags : [],
    projectId: n.projectId ?? null,
    taskId: n.taskId ?? null,
    createdAt: n.createdAt ?? now,
    updatedAt: n.updatedAt ?? n.createdAt ?? now,
  };
}

function makeNoteFrom(input: NewNoteInput & { createdAt?: string }): Note {
  const note = makeNote(input);
  if (input.createdAt) {
    note.createdAt = input.createdAt;
    note.updatedAt = input.createdAt;
  }
  return note;
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

    const prev = db.tasks[idx];
    let next: Task = {
      ...prev,
      ...patch,
      id: prev.id,
      createdAt: prev.createdAt,
      updatedAt: nowIso(),
    };

    // 关键字段变更写入活动历史
    const labels: string[] = [];
    if (patch.title !== undefined && patch.title !== prev.title) labels.push("修改了标题");
    if (patch.priority !== undefined && patch.priority !== prev.priority) {
      labels.push(`优先级设为 P${patch.priority}`);
    }
    if (patch.dueDate !== undefined && patch.dueDate !== prev.dueDate) {
      labels.push(patch.dueDate ? `截止日期改为 ${patch.dueDate}` : "清除了截止日期");
    }
    if (patch.plannedFor !== undefined && patch.plannedFor !== prev.plannedFor) {
      labels.push(patch.plannedFor ? `承诺 ${patch.plannedFor} 做` : "移出了今天");
    }
    if (patch.projectId !== undefined && patch.projectId !== prev.projectId) {
      labels.push("调整了所属项目");
    }
    if (patch.scheduledAt !== undefined && patch.scheduledAt !== prev.scheduledAt) {
      labels.push(patch.scheduledAt ? `固定到 ${patch.scheduledAt.slice(0, 16)}` : "取消固定时刻");
    }
    for (const label of labels) next = pushHistory(next, label);

    db.tasks[idx] = next;
    return { ok: true, task: next };
  });
}

const EVENT_HISTORY_LABELS: Record<TaskEvent["type"], string> = {
  clarify: "澄清了任务",
  start: "开始执行",
  stop: "放回待办",
  complete: "完成",
  reopen: "重新打开",
  cancel: "取消",
  trash: "移入回收站",
  restore: "恢复",
};

function pushHistory(task: Task, label: string): Task {
  const entry = { at: nowIso(), label };
  return { ...task, history: [...(task.history ?? []), entry].slice(-50) };
}

export type TransitionOutcome =
  | { ok: true; task: Task; spawned?: Task }
  | { ok: false; error: string };

export async function transitionTask(id: string, event: TaskEvent): Promise<TransitionOutcome> {
  return mutate((db) => {
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return { ok: false as const, error: "任务不存在" };
    const task = db.tasks[idx];

    if (event.type === "start") {
      // 依赖阻断
      if (isBlocked(task, db.tasks)) {
        return { ok: false as const, error: "存在未完成的依赖任务，无法开始" };
      }
      // 在制品上限：这是看板唯一值钱的约束，硬拦
      const cap = doingCapacity(db.tasks, db.settings);
      if (cap.used >= cap.max) {
        return {
          ok: false as const,
          error: `你手上已经有 ${cap.used} 件事了（上限 ${cap.max}）。先结掉一件，或去「进行中」把一件放回待办。`,
        };
      }
    }

    const result = transition(task, event);
    if (!result.ok) return result;

    let updated = pushHistory(result.task, EVENT_HISTORY_LABELS[event.type]);

    // 开始做 = 就是今天做：自动落入今天的承诺清单
    if (event.type === "start" && !updated.plannedFor) {
      updated = { ...updated, plannedFor: isoDay(new Date()) };
    }
    // 完成/取消后自动移出今天
    if (
      (event.type === "complete" || event.type === "cancel") &&
      db.settings.automations.autoClearPlanOnDone
    ) {
      updated = { ...updated, plannedFor: null };
    }

    db.tasks[idx] = updated;
    let spawned: Task | undefined;

    // 重复任务：完成后自动生成下一次
    if (updated.status === "done" && updated.repeatRule) {
      const today = isoDay(new Date());
      const baseDate = updated.dueDate ?? today;
      const nextDate = nextDueDate(updated.repeatRule, baseDate) ?? baseDate;
      const next = makeTask({
        title: updated.title,
        notes: updated.notes,
        priority: updated.priority,
        effort: updated.effort,
        dueDate: nextDate,
        projectId: updated.projectId,
        areaId: updated.areaId,
        tags: updated.tags,
        repeatRule: updated.repeatRule,
        phase: "action",
        status: "todo",
      });
      next.order = db.tasks.length;
      db.tasks.push(next);
      spawned = next;
    }
    return { ok: true as const, task: updated, spawned };
  });
}

/** 等待项「戳一下」：记一条历史并重置等待计时 */
export async function nudgeTask(id: string): Promise<Task | null> {
  return mutate((db) => {
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    const next = pushHistory(
      { ...db.tasks[idx], nudgedAt: nowIso(), updatedAt: nowIso() },
      "戳了一下",
    );
    db.tasks[idx] = next;
    return next;
  });
}

/**
 * 转化为笔记（终局之一）：内容留存到笔记，任务移入回收站可恢复。
 */
export async function convertTaskToNote(id: string): Promise<{ note: Note; task: Task } | null> {
  return mutate((db) => {
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    const task = db.tasks[idx];
    const note = makeNote({
      content: task.notes ? `${task.title}\n\n${task.notes}` : task.title,
      tags: task.tags,
      projectId: task.projectId,
    });
    db.notes.push(note);
    const next = pushHistory(
      { ...task, phase: "trash" as const, plannedFor: null, updatedAt: nowIso() },
      "转存为笔记",
    );
    db.tasks[idx] = next;
    return { note, task: next };
  });
}

export async function deleteTask(id: string): Promise<boolean> {
  return mutate((db) => {
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return false;
    const t = db.tasks[idx];
    if (t.phase !== "trash") {
      db.tasks[idx] = { ...t, phase: "trash", plannedFor: null, updatedAt: nowIso() };
    } else {
      db.tasks.splice(idx, 1);
    }
    return true;
  });
}

// ---- Note（笔记 / 工作日志） ----

export async function listNotes(): Promise<Note[]> {
  const db = await readDb();
  return db.notes;
}

export async function createNote(input: NewNoteInput): Promise<Note> {
  return mutate((db) => {
    const note = makeNote(input);
    db.notes.push(note);
    return note;
  });
}

export async function updateNote(id: string, patch: Partial<Note>): Promise<Note | null> {
  return mutate((db) => {
    const idx = db.notes.findIndex((n) => n.id === id);
    if (idx < 0) return null;
    const next = { ...db.notes[idx], ...patch, id, updatedAt: nowIso() };
    db.notes[idx] = next;
    return next;
  });
}

export async function deleteNote(id: string): Promise<boolean> {
  return mutate((db) => {
    const idx = db.notes.findIndex((n) => n.id === id);
    if (idx < 0) return false;
    db.notes.splice(idx, 1);
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
    const next = { ...db.projects[idx], ...patch, id, updatedAt: nowIso() };
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

// ---- Tag ----

export async function listTags(): Promise<Tag[]> {
  const db = await readDb();
  return db.tags;
}

export async function getOrCreateTag(name: string): Promise<Tag> {
  return mutate((db) => {
    const trimmed = name.trim();
    const existing = db.tags.find((t) => t.name === trimmed);
    if (existing) return existing;
    const tag = makeTag(trimmed);
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
    db.habitChecks.push({ id: uid(), habitId, date });
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
    const now = nowIso();
    const review = {
      id: uid(),
      date: isoDay(new Date()),
      notes: input.notes,
      checklist: input.checklist,
      createdAt: now,
      updatedAt: now,
    };
    db.weeklyReviews.push(review);
    db.weeklyReviewDraft = { checklist: {}, notes: "" };
    return review;
  });
}

export async function getWeeklyReviewDraft(): Promise<Db["weeklyReviewDraft"]> {
  const db = await readDb();
  return db.weeklyReviewDraft;
}

export async function setWeeklyReviewDraft(
  draft: Db["weeklyReviewDraft"],
): Promise<Db["weeklyReviewDraft"]> {
  return mutate((db) => {
    db.weeklyReviewDraft = {
      checklist: draft.checklist ?? {},
      notes: typeof draft.notes === "string" ? draft.notes : "",
    };
    return db.weeklyReviewDraft;
  });
}

// ---- Settings ----

export async function getSettings(): Promise<Db["settings"]> {
  const db = await readDb();
  return db.settings;
}

export async function updateSettings(patch: Partial<Db["settings"]>): Promise<Db["settings"]> {
  return mutate((db) => {
    db.settings = {
      ...db.settings,
      ...patch,
      automations: { ...db.settings.automations, ...(patch.automations ?? {}) },
    };
    return db.settings;
  });
}

/** 危险操作：清空所有任务与笔记，保留项目/领域/设置/人格 */
export async function resetTaskData(): Promise<{ tasks: number; notes: number }> {
  return mutate((db) => {
    const counts = { tasks: db.tasks.length, notes: db.notes.length };
    db.tasks = [];
    db.notes = [];
    return counts;
  });
}

// ---- Coach（马力主动开口） ----

export async function getLastNudge(): Promise<CoachNudge | null> {
  const db = await readDb();
  return db.lastNudge;
}

export async function setLastNudge(nudge: CoachNudge | null): Promise<CoachNudge | null> {
  return mutate((db) => {
    db.lastNudge = nudge;
    return db.lastNudge;
  });
}

/** 忽略当天这一条：当天不再出现 */
export async function dismissNudge(id: string): Promise<CoachNudge | null> {
  return mutate((db) => {
    if (db.lastNudge && db.lastNudge.id === id) {
      db.lastNudge = { ...db.lastNudge, dismissed: true };
    }
    return db.lastNudge;
  });
}

// ---- Automations ----

export async function runAutomations(): Promise<{
  applied: number;
  notifications: string[];
  tasks: Task[];
}> {
  return mutate((db) => {
    const result = evaluateAutomations(
      db.tasks,
      db.settings.automations,
      db.settings.staleDays,
    );
    let applied = 0;
    for (const p of result.patches) {
      const idx = db.tasks.findIndex((t) => t.id === p.id);
      if (idx >= 0) {
        db.tasks[idx] = { ...db.tasks[idx], ...p.patch, updatedAt: nowIso() };
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
      updatedAt: nowIso(),
    };
    return db.agentProfile;
  });
}

export async function listChatMessages(): Promise<ChatMessage[]> {
  const db = await readDb();
  return db.chatMessages;
}

export async function getChatSummary(): Promise<string> {
  const db = await readDb();
  return db.chatSummary;
}

export async function setChatSummary(summary: string): Promise<string> {
  return mutate((db) => {
    db.chatSummary = summary.trim().slice(0, 4000);
    return db.chatSummary;
  });
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
        id: uid(),
        role: m.role,
        content: m.content,
        proposals: m.proposals ?? [],
        createdAt: nowIso(),
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
      id: uid(),
      content: content.trim().slice(0, 500),
      createdAt: nowIso(),
    };
    db.memoryNotes.push(note);
    if (db.memoryNotes.length > 100) db.memoryNotes = db.memoryNotes.slice(-100);
    return note;
  });
}

export async function getDb(): Promise<Db> {
  return readDb();
}

export { defaultSettings };
