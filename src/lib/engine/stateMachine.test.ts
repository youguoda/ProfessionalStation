import { describe, expect, it } from "vitest";
import { createTask } from "@/lib/domain/factory";
import { transition, transitionMany } from "./stateMachine";

describe("createTask 默认值", () => {
  it("标题 trim，默认收件箱待办，字段齐全", () => {
    const t = createTask({ title: "  测试  " });
    expect(t.title).toBe("测试");
    expect(t.phase).toBe("inbox");
    expect(t.status).toBe("todo");
    expect(t.priority).toBe(3);
    expect(t.effort).toBeNull();
    expect(t.completedAt).toBeNull();
    expect(t.blockedBy).toEqual([]);
    expect(t.repeatRule).toBeNull();
    expect(t.waitingFor).toBeNull();
    expect(t.tags).toEqual([]);
    expect(t.contexts).toEqual([]);
  });
});

describe("状态机：澄清 phase 迁移", () => {
  it("收件箱可澄清为下一步行动，且状态为 todo", () => {
    const r = transition(createTask({ title: "x" }), { type: "clarify", target: "action" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.phase).toBe("action");
      expect(r.task.status).toBe("todo");
    }
  });

  it("收件箱可澄清为 waiting / someday / reference", () => {
    for (const target of ["waiting", "someday", "reference"] as const) {
      const r = transition(createTask({ title: "x" }), { type: "clarify", target });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.task.phase).toBe(target);
    }
  });

  it("非收件箱任务不能被澄清", () => {
    const action = createTask({ title: "x", phase: "action" });
    const r = transition(action, { type: "clarify", target: "waiting" });
    expect(r.ok).toBe(false);
  });

  it("回收站中的任务可被澄清（恢复路径）", () => {
    const trash = createTask({ title: "x", phase: "trash" });
    const r = transition(trash, { type: "clarify", target: "action" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.phase).toBe("action");
  });
});

describe("状态机：执行 status 迁移", () => {
  it("action 可 start 进入 doing", () => {
    const r = transition(createTask({ title: "x", phase: "action" }), { type: "start" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.status).toBe("doing");
  });

  it("非 action 不能 start", () => {
    const waiting = createTask({ title: "x", phase: "waiting" });
    expect(transition(waiting, { type: "start" }).ok).toBe(false);
  });

  it("已在 doing 的任务不能重复 start", () => {
    const doing = createTask({ title: "x", phase: "action", status: "doing" });
    expect(transition(doing, { type: "start" }).ok).toBe(false);
  });

  it("action 可 complete，写入 completedAt", () => {
    const r = transition(createTask({ title: "x", phase: "action", status: "doing" }), {
      type: "complete",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.status).toBe("done");
      expect(r.task.completedAt).not.toBeNull();
    }
  });

  it("waiting 可直接 complete（等待项解决）", () => {
    const r = transition(createTask({ title: "x", phase: "waiting" }), { type: "complete" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.status).toBe("done");
  });

  it("reference 不能 complete", () => {
    expect(transition(createTask({ title: "x", phase: "reference" }), { type: "complete" }).ok).toBe(false);
  });

  it("已完成的任务不能重复 complete", () => {
    expect(
      transition(createTask({ title: "x", phase: "action", status: "done" }), { type: "complete" }).ok,
    ).toBe(false);
  });

  it("done 可 reopen 回到 todo 并清除 completedAt", () => {
    const done = createTask({
      title: "x",
      phase: "action",
      status: "done",
      completedAt: "2025-01-01T00:00:00.000Z",
    });
    const r = transition(done, { type: "reopen" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.status).toBe("todo");
      expect(r.task.completedAt).toBeNull();
    }
  });

  it("canceled 可 reopen", () => {
    const canceled = createTask({ title: "x", phase: "action", status: "canceled" });
    const r = transition(canceled, { type: "reopen" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.status).toBe("todo");
  });

  it("todo 不能 reopen", () => {
    expect(transition(createTask({ title: "x", phase: "action", status: "todo" }), { type: "reopen" }).ok).toBe(false);
  });

  it("todo/doing 可 cancel", () => {
    for (const status of ["todo", "doing"] as const) {
      const r = transition(createTask({ title: "x", phase: "action", status }), { type: "cancel" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.task.status).toBe("canceled");
    }
  });

  it("done 不能 cancel", () => {
    expect(transition(createTask({ title: "x", phase: "action", status: "done" }), { type: "cancel" }).ok).toBe(false);
  });
});

describe("状态机：setStatus（看板拖拽）", () => {
  it("action 任务可移动到 done，写入 completedAt", () => {
    const r = transition(createTask({ title: "x", phase: "action" }), { type: "setStatus", status: "done" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.status).toBe("done");
      expect(r.task.completedAt).not.toBeNull();
    }
  });

  it("setStatus 回 todo 会清除 completedAt", () => {
    const done = createTask({
      title: "x",
      phase: "action",
      status: "done",
      completedAt: "2025-01-01T00:00:00.000Z",
    });
    const r = transition(done, { type: "setStatus", status: "todo" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.completedAt).toBeNull();
  });

  it("非 action 任务不能 setStatus", () => {
    expect(transition(createTask({ title: "x" }), { type: "setStatus", status: "doing" }).ok).toBe(false);
  });
});

describe("状态机：trash / restore", () => {
  it("任意阶段可 trash", () => {
    const r = transition(createTask({ title: "x", phase: "action" }), { type: "trash" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.phase).toBe("trash");
  });

  it("trash 不可重复 trash", () => {
    expect(transition(createTask({ title: "x", phase: "trash" }), { type: "trash" }).ok).toBe(false);
  });

  it("trash 可 restore 回 inbox", () => {
    const r = transition(createTask({ title: "x", phase: "trash" }), { type: "restore" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.phase).toBe("inbox");
      expect(r.task.status).toBe("todo");
    }
  });

  it("非 trash 不能 restore", () => {
    expect(transition(createTask({ title: "x", phase: "action" }), { type: "restore" }).ok).toBe(false);
  });
});

describe("transitionMany 批量应用", () => {
  it("顺序应用直到完成", () => {
    const r = transitionMany(createTask({ title: "x" }), [
      { type: "clarify", target: "action" },
      { type: "start" },
      { type: "complete" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.status).toBe("done");
  });

  it("遇到非法事件即停止", () => {
    const r = transitionMany(createTask({ title: "x" }), [{ type: "start" }, { type: "complete" }]);
    expect(r.ok).toBe(false);
  });
});
