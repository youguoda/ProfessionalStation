import type {
  AgentProfile,
  Area,
  ChatMessage,
  Db,
  Habit,
  Project,
  Tag,
  Task,
} from "@/lib/domain/types";
import type { TaskEvent } from "@/lib/engine/stateMachine";
import type { SlotSuggestion } from "@/lib/engine/scheduler";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `请求失败（${res.status}）`);
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
    request<Task>(`/api/tasks/${id}/transition`, { method: "POST", body: JSON.stringify(event) }),

  createProject: (name: string) =>
    request<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name }) }),

  updateProject: (id: string, patch: Record<string, unknown>) =>
    request<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  updateSettings: (patch: Record<string, unknown>) =>
    request<Db["settings"]>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),

  createArea: (name: string) =>
    request<Area>("/api/areas", { method: "POST", body: JSON.stringify({ name }) }),

  createTag: (name: string, kind: "tag" | "context" = "tag") =>
    request<Tag>("/api/tags", { method: "POST", body: JSON.stringify({ name, kind }) }),

  createReview: (notes: string, checklist: Record<string, boolean>) =>
    request<Db["weeklyReviews"][number]>("/api/reviews", {
      method: "POST",
      body: JSON.stringify({ notes, checklist }),
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

  aiStatus: () =>
    request<{ enabled: boolean; model: string; baseUrl: string | null }>("/api/ai/status"),

  aiBreakdown: (title: string, notes: string) =>
    request<{ titles: string[] }>("/api/ai/breakdown", {
      method: "POST",
      body: JSON.stringify({ title, notes }),
    }),

  aiSchedule: () =>
    request<{ suggestions: SlotSuggestion[]; source: "ai" | "heuristic" }>("/api/ai/schedule", {
      method: "POST",
    }),

  agentProfile: () => request<AgentProfile>("/api/agent/profile"),

  saveAgentProfile: (patch: Record<string, unknown>) =>
    request<AgentProfile>("/api/agent/profile", { method: "PATCH", body: JSON.stringify(patch) }),

  chatMessages: () => request<ChatMessage[]>("/api/agent/chat"),

  sendChat: (text: string) =>
    request<{ messages: ChatMessage[] }>("/api/agent/chat", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  clearChat: () => request<{ ok: boolean }>("/api/agent/chat", { method: "DELETE" }),

  setProposalStatus: (messageId: string, proposalId: string, status: "approved" | "denied") =>
    request<ChatMessage>("/api/agent/proposals", {
      method: "POST",
      body: JSON.stringify({ messageId, proposalId, status }),
    }),
};
