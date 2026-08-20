import { promises as fs } from "fs";
import path from "path";
import {
  createArea as makeArea,
  createProject as makeProject,
  createTag as makeTag,
  createTask as makeTask,
  emptyDb,
  type NewTaskInput,
} from "@/lib/domain/factory";
import type { Area, Db, Project, Tag, Task } from "@/lib/domain/types";
import { transition, type TaskEvent, type TransitionResult } from "@/lib/engine/stateMachine";

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

async function readDb(): Promise<Db> {
  if (dbCache) return dbCache;
  try {
    const raw = await fs.readFile(dataPath(), "utf-8");
    dbCache = JSON.parse(raw) as Db;
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

export async function updateTask(
  id: string,
  patch: Partial<Omit<Task, "id" | "createdAt">>,
): Promise<Task | null> {
  return mutate((db) => {
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    const next = { ...db.tasks[idx], ...patch, id: db.tasks[idx].id, createdAt: db.tasks[idx].createdAt, updatedAt: new Date().toISOString() };
    db.tasks[idx] = next;
    return next;
  });
}

export async function transitionTask(id: string, event: TaskEvent): Promise<TransitionResult> {
  return mutate((db) => {
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return { ok: false as const, error: "任务不存在" };
    const result = transition(db.tasks[idx], event);
    if (result.ok) db.tasks[idx] = result.task;
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

export async function getDb(): Promise<Db> {
  return readDb();
}
