import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTempStore } from "@/test/tmpStore";
import { isoDay } from "@/lib/engine/selectors";
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

describe("在制品上限（WIP）", () => {
  async function startN(n: number) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = await store.createTask({ title: `t${i}`, phase: "action" });
      const r = await store.transitionTask(t.id, { type: "start" });
      expect(r.ok).toBe(true);
      ids.push(t.id);
    }
    return ids;
  }

  it("达到上限前可以正常开始", async () => {
    await startN(3); // 默认 maxDoing = 3
    const tasks = await store.listTasks();
    expect(tasks.filter((t) => t.status === "doing")).toHaveLength(3);
  });

  it("超过上限时 start 被硬拦，并说明怎么解决", async () => {
    await startN(3);
    const extra = await store.createTask({ title: "第四件", phase: "action" });
    const r = await store.transitionTask(extra.id, { type: "start" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("上限 3");
      expect(r.error).toContain("放回待办");
    }
  });

  it("结掉一件之后又能开始新的", async () => {
    const ids = await startN(3);
    await store.transitionTask(ids[0], { type: "complete" });
    const extra = await store.createTask({ title: "第四件", phase: "action" });
    expect((await store.transitionTask(extra.id, { type: "start" })).ok).toBe(true);
  });

  it("放回待办同样释放名额", async () => {
    const ids = await startN(3);
    const stopped = await store.transitionTask(ids[0], { type: "stop" });
    expect(stopped.ok).toBe(true);
    const extra = await store.createTask({ title: "第四件", phase: "action" });
    expect((await store.transitionTask(extra.id, { type: "start" })).ok).toBe(true);
  });

  it("上限可调：设为 1 后第二件就被拦下", async () => {
    await store.updateSettings({ maxDoing: 1 });
    await startN(1);
    const b = await store.createTask({ title: "b", phase: "action" });
    expect((await store.transitionTask(b.id, { type: "start" })).ok).toBe(false);
  });
});

