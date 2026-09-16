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

  /** 记下今天已经做过开机仪式，当天不再拦 */
  finishRitual: () =>
    request<{ day: string; pending: boolean }>("/api/ritual", { method: "POST" }),

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

  /**
   * 任务拆分。turns 是拆分前的来回对话——信息不够时马力会先反问一句，
   * 把背景问清楚再拆，返回 question；够了就返回 titles。
   */
  aiBreakdown: (
    title: string,
    notes: string,
    turns: Array<{ role: "assistant" | "user"; content: string }> = [],
  ) =>
    request<{ question: string | null; titles: string[] }>("/api/ai/breakdown", {
      method: "POST",
      body: JSON.stringify({ title, notes, turns }),
    }),

  /** 让马力按本周数据起一份复盘笔记初稿（AI 不可用时本地兜底，一样有内容） */
  reviewDraft: () =>
    request<{ draft: string; byAi: boolean }>("/api/agent/review-draft", { method: "POST" }),

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
    /** token 之外的通知：阶段变化 + 思考增量 + 延迟到达的建议卡片 */
    onNotice?: (
      ev:
        | { type: "phase"; phase: "context" | "model" }
        | { type: "reasoning"; text: string }
        | { type: "proposals"; messages: ChatMessage[] },
    ) => void,
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
      // resolve 之后 readSse 仍在消费：晚到的 proposals 事件继续经 onNotice 上抛
      readSse(res, (ev) => {
        if (ev.type === "token" && ev.text) onToken(ev.text);
        if (ev.type === "reasoning" && ev.text) onNotice?.({ type: "reasoning", text: ev.text });
        if (ev.type === "phase") onNotice?.({ type: "phase", phase: ev.phase ?? "model" });
        if (ev.type === "proposals" && ev.messages) onNotice?.({ type: "proposals", messages: ev.messages });
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
