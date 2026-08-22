import type {
  AgentProfile,
  Area,
  ChatMessage,
  CoachNudge,
  Db,
  Habit,
  Note,
  Project,
  Tag,
  Task,
} from "@/lib/domain/types";
import { readSse } from "./stream";
import type { TaskEvent } from "@/lib/engine/stateMachine";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : `请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  bootstrap: () => request<Db>("/api/bootstrap"),

  createTask: (input: Record<string, unknown>) =>
    request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(input) }),

  updateTask: (id: string, patch: Record<string, unknown>) =>
    request<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deleteTask: (id: string) =>
    request<{ ok: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),

  transition: (id: string, event: TaskEvent) =>
    request<{ task: Task; spawned: Task | null }>(`/api/tasks/${id}/transition`, {
      method: "POST",
      body: JSON.stringify(event),
    }),

  /** 等待项「戳一下」：重置等待计时 */
  nudgeTask: (id: string) =>
    request<Task>(`/api/tasks/${id}/nudge`, { method: "POST" }),

  /** 转化为笔记（终局之一） */
  taskToNote: (id: string) =>
    request<{ note: Note; task: Task }>(`/api/tasks/${id}/to-note`, { method: "POST" }),

  listNotes: () => request<Note[]>("/api/notes"),

  createNote: (input: Record<string, unknown>) =>
    request<Note>("/api/notes", { method: "POST", body: JSON.stringify(input) }),

  updateNote: (id: string, patch: Record<string, unknown>) =>
    request<Note>(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deleteNote: (id: string) =>
    request<{ ok: boolean }>(`/api/notes/${id}`, { method: "DELETE" }),

  createProject: (name: string) =>
    request<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name }) }),

  updateProject: (id: string, patch: Record<string, unknown>) =>
    request<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  updateSettings: (patch: Record<string, unknown>) =>
    request<Db["settings"]>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),

  createArea: (name: string) =>
    request<Area>("/api/areas", { method: "POST", body: JSON.stringify({ name }) }),

  createTag: (name: string) =>
    request<Tag>("/api/tags", { method: "POST", body: JSON.stringify({ name }) }),

  createReview: (notes: string, checklist: Record<string, boolean>) =>
    request<Db["weeklyReviews"][number]>("/api/reviews", {
      method: "POST",
      body: JSON.stringify({ notes, checklist }),
    }),

  reviewState: () =>
    request<{ reviews: Db["weeklyReviews"]; draft: Db["weeklyReviewDraft"] }>("/api/reviews"),

  saveReviewDraft: (checklist: Record<string, boolean>, notes: string) =>
    request<Db["weeklyReviewDraft"]>("/api/reviews", {
      method: "PATCH",
      body: JSON.stringify({ checklist, notes }),
    }),

  createHabit: (name: string, icon?: string) =>
    request<Habit>("/api/habits", { method: "POST", body: JSON.stringify({ name, icon }) }),

  deleteHabit: (id: string) =>
    request<{ ok: boolean }>(`/api/habits/${id}`, { method: "DELETE" }),

  toggleHabitCheck: (habitId: string, date: string) =>
    request<{ checked: boolean }>(`/api/habits/${habitId}/check`, {
      method: "POST",
      body: JSON.stringify({ date }),
    }),

  runAutomations: () =>
    request<{ applied: number; notifications: string[]; tasks: Task[] }>("/api/automations/run", {
      method: "POST",
    }),

  /** 清空任务与笔记（保留项目/领域/设置/人格） */
  resetData: () =>
    request<{ tasks: number; notes: number }>("/api/reset", {
      method: "POST",
      body: JSON.stringify({ confirm: "RESET" }),
    }),

  aiStatus: () =>
    request<{ enabled: boolean; model: string; baseUrl: string | null }>("/api/ai/status"),

  aiBreakdown: (title: string, notes: string) =>
    request<{ titles: string[] }>("/api/ai/breakdown", {
      method: "POST",
      body: JSON.stringify({ title, notes }),
    }),

  /** 教练层：取今天该说的那一句（大多数日子是 null） */
  coachNudge: () => request<{ nudge: CoachNudge | null }>("/api/agent/nudge"),

  dismissNudge: (id: string) =>
    request<{ nudge: CoachNudge | null }>("/api/agent/nudge", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),

  agentProfile: () => request<AgentProfile>("/api/agent/profile"),

  saveAgentProfile: (patch: Record<string, unknown>) =>
    request<AgentProfile>("/api/agent/profile", { method: "PATCH", body: JSON.stringify(patch) }),

  chatMessages: () => request<ChatMessage[]>("/api/agent/chat"),

  sendChatStream: async (
    text: string,
    onToken: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatMessage[]> => {
    const res = await fetch("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `请求失败（${res.status}）`);
    }
    return new Promise<ChatMessage[]>((resolve, reject) => {
      readSse(res, (ev) => {
        if (ev.type === "token" && ev.text) onToken(ev.text);
        if (ev.type === "done" && ev.messages) resolve(ev.messages);
        if (ev.type === "error") reject(new Error(ev.error ?? "AI 调用失败"));
      }).catch(reject);
    });
  },

  clearChat: () => request<{ ok: boolean }>("/api/agent/chat", { method: "DELETE" }),

  setProposalStatus: (messageId: string, proposalId: string, status: "approved" | "denied") =>
    request<ChatMessage>("/api/agent/proposals", {
      method: "POST",
      body: JSON.stringify({ messageId, proposalId, status }),
    }),
};
