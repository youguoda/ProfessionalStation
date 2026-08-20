"use client";

import { create } from "zustand";
import { api } from "@/lib/client/api";
import type { Area, Db, Habit, HabitCheck, Project, Tag, Task } from "@/lib/domain/types";
import type { TaskEvent } from "@/lib/engine/stateMachine";

export type ViewId =
  | "inbox"
  | "next"
  | "today"
  | "kanban"
  | "matrix"
  | "waiting"
  | "someday"
  | "para"
  | "timeblock"
  | "habits"
  | "automation"
  | "review"
  | "trash";

interface AppState {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  tasks: Task[];
  projects: Project[];
  areas: Area[];
  tags: Tag[];
  habits: Habit[];
  habitChecks: HabitCheck[];
  weeklyReviews: Db["weeklyReviews"];
  settings: Db["settings"];
  automationLog: { time: string; message: string }[];
  aiStatus: { enabled: boolean; model: string } | null;

  view: ViewId;
  search: string;
  projectFilter: string | null;
  areaFilter: string | null;

  load: () => Promise<void>;
  setView: (view: ViewId) => void;
  setSearch: (q: string) => void;
  setProjectFilter: (id: string | null) => void;
  setAreaFilter: (id: string | null) => void;

  addTask: (input: Record<string, unknown>) => Promise<Task>;
  transition: (id: string, event: TaskEvent) => Promise<Task>;
  updateTask: (id: string, patch: Record<string, unknown>) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;

  createProject: (name: string) => Promise<Project>;
  updateProject: (id: string, patch: Record<string, unknown>) => Promise<Project>;
  createArea: (name: string) => Promise<Area>;
  createTag: (name: string, kind: "tag" | "context") => Promise<Tag>;
  updateSettings: (patch: Record<string, unknown>) => Promise<Db["settings"]>;
  saveReview: (notes: string, checklist: Record<string, boolean>) => Promise<void>;

  createHabit: (name: string, icon?: string) => Promise<Habit>;
  deleteHabit: (id: string) => Promise<void>;
  toggleHabitCheck: (habitId: string, date: string) => Promise<void>;
  runAutomations: () => Promise<{ applied: number; notifications: string[] }>;
}

function upsert(list: Task[], task: Task): Task[] {
  const idx = list.findIndex((t) => t.id === task.id);
  if (idx < 0) return [...list, task];
  const next = list.slice();
  next[idx] = task;
  return next;
}

export const useStore = create<AppState>((set, get) => ({
  loaded: false,
  loading: false,
  error: null,
  tasks: [],
  projects: [],
  areas: [],
  tags: [],
  habits: [],
  habitChecks: [],
  weeklyReviews: [],
  settings: {
    defaultMode: "gtd",
    kanbanWip: { todo: -1, doing: -1, done: -1, canceled: -1 },
    automations: { autoFlagOverdueFrog: true, autoClearFrogOnDone: true, staleWaitingReminder: false },
  },
  automationLog: [],
  aiStatus: null,

  view: "inbox",
  search: "",
  projectFilter: null,
  areaFilter: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [db, aiStatus] = await Promise.all([
        api.bootstrap(),
        api.aiStatus().catch(() => null),
      ]);
      set({
        tasks: db.tasks,
        projects: db.projects,
        areas: db.areas,
        tags: db.tags,
        habits: db.habits,
        habitChecks: db.habitChecks,
        weeklyReviews: db.weeklyReviews,
        settings: db.settings,
        aiStatus,
        loaded: true,
        loading: false,
      });
      // 自动化：有规则开启时，加载后自动运行一次
      const a = db.settings.automations;
      if (a.autoFlagOverdueFrog || a.autoClearFrogOnDone || a.staleWaitingReminder) {
        await get().runAutomations();
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "加载失败", loading: false });
    }
  },

  setView: (view) => set({ view, search: "" }),
  setSearch: (search) => set({ search }),
  setProjectFilter: (projectFilter) => set({ projectFilter }),
  setAreaFilter: (areaFilter) => set({ areaFilter }),

  addTask: async (input) => {
    const task = await api.createTask(input);
    set({ tasks: upsert(get().tasks, task) });
    return task;
  },

  transition: async (id, event) => {
    const task = await api.transition(id, event);
    set({ tasks: upsert(get().tasks, task) });
    // 重复任务完成时会在服务端生成下一次，重载同步新增实例
    if (task.repeatRule && task.status === "done") {
      await get().load();
    }
    return task;
  },

  updateTask: async (id, patch) => {
    const task = await api.updateTask(id, patch);
    set({ tasks: upsert(get().tasks, task) });
    return task;
  },

  deleteTask: async (id) => {
    await api.deleteTask(id);
    // 软删除会把任务移入回收站、硬删除会移除，直接重载保证一致
    await get().load();
  },

  createProject: async (name) => {
    const project = await api.createProject(name);
    set({ projects: [...get().projects, project] });
    return project;
  },

  updateProject: async (id, patch) => {
    const project = await api.updateProject(id, patch);
    set({ projects: get().projects.map((p) => (p.id === id ? project : p)) });
    return project;
  },

  createArea: async (name) => {
    const area = await api.createArea(name);
    set({ areas: [...get().areas, area] });
    return area;
  },

  createTag: async (name, kind) => {
    const tag = await api.createTag(name, kind);
    if (!get().tags.some((t) => t.id === tag.id)) {
      set({ tags: [...get().tags, tag] });
    }
    return tag;
  },

  updateSettings: async (patch) => {
    const settings = await api.updateSettings(patch);
    set({ settings });
    return settings;
  },

  saveReview: async (notes, checklist) => {
    const review = await api.createReview(notes, checklist);
    set({ weeklyReviews: [...get().weeklyReviews, review] });
  },

  createHabit: async (name, icon) => {
    const habit = await api.createHabit(name, icon);
    set({ habits: [...get().habits, habit] });
    return habit;
  },

  deleteHabit: async (id) => {
    await api.deleteHabit(id);
    set({
      habits: get().habits.filter((h) => h.id !== id),
      habitChecks: get().habitChecks.filter((c) => c.habitId !== id),
    });
  },

  toggleHabitCheck: async (habitId, date) => {
    const { checked } = await api.toggleHabitCheck(habitId, date);
    set({
      habitChecks: checked
        ? [...get().habitChecks, { id: `${habitId}-${date}`, habitId, date }]
        : get().habitChecks.filter((c) => !(c.habitId === habitId && c.date === date)),
    });
  },

  runAutomations: async () => {
    const result = await api.runAutomations();
    set({ tasks: result.tasks });
    if (result.notifications.length > 0) {
      const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      const entries = result.notifications.map((message) => ({ time, message }));
      set({ automationLog: [...entries, ...get().automationLog].slice(0, 50) });
    }
    return { applied: result.applied, notifications: result.notifications };
  },
}));
