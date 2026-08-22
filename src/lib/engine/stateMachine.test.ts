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
    expect(t.plannedFor).toBeNull();
    expect(t.startedAt).toBeNull();
    expect(t.canceledReason).toBeNull();
    expect(t.nudgedAt).toBeNull();
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

  it("收件箱可澄清为 waiting / someday", () => {
    for (const target of ["waiting", "someday"] as const) {
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
  it("action 可 start 进入 doing，并记录 startedAt", () => {
    const r = transition(createTask({ title: "x", phase: "action" }), { type: "start" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.status).toBe("doing");
      expect(r.task.startedAt).not.toBeNull();
    }
  });

  it("doing 可 stop 放回待办，并清除 startedAt", () => {
    const doing = createTask({ title: "x", phase: "action", status: "doing" });
    doing.startedAt = "2025-01-01T00:00:00.000Z";
    const r = transition(doing, { type: "stop" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.status).toBe("todo");
      expect(r.task.startedAt).toBeNull();
    }
  });

  it("非 doing 不能 stop", () => {
    expect(
      transition(createTask({ title: "x", phase: "action", status: "todo" }), { type: "stop" }).ok,
    ).toBe(false);
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

  it("someday 不能直接 complete（先提到下一步）", () => {
    expect(
      transition(createTask({ title: "x", phase: "someday" }), { type: "complete" }).ok,
    ).toBe(false);
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

  it("todo/doing 可 cancel，并写入 completedAt（取消也是终局）", () => {
    for (const status of ["todo", "doing"] as const) {
      const r = transition(createTask({ title: "x", phase: "action", status }), { type: "cancel" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.task.status).toBe("canceled");
        expect(r.task.completedAt).not.toBeNull();
      }
    }
  });

  it("cancel 可记录原因，空白原因归一化为 null", () => {
    const withReason = transition(createTask({ title: "x", phase: "action" }), {
      type: "cancel",
      reason: "  需求砍掉了  ",
    });
    expect(withReason.ok).toBe(true);
    if (withReason.ok) expect(withReason.task.canceledReason).toBe("需求砍掉了");

    const blank = transition(createTask({ title: "x", phase: "action" }), {
      type: "cancel",
      reason: "   ",
    });
    expect(blank.ok).toBe(true);
    if (blank.ok) expect(blank.task.canceledReason).toBeNull();
  });

  it("reopen 会清除取消原因", () => {
    const canceled = createTask({ title: "x", phase: "action", status: "canceled" });
    canceled.canceledReason = "不做了";
    const r = transition(canceled, { type: "reopen" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.canceledReason).toBeNull();
  });

  it("done 不能 cancel", () => {
    expect(transition(createTask({ title: "x", phase: "action", status: "done" }), { type: "cancel" }).ok).toBe(false);
  });

  it("已取消的任务不能重复 cancel", () => {
    expect(
      transition(createTask({ title: "x", phase: "action", status: "canceled" }), {
        type: "cancel",
      }).ok,
    ).toBe(false);
  });
});

describe("状态机：trash / restore", () => {
  it("任意阶段可 trash，并释放今天的额度", () => {
    const t = createTask({ title: "x", phase: "action", plannedFor: "2025-01-08" });
    const r = transition(t, { type: "trash" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.phase).toBe("trash");
      expect(r.task.plannedFor).toBeNull();
    }
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
