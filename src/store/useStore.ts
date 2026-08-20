"use client";

import { create } from "zustand";
import { api } from "@/lib/client/api";
import type {
  AgentProfile,
  Area,
  ChatMessage,
  Db,
  DisplayMode,
  Habit,
  HabitCheck,
  Project,
  ScopeId,
  Tag,
  Task,
  ThemeMode,
} from "@/lib/domain/types";
import type { TaskEvent } from "@/lib/engine/stateMachine";
import { applyTheme } from "@/lib/client/theme";

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
  agentOpen: boolean;
  agentProfile: AgentProfile | null;
  chatMessages: ChatMessage[];

  scope: ScopeId;
  mode: DisplayMode;
  search: string;

  load: () => Promise<void>;
  setScope: (scope: ScopeId) => void;
  setMode: (mode: DisplayMode) => void;
  setSearch: (q: string) => void;

  addTask: (input: Record<string, unknown>) => Promise<Task>;
  transition: (id: string, event: TaskEvent) => Promise<Task>;
  updateTask: (id: string, patch: Record<string, unknown>) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;

  createProject: (name: string) => Promise<Project>;
  updateProject: (id: string, patch: Record<string, unknown>) => Promise<Project>;
  createArea: (name: string) => Promise<Area>;
  createTag: (name: string, kind: "tag" | "context") => Promise<Tag>;
  updateSettings: (patch: Record<string, unknown>) => Promise<Db["settings"]>;
  setTheme: (mode: ThemeMode) => Promise<void>;
  saveReview: (notes: string, checklist: Record<string, boolean>) => Promise<void>;

  createHabit: (name: string, icon?: string) => Promise<Habit>;
  deleteHabit: (id: string) => Promise<void>;
  toggleHabitCheck: (habitId: string, date: string) => Promise<void>;
  runAutomations: () => Promise<{ applied: number; notifications: string[] }>;

  setAgentOpen: (open: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  selectedTaskId: string | null;
  openTask: (id: string) => void;
  closeTask: () => void;
  saveAgentProfile: (patch: Record<string, unknown>) => Promise<AgentProfile>;
  sendChat: (text: string) => Promise<void>;
  setChatMessages: (messages: ChatMessage[]) => void;
  clearChat: () => Promise<void>;
  resolveProposal: (
    messageId: string,
    proposalId: string,
    status: "approved" | "denied",
  ) => Promise<void>;
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
    automations: { autoFlagOverdueFrog: false, autoClearFrogOnDone: true, staleWaitingReminder: false },
    theme: "system",
  },
  automationLog: [],
  aiStatus: null,
  agentOpen: false,
  agentProfile: null,
  chatMessages: [],
  paletteOpen: false,
  selectedTaskId: null,

  scope: "today",
  mode: "list",
  search: "",

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [db, aiStatus, agentProfile, chatMessages] = await Promise.all([
        api.bootstrap(),
        api.aiStatus().catch(() => null),
        api.agentProfile().catch(() => null),
        api.chatMessages().catch(() => []),
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
        agentProfile,
        chatMessages,
        loaded: true,
        loading: false,
      });
      applyTheme(db.settings.theme);
      // 自动化：有规则开启时，加载后自动运行一次
      const a = db.settings.automations;
      if (a.autoFlagOverdueFrog || a.autoClearFrogOnDone || a.staleWaitingReminder) {
        await get().runAutomations();
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "加载失败", loading: false });
    }
  },

  setScope: (scope) => set({ scope, search: "" }),
  setMode: (mode) => set({ mode }),
  setSearch: (search) => set({ search }),

  addTask: async (input) => {
    const task = await api.createTask(input);
    set({ tasks: upsert(get().tasks, task) });
    return task;
  },

  transition: async (id, event) => {
    const { task, spawned } = await api.transition(id, event).catch((e) => {
      const t = get().tasks.find((x) => x.id === id);
      const msg = e instanceof Error ? e.message : "操作失败";
      throw new Error(t ? `「${t.title}」：${msg}` : msg);
    });
    set({ tasks: upsert(get().tasks, task) });
    // 重复任务完成时服务端生成的下一次直接并入，无需全量重载（消除闪屏）
    if (spawned) set({ tasks: upsert(get().tasks, spawned) });
    return task;
  },

  updateTask: async (id, patch) => {
    const task = await api.updateTask(id, patch).catch((e) => {
      const t = get().tasks.find((x) => x.id === id);
      const msg = e instanceof Error ? e.message : "操作失败";
      throw new Error(t ? `「${t.title}」：${msg}` : msg);
    });
    set({ tasks: upsert(get().tasks, task) });
    return task;
  },

  deleteTask: async (id) => {
    const prev = get().tasks.find((t) => t.id === id);
    await api.deleteTask(id);
    if (!prev) return;
    // 本地同步软删/硬删，不做全量重载
    if (prev.phase === "trash") {
      set({ tasks: get().tasks.filter((t) => t.id !== id) });
    } else {
      set({
        tasks: upsert(get().tasks, {
          ...prev,
          phase: "trash",
          updatedAt: new Date().toISOString(),
        }),
      });
    }
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

  setTheme: async (mode) => {
    applyTheme(mode);
    const settings = await api.updateSettings({ theme: mode });
    set({ settings });
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

  setAgentOpen: (open) => set({ agentOpen: open }),

  setPaletteOpen: (open) => set({ paletteOpen: open }),
  openTask: (id) => set({ selectedTaskId: id }),
  closeTask: () => set({ selectedTaskId: null }),

  saveAgentProfile: async (patch) => {
    const profile = await api.saveAgentProfile(patch);
    set({ agentProfile: profile });
    return profile;
  },

  sendChat: async (text) => {
    const messages = await api.sendChatStream(text, () => {});
    set({ chatMessages: messages });
  },

  setChatMessages: (messages) => set({ chatMessages: messages }),

  clearChat: async () => {
    await api.clearChat();
    set({ chatMessages: [] });
  },

  resolveProposal: async (messageId, proposalId, status) => {
    const msg = await api.setProposalStatus(messageId, proposalId, status);
    set({ chatMessages: get().chatMessages.map((m) => (m.id === msg.id ? msg : m)) });
  },
}));
