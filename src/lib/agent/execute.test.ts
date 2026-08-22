import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "@/store/useStore";
import { createTask } from "@/lib/domain/factory";
import type { ActionProposal } from "@/lib/domain/types";
import { executeProposalTool } from "./execute";

/** 迷你假 API：模拟 /api/tasks 与 transition/PATCH 行为（含状态机拒绝） */
function mockFetchApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (u.endsWith("/api/tasks") && method === "POST") {
        return new Response(JSON.stringify(createTask(body)), { status: 201 });
      }
      if (u.includes("/transition")) {
        const id = u.split("/").slice(-2)[0];
        const prev = useStore.getState().tasks.find((x) => x.id === id);
        if (!prev) return new Response(JSON.stringify({ error: "任务不存在" }), { status: 404 });
        if (
          body.type === "complete" &&
          prev.phase !== "action" &&
          prev.phase !== "waiting"
        ) {
          return new Response(
            JSON.stringify({ error: `当前阶段（${prev.phase}）的任务不能直接完成` }),
            { status: 409 },
          );
        }
        const next = {
          ...prev,
          status: body.type === "complete" ? "done" : prev.status,
          updatedAt: new Date().toISOString(),
        };
        return new Response(JSON.stringify({ task: next, spawned: null }), { status: 200 });
      }
      if (u.includes("/api/tasks/") && method === "PATCH") {
        const id = u.split("/").pop();
        const prev = useStore.getState().tasks.find((x) => x.id === id);
        const next = { ...prev!, ...body, updatedAt: new Date().toISOString() };
        return new Response(JSON.stringify(next), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }),
  );
}

beforeEach(() => {
  mockFetchApi();
  useStore.setState({ tasks: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function proposal(tool: ActionProposal["tool"], args: Record<string, unknown>): ActionProposal {
  return { id: "p1", tool, args, summary: "测试建议", status: "pending" };
}

describe("executeProposalTool（建议执行器，走现有状态机 API）", () => {
  it("create_task 经 store.addTask 入库", async () => {
    await executeProposalTool(proposal("create_task", { title: "写周报" }));
    expect(useStore.getState().tasks.some((t) => t.title === "写周报")).toBe(true);
  });

  it("complete_task 走状态机完成", async () => {
    const t = createTask({ title: "x", phase: "action" });
    useStore.setState({ tasks: [t] });
    await executeProposalTool(proposal("complete_task", { taskId: t.id }));
    expect(useStore.getState().tasks[0].status).toBe("done");
  });

  it("set_priority / plan_today / add_note 依次生效", async () => {
    const t = createTask({ title: "x", phase: "action", notes: "旧" });
    useStore.setState({ tasks: [t] });
    await executeProposalTool(proposal("set_priority", { taskId: t.id, priority: 1 }));
    await executeProposalTool(proposal("plan_today", { taskId: t.id, day: "2025-01-08" }));
    await executeProposalTool(proposal("add_note", { taskId: t.id, note: "新" }));
    const task = useStore.getState().tasks[0];
    expect(task.priority).toBe(1);
    expect(task.plannedFor).toBe("2025-01-08");
    expect(task.notes).toBe("旧\n新");
  });

  it("plan_today 传 null 可把任务移出今天", async () => {
    const t = createTask({ title: "x", phase: "action", plannedFor: "2025-01-08" });
    useStore.setState({ tasks: [t] });
    await executeProposalTool(proposal("plan_today", { taskId: t.id, day: null }));
    expect(useStore.getState().tasks[0].plannedFor).toBeNull();
  });

  it("reschedule_task 写入 dueDate 与 scheduledAt（补秒）", async () => {
    const t = createTask({ title: "x", phase: "action" });
    useStore.setState({ tasks: [t] });
    await executeProposalTool(
      proposal("reschedule_task", {
        taskId: t.id,
        dueDate: "2025-01-20",
        scheduledAt: "2025-01-20T09:00",
      }),
    );
    const task = useStore.getState().tasks[0];
    expect(task.dueDate).toBe("2025-01-20");
    expect(task.scheduledAt).toBe("2025-01-20T09:00:00");
  });

  it("状态机拒绝时错误向上抛出并带任务标题", async () => {
    const someday = createTask({ title: "将来做", phase: "someday" });
    useStore.setState({ tasks: [someday] });
    await expect(
      executeProposalTool(proposal("complete_task", { taskId: someday.id })),
    ).rejects.toThrow("「将来做」");
  });
});
