import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTempStore } from "@/test/tmpStore";
import { GET as getBootstrap } from "./bootstrap/route";
import { POST as postTask } from "./tasks/route";
import { PATCH as patchTask, DELETE as deleteTask } from "./tasks/[id]/route";
import { POST as postTransition } from "./tasks/[id]/transition/route";
import { POST as postProject } from "./projects/route";
import { PATCH as patchProject } from "./projects/[id]/route";
import { POST as postArea } from "./areas/route";
import { POST as postTag } from "./tags/route";
import { PATCH as patchSettings } from "./settings/route";

const ts = createTempStore();
beforeEach(() => ts.reset());
afterAll(() => ts.cleanup());

function jsonReq(url: string, body: unknown, method = "POST"): Request {
  return new Request(`http://test${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function create(body: Record<string, unknown>) {
  const res = await postTask(jsonReq("/api/tasks", body));
  return res.json() as Promise<{ id: string } & Record<string, unknown>>;
}

describe("API：任务校验", () => {
  it("空标题返回 400", async () => {
    const res = await postTask(jsonReq("/api/tasks", {}));
    expect(res.status).toBe(400);
  });

  it("合法创建返回 201 与收件箱任务", async () => {
    const res = await postTask(jsonReq("/api/tasks", { title: "买牛奶" }));
    expect(res.status).toBe(201);
    const task = await res.json();
    expect(task.title).toBe("买牛奶");
    expect(task.phase).toBe("inbox");
    expect(task.status).toBe("todo");
    expect(task.id).toBeTruthy();
  });
});

describe("API：状态机流转", () => {
  it("clarify → action 返回 200", async () => {
    const t = await create({ title: "x" });
    const res = await postTransition(
      jsonReq(`/api/tasks/${t.id}/transition`, { type: "clarify", target: "action" }),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).phase).toBe("action");
  });

  it("reference 完成返回 409", async () => {
    const t = await create({ title: "x", phase: "reference" });
    const res = await postTransition(
      jsonReq(`/api/tasks/${t.id}/transition`, { type: "complete" }),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    expect(res.status).toBe(409);
  });

  it("非法事件类型返回 400", async () => {
    const t = await create({ title: "x" });
    const res = await postTransition(
      jsonReq(`/api/tasks/${t.id}/transition`, { type: "unknown" }),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    expect(res.status).toBe(400);
  });
});

describe("API：依赖阻断", () => {
  it("start 被阻塞返回 409 与精确错误", async () => {
    const dep = await create({ title: "前置", phase: "action" });
    const t = await create({ title: "后续", phase: "action", blockedBy: [dep.id] });
    const res = await postTransition(
      jsonReq(`/api/tasks/${t.id}/transition`, { type: "start" }),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("存在未完成的依赖任务，无法开始");
  });
});

describe("API：重复任务", () => {
  it("完成 daily 后 bootstrap 出现下一次", async () => {
    const t = await create({ title: "站会", phase: "action", repeatRule: "daily", dueDate: "2025-01-15" });
    await postTransition(
      jsonReq(`/api/tasks/${t.id}/transition`, { type: "complete" }),
      { params: Promise.resolve({ id: t.id as string }) },
    );
    const db = await (await getBootstrap()).json();
    const spawned = db.tasks.find((x: { id: string; title: string }) => x.id !== t.id && x.title === "站会");
    expect(spawned).toBeDefined();
    expect(spawned.dueDate).toBe("2025-01-16");
    expect(spawned.phase).toBe("action");
  });
});

describe("API：PATCH / DELETE", () => {
  it("PATCH 未知 id 返回 404", async () => {
    const res = await patchTask(jsonReq("/api/tasks/missing", { title: "x" }, "PATCH"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE 软删除后 bootstrap 仍含该任务且 phase=trash", async () => {
    const t = await create({ title: "x" });
    const res = await deleteTask(new Request("http://test"), {
      params: Promise.resolve({ id: t.id as string }),
    });
    expect(res.status).toBe(200);
    const db = await (await getBootstrap()).json();
    const found = db.tasks.find((x: { id: string }) => x.id === t.id);
    expect(found.phase).toBe("trash");
  });
});

describe("API：项目/领域/标签/bootstrap", () => {
  it("空项目名返回 400", async () => {
    const res = await postProject(jsonReq("/api/projects", { name: "" }));
    expect(res.status).toBe(400);
  });

  it("合法项目/领域/标签返回 201", async () => {
    expect((await postProject(jsonReq("/api/projects", { name: "P" }))).status).toBe(201);
    expect((await postArea(jsonReq("/api/areas", { name: "健康" }))).status).toBe(201);
    expect((await postTag(jsonReq("/api/tags", { name: "home", kind: "context" }))).status).toBe(201);
  });

  it("bootstrap 返回完整结构", async () => {
    const db = await (await getBootstrap()).json();
    expect(Array.isArray(db.tasks)).toBe(true);
    expect(Array.isArray(db.projects)).toBe(true);
    expect(Array.isArray(db.areas)).toBe(true);
    expect(Array.isArray(db.tags)).toBe(true);
    expect(Array.isArray(db.weeklyReviews)).toBe(true);
    expect(db.settings).toBeDefined();
  });
});

describe("API：依赖成环防护", () => {
  it("PATCH 自依赖返回 400 与精确错误", async () => {
    const a = await create({ title: "a", phase: "action" });
    const res = await patchTask(
      jsonReq(`/api/tasks/${a.id}`, { blockedBy: [a.id] }, "PATCH"),
      { params: Promise.resolve({ id: a.id as string }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("不能添加该依赖：会造成自依赖或循环依赖");
  });
});

describe("API：设置与项目归档", () => {
  it("PATCH settings 更新看板 WIP", async () => {
    const res = await patchSettings(
      jsonReq("/api/settings", { kanbanWip: { todo: 2, doing: 1, done: -1, canceled: -1 } }, "PATCH"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kanbanWip.todo).toBe(2);
    expect(body.kanbanWip.done).toBe(-1);
  });

  it("PATCH 项目归档与恢复", async () => {
    const p = await (await postProject(jsonReq("/api/projects", { name: "P" }))).json();
    const r1 = await patchProject(
      jsonReq(`/api/projects/${p.id}`, { archived: true }, "PATCH"),
      { params: Promise.resolve({ id: p.id }) },
    );
    expect(r1.status).toBe(200);
    expect((await r1.json()).archived).toBe(true);
    const r2 = await patchProject(
      jsonReq(`/api/projects/${p.id}`, { archived: false }, "PATCH"),
      { params: Promise.resolve({ id: p.id }) },
    );
    expect((await r2.json()).archived).toBe(false);
  });
});
