"use client";

import { create } from "zustand";
import { api } from "@/lib/client/api";
import type { Area, Db, Project, Tag, Task } from "@/lib/domain/types";
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
  weeklyReviews: Db["weeklyReviews"];
  settings: Db["settings"];

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
  createArea: (name: string) => Promise<Area>;
  createTag: (name: string, kind: "tag" | "context") => Promise<Tag>;
  saveReview: (notes: string, checklist: Record<string, boolean>) => Promise<void>;
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
  weeklyReviews: [],
  settings: { defaultMode: "gtd", kanbanWip: { todo: -1, doing: -1, done: -1, canceled: -1 } },

  view: "inbox",
  search: "",
  projectFilter: null,
  areaFilter: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const db = await api.bootstrap();
      set({
        tasks: db.tasks,
        projects: db.projects,
        areas: db.areas,
        tags: db.tags,
        weeklyReviews: db.weeklyReviews,
        settings: db.settings,
        loaded: true,
        loading: false,
      });
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

  saveReview: async (notes, checklist) => {
    const review = await api.createReview(notes, checklist);
    set({ weeklyReviews: [...get().weeklyReviews, review] });
  },
}));
