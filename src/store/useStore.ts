"use client";

import { create } from "zustand";
import { api } from "@/lib/client/api";
import type {
  AgentProfile,
  Area,
  ChatMessage,
  CoachNudge,
  Db,
  Habit,
  HabitCheck,
  Note,
  Project,
  ScopeId,
  Tag,
  Task,
  ThemeMode,
} from "@/lib/domain/types";
import type { TaskEvent } from "@/lib/engine/stateMachine";
import { applyTheme } from "@/lib/client/theme";
import { defaultSettings } from "@/lib/domain/factory";

interface AppState {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  tasks: Task[];
  notes: Note[];
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
  /** 马力今天主动说的那一句（null = 今天没什么好说的） */
  nudge: CoachNudge | null;

  scope: ScopeId;
  search: string;

  load: () => Promise<void>;
  setScope: (scope: ScopeId) => void;
  setSearch: (q: string) => void;

  addTask: (input: Record<string, unknown>) => Promise<Task>;
  transition: (id: string, event: TaskEvent) => Promise<Task>;
  updateTask: (id: string, patch: Record<string, unknown>) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  nudgeTask: (id: string) => Promise<Task>;
  taskToNote: (id: string) => Promise<Note>;
  /** 承诺某天做（null = 移出今天） */
  planTask: (id: string, day: string | null) => Promise<Task>;

  createNote: (content: string, extra?: Record<string, unknown>) => Promise<Note>;
  updateNote: (id: string, patch: Record<string, unknown>) => Promise<Note>;
  deleteNote: (id: string) => Promise<void>;

  createProject: (name: string) => Promise<Project>;
  updateProject: (id: string, patch: Record<string, unknown>) => Promise<Project>;
  createArea: (name: string) => Promise<Area>;
  createTag: (name: string) => Promise<Tag>;
  updateSettings: (patch: Record<string, unknown>) => Promise<Db["settings"]>;
  setTheme: (mode: ThemeMode) => Promise<void>;
  saveReview: (notes: string, checklist: Record<string, boolean>) => Promise<void>;

  createHabit: (name: string, icon?: string) => Promise<Habit>;
  deleteHabit: (id: string) => Promise<void>;
  toggleHabitCheck: (habitId: string, date: string) => Promise<void>;
  runAutomations: () => Promise<{ applied: number; notifications: string[] }>;
  resetData: () => Promise<void>;

  setAgentOpen: (open: boolean) => void;
  loadNudge: () => Promise<void>;
  dismissNudge: () => Promise<void>;
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

/** 给错误加上任务标题前缀，让 toast 能说清「哪条任务出了什么问题」 */
function withTaskContext(get: () => AppState, id: string) {
  return (e: unknown): never => {
    const t = get().tasks.find((x) => x.id === id);
    const msg = e instanceof Error ? e.message : "操作失败";
    throw new Error(t ? `「${t.title}」：${msg}` : msg);
  };
}

export const useStore = create<AppState>((set, get) => ({
  loaded: false,
  loading: false,
  error: null,
  tasks: [],
  notes: [],
  projects: [],
  areas: [],
  tags: [],
  habits: [],
  habitChecks: [],
  weeklyReviews: [],
  settings: defaultSettings(),
  automationLog: [],
  aiStatus: null,
  agentOpen: false,
  agentProfile: null,
  chatMessages: [],
  nudge: null,
  paletteOpen: false,
  selectedTaskId: null,

  scope: "today",
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
        notes: db.notes,
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
      const a = db.settings.automations;
      if (a.autoClearPlanOnDone || a.staleWaitingReminder) {
        await get().runAutomations();
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "加载失败", loading: false });
    }
  },

  setScope: (scope) => set({ scope, search: "" }),
  setSearch: (search) => set({ search }),

  addTask: async (input) => {
    const task = await api.createTask(input);
    set({ tasks: upsert(get().tasks, task) });
    return task;
  },

  transition: async (id, event) => {
    const { task, spawned } = await api
      .transition(id, event)
      .catch(withTaskContext(get, id));
    set({ tasks: upsert(get().tasks, task) });
    if (spawned) set({ tasks: upsert(get().tasks, spawned) });
    return task;
  },

  updateTask: async (id, patch) => {
    const task = await api.updateTask(id, patch).catch(withTaskContext(get, id));
    set({ tasks: upsert(get().tasks, task) });
    return task;
  },

  planTask: async (id, day) => get().updateTask(id, { plannedFor: day }),

  nudgeTask: async (id) => {
    const task = await api.nudgeTask(id).catch(withTaskContext(get, id));
    set({ tasks: upsert(get().tasks, task) });
    return task;
  },

  taskToNote: async (id) => {
    const { note, task } = await api.taskToNote(id).catch(withTaskContext(get, id));
    set({ tasks: upsert(get().tasks, task), notes: [...get().notes, note] });
    return note;
  },

  deleteTask: async (id) => {
    const prev = get().tasks.find((t) => t.id === id);
    await api.deleteTask(id);
    if (!prev) return;
    if (prev.phase === "trash") {
      set({ tasks: get().tasks.filter((t) => t.id !== id) });
    } else {
      set({
        tasks: upsert(get().tasks, {
          ...prev,
          phase: "trash",
          plannedFor: null,
          updatedAt: new Date().toISOString(),
        }),
      });
    }
  },

  createNote: async (content, extra) => {
    const note = await api.createNote({ content, ...(extra ?? {}) });
    set({ notes: [...get().notes, note] });
    return note;
  },

  updateNote: async (id, patch) => {
    const note = await api.updateNote(id, patch);
    set({ notes: get().notes.map((n) => (n.id === id ? note : n)) });
    return note;
  },

  deleteNote: async (id) => {
    await api.deleteNote(id);
    set({ notes: get().notes.filter((n) => n.id !== id) });
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

  createTag: async (name) => {
    const tag = await api.createTag(name);
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

  resetData: async () => {
    await api.resetData();
    set({ tasks: [], notes: [], selectedTaskId: null });
  },

  setAgentOpen: (open) => set({ agentOpen: open }),

  loadNudge: async () => {
    // 教练是可选的：拿不到就当今天没什么好说的，绝不打断主流程
    const { nudge } = await api.coachNudge().catch(() => ({ nudge: null }));
    set({ nudge });
  },

  dismissNudge: async () => {
    const current = get().nudge;
    set({ nudge: null });
    if (current) await api.dismissNudge(current.id).catch(() => {});
  },

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
