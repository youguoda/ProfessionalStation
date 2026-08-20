import type { Area, Db, Project, Tag, Task } from "@/lib/domain/types";
import type { TaskEvent } from "@/lib/engine/stateMachine";

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

  createArea: (name: string) =>
    request<Area>("/api/areas", { method: "POST", body: JSON.stringify({ name }) }),

  createTag: (name: string, kind: "tag" | "context" = "tag") =>
    request<Tag>("/api/tags", { method: "POST", body: JSON.stringify({ name, kind }) }),

  createReview: (notes: string, checklist: Record<string, boolean>) =>
    request<Db["weeklyReviews"][number]>("/api/reviews", {
      method: "POST",
      body: JSON.stringify({ notes, checklist }),
    }),
};
