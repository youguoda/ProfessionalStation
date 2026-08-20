import { describe, expect, it } from "vitest";
import { createTask } from "@/lib/domain/factory";
import { transition } from "./stateMachine";

function inboxTask() {
  return createTask({ title: "测试任务" });
}

describe("状态机：澄清 phase 迁移", () => {
  it("收件箱可澄清为下一步行动，且状态为 todo", () => {
    const r = transition(inboxTask(), { type: "clarify", target: "action" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.phase).toBe("action");
      expect(r.task.status).toBe("todo");
    }
  });

  it("收件箱可澄清为 waiting / someday / reference", () => {
    for (const target of ["waiting", "someday", "reference"] as const) {
      const r = transition(inboxTask(), { type: "clarify", target });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.task.phase).toBe(target);
    }
  });

  it("非收件箱任务不能被澄清", () => {
    const action = createTask({ title: "x", phase: "action" });
    const r = transition(action, { type: "clarify", target: "waiting" });
    expect(r.ok).toBe(false);
  });
});

describe("状态机：执行 status 迁移", () => {
  it("action 可 start 进入 doing", () => {
    const action = createTask({ title: "x", phase: "action" });
    const r = transition(action, { type: "start" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.status).toBe("doing");
  });

  it("非 action 不能 start", () => {
    const waiting = createTask({ title: "x", phase: "waiting" });
    expect(transition(waiting, { type: "start" }).ok).toBe(false);
  });

  it("action 可 complete，写入 completedAt", () => {
    const action = createTask({ title: "x", phase: "action", status: "doing" });
    const r = transition(action, { type: "complete" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.status).toBe("done");
      expect(r.task.completedAt).not.toBeNull();
    }
  });

  it("waiting 可直接 complete（等待项解决）", () => {
    const waiting = createTask({ title: "x", phase: "waiting" });
    const r = transition(waiting, { type: "complete" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.status).toBe("done");
  });

  it("reference 不能 complete", () => {
    const ref = createTask({ title: "x", phase: "reference" });
    expect(transition(ref, { type: "complete" }).ok).toBe(false);
  });

  it("done 可 reopen 回到 todo 并清除 completedAt", () => {
    const done = createTask({ title: "x", phase: "action", status: "done", completedAt: "2025-01-01T00:00:00.000Z" });
    const r = transition(done, { type: "reopen" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.status).toBe("todo");
      expect(r.task.completedAt).toBeNull();
    }
  });

  it("todo/doing 可 cancel", () => {
    const todo = createTask({ title: "x", phase: "action", status: "todo" });
    const r = transition(todo, { type: "cancel" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.status).toBe("canceled");
  });

  it("done 不能 cancel", () => {
    const done = createTask({ title: "x", phase: "action", status: "done" });
    expect(transition(done, { type: "cancel" }).ok).toBe(false);
  });
});

describe("状态机：setStatus（看板拖拽）", () => {
  it("action 任务可移动到任意看板列", () => {
    const action = createTask({ title: "x", phase: "action" });
    const r = transition(action, { type: "setStatus", status: "done" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.status).toBe("done");
      expect(r.task.completedAt).not.toBeNull();
    }
  });

  it("setStatus 回 todo 会清除 completedAt", () => {
    const done = createTask({ title: "x", phase: "action", status: "done", completedAt: "2025-01-01T00:00:00.000Z" });
    const r = transition(done, { type: "setStatus", status: "todo" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.completedAt).toBeNull();
  });

  it("非 action 任务不能 setStatus", () => {
    const inbox = createTask({ title: "x" });
    expect(transition(inbox, { type: "setStatus", status: "doing" }).ok).toBe(false);
  });
});

describe("状态机：trash / restore", () => {
  it("任意阶段可 trash", () => {
    const action = createTask({ title: "x", phase: "action" });
    const r = transition(action, { type: "trash" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.phase).toBe("trash");
  });

  it("trash 不可重复 trash", () => {
    const t = createTask({ title: "x", phase: "trash" });
    expect(transition(t, { type: "trash" }).ok).toBe(false);
  });

  it("trash 可 restore 回 inbox", () => {
    const t = createTask({ title: "x", phase: "trash" });
    const r = transition(t, { type: "restore" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.phase).toBe("inbox");
      expect(r.task.status).toBe("todo");
    }
  });
});
