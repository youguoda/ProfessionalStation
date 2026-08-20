import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTempStore } from "@/test/tmpStore";
import * as store from "./store";

const ts = createTempStore();
beforeEach(() => ts.reset());
afterAll(() => ts.cleanup());

describe("Task 持久化", () => {
  it("createTask 递增 order 并持久化", async () => {
    const a = await store.createTask({ title: "A" });
    const b = await store.createTask({ title: "B" });
    expect(a.order).toBe(0);
    expect(b.order).toBe(1);
    expect(await store.listTasks()).toHaveLength(2);
  });

  it("updateTask 合并且保留 id/createdAt", async () => {
    const t = await store.createTask({ title: "原" });
    const updated = await store.updateTask(t.id, { title: "新", priority: 1 });
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("新");
    expect(updated!.priority).toBe(1);
    expect(updated!.id).toBe(t.id);
    expect(updated!.createdAt).toBe(t.createdAt);
  });

  it("updateTask 未知 id 返回 null", async () => {
    expect(await store.updateTask("missing", { title: "x" })).toBeNull();
  });
});

describe("重复任务", () => {
  it("完成 daily 任务自动生成下一次", async () => {
    const t = await store.createTask({
      title: "每日站会",
      phase: "action",
      repeatRule: "daily",
      dueDate: "2025-01-15",
    });
    const r = await store.transitionTask(t.id, { type: "complete" });
    expect(r.ok).toBe(true);
    const tasks = await store.listTasks();
    const spawned = tasks.find((x) => x.id !== t.id && x.title === "每日站会");
    expect(spawned).toBeDefined();
    expect(spawned!.phase).toBe("action");
    expect(spawned!.status).toBe("todo");
    expect(spawned!.dueDate).toBe("2025-01-16");
    expect(spawned!.repeatRule).toBe("daily");
    expect(spawned!.isFrog).toBe(false);
    expect(spawned!.blockedBy).toEqual([]);
  });

  it("无 repeatRule 完成不生成新任务", async () => {
    const t = await store.createTask({ title: "一次性", phase: "action" });
    await store.transitionTask(t.id, { type: "complete" });
    expect(await store.listTasks()).toHaveLength(1);
  });
});

describe("依赖阻断", () => {
  it("被阻塞的任务 start 返回精确错误", async () => {
    const dep = await store.createTask({ title: "前置", phase: "action" });
    const t = await store.createTask({ title: "后续", phase: "action", blockedBy: [dep.id] });
    const r = await store.transitionTask(t.id, { type: "start" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("存在未完成的依赖任务，无法开始");
  });

  it("依赖完成后可 start", async () => {
    const dep = await store.createTask({ title: "前置", phase: "action" });
    const t = await store.createTask({ title: "后续", phase: "action", blockedBy: [dep.id] });
    await store.transitionTask(dep.id, { type: "complete" });
    const r = await store.transitionTask(t.id, { type: "start" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.status).toBe("doing");
  });
});

describe("软硬删除", () => {
  it("非 trash 删除为软删除（移入回收站）", async () => {
    const t = await store.createTask({ title: "x", phase: "action" });
    await store.deleteTask(t.id);
    const list = await store.listTasks();
    expect(list).toHaveLength(1);
    expect(list[0].phase).toBe("trash");
  });

  it("已 trash 删除为硬删除（从列表移除）", async () => {
    const t = await store.createTask({ title: "x" });
    await store.deleteTask(t.id);
    await store.deleteTask(t.id);
    expect(await store.listTasks()).toHaveLength(0);
  });
});

describe("标签去重", () => {
  it("同名同 kind 复用同一 id", async () => {
    const a = await store.getOrCreateTag("home", "context");
    const b = await store.getOrCreateTag("home", "context");
    expect(a.id).toBe(b.id);
    expect(await store.listTags()).toHaveLength(1);
  });
});

describe("项目/领域", () => {
  it("deleteProject 解除任务关联", async () => {
    const p = await store.createProject("P");
    const t = await store.createTask({ title: "x", projectId: p.id });
    await store.deleteProject(p.id);
    expect(await store.listProjects()).toHaveLength(0);
    expect((await store.getTask(t.id))!.projectId).toBeNull();
  });

  it("deleteArea 解除任务关联", async () => {
    const a = await store.createArea("健康");
    const t = await store.createTask({ title: "x", areaId: a.id });
    await store.deleteArea(a.id);
    expect((await store.getTask(t.id))!.areaId).toBeNull();
  });
});

describe("周回顾与设置", () => {
  it("createWeeklyReview 追加记录", async () => {
    const r = await store.createWeeklyReview({ notes: "本周复盘", checklist: { a: true } });
    expect(r.notes).toBe("本周复盘");
    expect(r.checklist).toEqual({ a: true });
    expect(await store.listWeeklyReviews()).toHaveLength(1);
  });

  it("updateSettings 返回更新后的值", async () => {
    const s = await store.updateSettings({ defaultMode: "kanban" });
    expect(s.defaultMode).toBe("kanban");
    expect((await store.getSettings()).defaultMode).toBe("kanban");
  });
});
