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
    const r = await store.updateTask(t.id, { title: "新", priority: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.title).toBe("新");
      expect(r.task.priority).toBe(1);
      expect(r.task.id).toBe(t.id);
      expect(r.task.createdAt).toBe(t.createdAt);
    }
  });

  it("updateTask 未知 id 返回 NOT_FOUND", async () => {
    const r = await store.updateTask("missing", { title: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_FOUND");
  });
});

describe("依赖成环防护", () => {
  it("自依赖被拒绝", async () => {
    const a = await store.createTask({ title: "a", phase: "action" });
    const r = await store.updateTask(a.id, { blockedBy: [a.id] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("INVALID_DEPENDENCY");
      expect(r.error).toBe("不能添加该依赖：会造成自依赖或循环依赖");
    }
  });

  it("互依成环被拒绝（A→B→A）", async () => {
    const a = await store.createTask({ title: "a", phase: "action" });
    const b = await store.createTask({ title: "b", phase: "action", blockedBy: [a.id] });
    const r = await store.updateTask(a.id, { blockedBy: [b.id] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_DEPENDENCY");
  });

  it("合法依赖可添加", async () => {
    const a = await store.createTask({ title: "a", phase: "action" });
    const b = await store.createTask({ title: "b", phase: "action" });
    const r = await store.updateTask(b.id, { blockedBy: [a.id] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.blockedBy).toEqual([a.id]);
  });
});

describe("青蛙约束", () => {
  it("第一只青蛙可设置", async () => {
    const a = await store.createTask({ title: "a", phase: "action" });
    const r = await store.updateTask(a.id, { isFrog: true });
    expect(r.ok).toBe(true);
  });

  it("第二只青蛙被拒绝并返回 INVALID_FROG", async () => {
    const a = await store.createTask({ title: "a", phase: "action" });
    const b = await store.createTask({ title: "b", phase: "action" });
    await store.updateTask(a.id, { isFrog: true });
    const r = await store.updateTask(b.id, { isFrog: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("INVALID_FROG");
      expect(r.error).toContain("a");
    }
  });

  it("先取消旧青蛙再设新的可成功", async () => {
    const a = await store.createTask({ title: "a", phase: "action" });
    const b = await store.createTask({ title: "b", phase: "action" });
    await store.updateTask(a.id, { isFrog: true });
    await store.updateTask(a.id, { isFrog: false });
    const r = await store.updateTask(b.id, { isFrog: true });
    expect(r.ok).toBe(true);
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

describe("习惯追踪", () => {
  it("createHabit / listHabits", async () => {
    const h = await store.createHabit("阅读", "📚");
    expect(h.name).toBe("阅读");
    expect(h.icon).toBe("📚");
    expect(await store.listHabits()).toHaveLength(1);
  });

  it("toggleHabitCheck 打卡与取消", async () => {
    const h = await store.createHabit("阅读");
    expect(await store.toggleHabitCheck(h.id, "2025-01-08")).toEqual({ checked: true });
    expect(await store.listHabitChecks()).toHaveLength(1);
    expect(await store.toggleHabitCheck(h.id, "2025-01-08")).toEqual({ checked: false });
    expect(await store.listHabitChecks()).toHaveLength(0);
  });

  it("toggleHabitCheck 未知习惯返回 null", async () => {
    expect(await store.toggleHabitCheck("missing", "2025-01-08")).toBeNull();
  });

  it("deleteHabit 同时清理打卡记录", async () => {
    const h = await store.createHabit("阅读");
    await store.toggleHabitCheck(h.id, "2025-01-08");
    await store.deleteHabit(h.id);
    expect(await store.listHabits()).toHaveLength(0);
    expect(await store.listHabitChecks()).toHaveLength(0);
  });
});

describe("自动化运行", () => {
  it("runAutomations 应用超期青蛙标记且幂等", async () => {
    await store.updateSettings({
      automations: { autoFlagOverdueFrog: true, autoClearFrogOnDone: true, staleWaitingReminder: false },
    });
    const t = await store.createTask({ title: "报告", phase: "action", dueDate: "2020-01-01" });
    const r = await store.runAutomations();
    expect(r.applied).toBe(1);
    expect(r.notifications.length).toBeGreaterThanOrEqual(1);
    expect((await store.getTask(t.id))!.isFrog).toBe(true);
    expect((await store.runAutomations()).applied).toBe(0);
  });

  it("默认关闭：runAutomations 不自动标记青蛙", async () => {
    const t = await store.createTask({ title: "报告", phase: "action", dueDate: "2020-01-01" });
    const r = await store.runAutomations();
    expect(r.applied).toBe(0);
    expect((await store.getTask(t.id))!.isFrog).toBe(false);
  });

  it("runAutomations 清除已完成任务的青蛙", async () => {
    const t = await store.createTask({ title: "x", phase: "action", status: "done", isFrog: true });
    const r = await store.runAutomations();
    expect(r.applied).toBe(1);
    expect((await store.getTask(t.id))!.isFrog).toBe(false);
  });

  it("旧数据迁移：缺失 habits/automations 字段的 db 可正常读取", async () => {
    const { promises: fs } = await import("node:fs");
    const { join } = await import("node:path");
    await store.createTask({ title: "x" }); // 确保数据目录存在
    const file = join(process.env.DATA_DIR!, "db.json");
    const old = {
      tasks: [],
      projects: [],
      areas: [],
      tags: [],
      weeklyReviews: [],
      settings: {
        defaultMode: "gtd",
        kanbanWip: { todo: -1, doing: -1, done: -1, canceled: -1 },
      },
    };
    await fs.writeFile(file, JSON.stringify(old), "utf-8");
    store.__resetStore();
    const db = await store.getDb();
    expect(db.habits).toEqual([]);
    expect(db.habitChecks).toEqual([]);
    expect(db.settings.automations.autoFlagOverdueFrog).toBe(false);
    expect(db.settings.automations.autoClearFrogOnDone).toBe(true);
    expect(db.settings.automations.staleWaitingReminder).toBe(false);
    expect(db.settings.theme).toBe("system");
    expect(db.settings.dayStartHour).toBe(8);
    expect(db.settings.dayEndHour).toBe(22);
    expect(db.weeklyReviewDraft).toEqual({ checklist: {}, notes: "" });
    expect(db.chatSummary).toBe("");
  });
});

describe("活动历史", () => {
  it("状态迁移追加历史", async () => {
    const t = await store.createTask({ title: "x", phase: "action" });
    await store.transitionTask(t.id, { type: "start" });
    await store.transitionTask(t.id, { type: "complete" });
    const task = await store.getTask(t.id);
    expect(task!.history.map((h) => h.label)).toEqual(["开始执行", "完成"]);
  });

  it("关键字段更新追加历史", async () => {
    const t = await store.createTask({ title: "x", phase: "action" });
    await store.updateTask(t.id, { priority: 1 });
    await store.updateTask(t.id, { isFrog: true });
    const task = await store.getTask(t.id);
    expect(task!.history.map((h) => h.label)).toEqual(["优先级设为 P1", "标记为青蛙"]);
  });

  it("历史条目最多保留 50 条", async () => {
    const t = await store.createTask({ title: "x", phase: "action" });
    for (let i = 0; i < 55; i++) {
      const p = i % 2 === 0 ? 1 : 2;
      await store.updateTask(t.id, { priority: p });
    }
    const task = await store.getTask(t.id);
    expect(task!.history).toHaveLength(50);
  });
});

describe("周回顾草稿", () => {
  it("草稿读写一致", async () => {
    await store.setWeeklyReviewDraft({ checklist: { a: true }, notes: "复盘" });
    const draft = await store.getWeeklyReviewDraft();
    expect(draft).toEqual({ checklist: { a: true }, notes: "复盘" });
  });

  it("完成回顾后草稿清空", async () => {
    await store.setWeeklyReviewDraft({ checklist: { a: true }, notes: "复盘" });
    await store.createWeeklyReview({ notes: "复盘", checklist: { a: true } });
    expect(await store.getWeeklyReviewDraft()).toEqual({ checklist: {}, notes: "" });
  });
});

describe("durationMinutes 模型", () => {
  it("默认 30 分钟", async () => {
    const t = await store.createTask({ title: "x" });
    expect(t.durationMinutes).toBe(30);
  });

  it("可通过 updateTask 调整", async () => {
    const t = await store.createTask({ title: "x" });
    const r = await store.updateTask(t.id, { durationMinutes: 90 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.durationMinutes).toBe(90);
  });
});