describe("开始即承诺", () => {
  it("start 会把任务自动放进今天", async () => {
    const t = await store.createTask({ title: "x", phase: "action" });
    const r = await store.transitionTask(t.id, { type: "start" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.plannedFor).toBe(isoDay(new Date()));
  });

  it("已有承诺日的任务 start 不会被覆盖", async () => {
    const t = await store.createTask({ title: "x", phase: "action", plannedFor: "2030-01-01" });
    const r = await store.transitionTask(t.id, { type: "start" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.plannedFor).toBe("2030-01-01");
  });

  it("完成后自动移出今天（默认开启）", async () => {
    const t = await store.createTask({ title: "x", phase: "action" });
    await store.transitionTask(t.id, { type: "start" });
    const r = await store.transitionTask(t.id, { type: "complete" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.plannedFor).toBeNull();
  });

  it("取消同样移出今天并记录原因", async () => {
    const t = await store.createTask({ title: "x", phase: "action", plannedFor: "2025-01-08" });
    const r = await store.transitionTask(t.id, { type: "cancel", reason: "需求砍了" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.plannedFor).toBeNull();
      expect(r.task.canceledReason).toBe("需求砍了");
    }
  });
});

describe("等待项「戳一下」", () => {
  it("nudgeTask 重置计时并记历史", async () => {
    const t = await store.createTask({ title: "等报价", phase: "waiting" });
    expect(t.nudgedAt).toBeNull();
    const nudged = await store.nudgeTask(t.id);
    expect(nudged).not.toBeNull();
    expect(nudged!.nudgedAt).not.toBeNull();
    expect(nudged!.history.map((h) => h.label)).toContain("戳了一下");
  });

  it("未知 id 返回 null", async () => {
    expect(await store.nudgeTask("missing")).toBeNull();
  });
});

describe("转化为笔记（终局之一）", () => {
  it("内容留存到笔记，任务移入回收站可恢复", async () => {
    const t = await store.createTask({ title: "VLLM 报错", notes: "block_size 调到 16", phase: "inbox" });
    const r = await store.convertTaskToNote(t.id);
    expect(r).not.toBeNull();
    expect(r!.note.content).toContain("VLLM 报错");
    expect(r!.note.content).toContain("block_size");
    expect(r!.task.phase).toBe("trash");
    expect(await store.listNotes()).toHaveLength(1);
  });

  it("未知 id 返回 null", async () => {
    expect(await store.convertTaskToNote("missing")).toBeNull();
  });
});

describe("笔记 CRUD", () => {
  it("增改查删", async () => {
    const n = await store.createNote({ content: "第一条" });
    expect(await store.listNotes()).toHaveLength(1);

    const updated = await store.updateNote(n.id, { content: "改过了" });
    expect(updated!.content).toBe("改过了");
    expect(updated!.createdAt).toBe(n.createdAt);

    expect(await store.deleteNote(n.id)).toBe(true);
    expect(await store.listNotes()).toHaveLength(0);
    expect(await store.deleteNote(n.id)).toBe(false);
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
    expect(spawned!.plannedFor).toBeNull();
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
  it("同名复用同一 id", async () => {
    const a = await store.getOrCreateTag("home");
    const b = await store.getOrCreateTag("home");
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
    const s = await store.updateSettings({ maxToday: 3 });
    expect(s.maxToday).toBe(3);
    expect((await store.getSettings()).maxToday).toBe(3);
  });

  it("updateSettings 合并 automations，不整体覆盖", async () => {
    await store.updateSettings({ automations: { staleWaitingReminder: true } as never });
    const s = await store.getSettings();
    expect(s.automations.staleWaitingReminder).toBe(true);
    expect(s.automations.autoClearPlanOnDone).toBe(true);
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
  it("清除已结束任务的承诺日，且幂等", async () => {
    const t = await store.createTask({
      title: "x",
      phase: "action",
      status: "done",
      plannedFor: "2025-01-08",
    });
    const r = await store.runAutomations();
    expect(r.applied).toBe(1);
    expect((await store.getTask(t.id))!.plannedFor).toBeNull();
    expect((await store.runAutomations()).applied).toBe(0);
  });

  it("未完成任务的承诺日不被清除", async () => {
    const t = await store.createTask({
      title: "x",
      phase: "action",
      plannedFor: "2025-01-08",
    });
    expect((await store.runAutomations()).applied).toBe(0);
    expect((await store.getTask(t.id))!.plannedFor).toBe("2025-01-08");
  });

  it("规则关闭后不再清除", async () => {
    await store.updateSettings({
      automations: { autoClearPlanOnDone: false, staleWaitingReminder: false },
    });
    const t = await store.createTask({
      title: "x",
      phase: "action",
      status: "done",
      plannedFor: "2025-01-08",
    });
    expect((await store.runAutomations()).applied).toBe(0);
    expect((await store.getTask(t.id))!.plannedFor).toBe("2025-01-08");
  });
});

describe("旧数据迁移", () => {
  async function writeLegacy(old: unknown) {
    const { promises: fs } = await import("node:fs");
    const { join } = await import("node:path");
    await store.createTask({ title: "seed" }); // 确保数据目录存在
    const file = join(process.env.DATA_DIR!, "db.json");
    await fs.writeFile(file, JSON.stringify(old), "utf-8");
    store.__resetStore();
    return store.getDb();
  }

  it("缺失字段的旧 db 可正常读取并补齐默认值", async () => {
    const db = await writeLegacy({
      tasks: [],
      projects: [],
      areas: [],
      tags: [],
      weeklyReviews: [],
      settings: { defaultMode: "gtd", kanbanWip: { todo: -1 } },
    });
    expect(db.notes).toEqual([]);
    expect(db.habits).toEqual([]);
    expect(db.settings.automations.autoClearPlanOnDone).toBe(true);
    expect(db.settings.automations.staleWaitingReminder).toBe(false);
    expect(db.settings.theme).toBe("system");
    expect(db.settings.maxToday).toBe(6);
    expect(db.settings.maxDoing).toBe(3);
    expect(db.settings.staleDays).toBe(7);
    expect(db.weeklyReviewDraft).toEqual({ checklist: {}, notes: "" });
    expect(db.chatSummary).toBe("");
  });

  it("phase=reference 的旧任务迁移成笔记", async () => {
    const db = await writeLegacy({
      tasks: [
        {
          id: "r1",
          title: "学习 VLLM",
          notes: "PagedAttention",
          phase: "reference",
          status: "todo",
          priority: 3,
          tags: [],
          projectId: null,
          createdAt: "2026-08-20T19:21:32.661Z",
          updatedAt: "2026-08-20T19:21:32.661Z",
        },
      ],
    });
    expect(db.tasks).toHaveLength(0);
    expect(db.notes).toHaveLength(1);
    expect(db.notes[0].content).toContain("学习 VLLM");
    expect(db.notes[0].content).toContain("PagedAttention");
    expect(db.notes[0].createdAt).toBe("2026-08-20T19:21:32.661Z");
  });

  it("旧的 isFrog 迁移为「今天做」，contexts/durationMinutes 被丢弃", async () => {
    const db = await writeLegacy({
      tasks: [
        {
          id: "f1",
          title: "青蛙任务",
          notes: "",
          phase: "action",
          status: "todo",
          priority: 3,
          isFrog: true,
          contexts: ["ctx1"],
          durationMinutes: 90,
          tags: [],
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(db.tasks).toHaveLength(1);
    expect(db.tasks[0].plannedFor).toBe(isoDay(new Date()));
    expect(db.tasks[0]).not.toHaveProperty("isFrog");
    expect(db.tasks[0]).not.toHaveProperty("contexts");
    expect(db.tasks[0]).not.toHaveProperty("durationMinutes");
    expect(db.tasks[0].nudgedAt).toBeNull();
    expect(db.tasks[0].canceledReason).toBeNull();
  });

  it("旧的 autoClearFrogOnDone 迁移为 autoClearPlanOnDone", async () => {
    const db = await writeLegacy({
      tasks: [],
      settings: { automations: { autoClearFrogOnDone: false, autoFlagOverdueFrog: true } },
    });
    expect(db.settings.automations.autoClearPlanOnDone).toBe(false);
  });

  it("从未自定义过的旧「战友」人格升级为「损友」", async () => {
    const db = await writeLegacy({
      tasks: [],
      agentProfile: {
        name: "马力",
        personaId: "comrade",
        custom: { role: [], tone: [], style: [], boundaries: [] },
        updatedAt: "2026-08-20T18:44:06.398Z",
      },
    });
    expect(db.agentProfile.personaId).toBe("roaster");
    expect(db.agentProfile.name).toBe("马力");
  });

  it("用户改过自定义指令的人格原样保留，不被覆盖", async () => {
    const db = await writeLegacy({
      tasks: [],
      agentProfile: {
        name: "老马",
        personaId: "comrade",
        custom: { role: ["你是我的私人助理。"], tone: [], style: [], boundaries: [] },
        updatedAt: "2026-08-20T18:44:06.398Z",
      },
    });
    expect(db.agentProfile.personaId).toBe("comrade");
    expect(db.agentProfile.name).toBe("老马");
    expect(db.agentProfile.custom.role).toEqual(["你是我的私人助理。"]);
  });

  it("旧 db 没有 lastNudge / coachEnabled 时补默认值", async () => {
    const db = await writeLegacy({ tasks: [] });
    expect(db.lastNudge).toBeNull();
    expect(db.settings.coachEnabled).toBe(true);
  });

  it("doing 任务缺 startedAt 时用 updatedAt 兜底", async () => {
    const db = await writeLegacy({
      tasks: [
        {
          id: "d1",
          title: "在做的",
          notes: "",
          phase: "action",
          status: "doing",
          priority: 3,
          tags: [],
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-05T00:00:00.000Z",
        },
      ],
    });
    expect(db.tasks[0].startedAt).toBe("2025-01-05T00:00:00.000Z");
  });
});

describe("清空数据", () => {
  it("resetTaskData 清空任务与笔记，保留项目与设置", async () => {
    await store.createProject("保留我");
    await store.updateSettings({ maxToday: 4 });
    await store.createTask({ title: "x" });
    await store.createNote({ content: "n" });

    const counts = await store.resetTaskData();
    expect(counts).toEqual({ tasks: 1, notes: 1 });
    expect(await store.listTasks()).toHaveLength(0);
    expect(await store.listNotes()).toHaveLength(0);
    expect(await store.listProjects()).toHaveLength(1);
    expect((await store.getSettings()).maxToday).toBe(4);
  });
});

describe("教练：一天最多一次", () => {
  const nudge = {
    id: "staleDoing:t1:2025-01-08",
    kind: "staleDoing",
    text: "它到底是在做，还是只是没被你正式承认已经放弃？",
    day: "2025-01-08",
    taskId: "t1",
    dismissed: false,
    createdAt: "2025-01-08T09:00:00.000Z",
  };

  it("默认没有，写入后可读回", async () => {
    expect(await store.getLastNudge()).toBeNull();
    await store.setLastNudge(nudge);
    expect(await store.getLastNudge()).toMatchObject({ id: nudge.id, dismissed: false });
  });

  it("忽略后当天标记为 dismissed", async () => {
    await store.setLastNudge(nudge);
    const after = await store.dismissNudge(nudge.id);
    expect(after!.dismissed).toBe(true);
  });

  it("忽略别的 id 不影响当前这条", async () => {
    await store.setLastNudge(nudge);
    const after = await store.dismissNudge("别的 id");
    expect(after!.dismissed).toBe(false);
  });

  it("默认开启教练模式", async () => {
    expect((await store.getSettings()).coachEnabled).toBe(true);
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
    await store.updateTask(t.id, { plannedFor: "2025-01-08" });
    await store.updateTask(t.id, { plannedFor: null });
    const task = await store.getTask(t.id);
    expect(task!.history.map((h) => h.label)).toEqual([
      "优先级设为 P1",
      "承诺 2025-01-08 做",
      "移出了今天",
    ]);
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
