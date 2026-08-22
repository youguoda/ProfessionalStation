import { describe, expect, it } from "vitest";
import { createProject, createTask } from "@/lib/domain/factory";
import { deferCount, observe, topObservation, type NudgeKind } from "./observer";

const settings = { maxToday: 6, maxDoing: 3, staleDays: 7 };
const morning = new Date(2025, 0, 8, 9, 0); // 周三上午 9 点
const afternoon = new Date(2025, 0, 8, 15, 0);
const TODAY = "2025-01-08";

function run(tasks: ReturnType<typeof createTask>[], now = morning, projects = []) {
  return observe({ tasks, projects, settings, now });
}

function kinds(obs: ReturnType<typeof observe>): NudgeKind[] {
  return obs.map((o) => o.kind);
}

describe("大多数日子应该什么都不说", () => {
  it("系统健康时没有任何观察", () => {
    const tasks = [
      createTask({ title: "承诺", phase: "action", plannedFor: TODAY }),
      createTask({ title: "在做", phase: "action", status: "doing", plannedFor: TODAY }),
    ];
    tasks[1].startedAt = "2025-01-08T09:00:00.000Z";
    const done = createTask({ title: "刚做完", phase: "action", status: "done" });
    done.completedAt = "2025-01-07T10:00:00.000Z";
    expect(run([...tasks, done], afternoon)).toEqual([]);
  });

  it("空库不说话（没数据就没洞察）", () => {
    expect(run([])).toEqual([]);
    expect(topObservation({ tasks: [], projects: [], settings, now: morning })).toBeNull();
  });
});

describe("时间感知：同一份数据在不同时刻说的话不同", () => {
  const tasks = [createTask({ title: "承诺了", phase: "action", plannedFor: TODAY })];

  it("下午还没动手才会被点名", () => {
    expect(kinds(run(tasks, morning))).not.toContain("noStart");
    expect(kinds(run(tasks, afternoon))).toContain("noStart");
  });

  it("早上没承诺任何事才提醒，下午不提", () => {
    const stock = [createTask({ title: "库存", phase: "action" })];
    expect(kinds(run(stock, morning))).toContain("emptyToday");
    expect(kinds(run(stock, afternoon))).not.toContain("emptyToday");
  });

  it("今天已经完成过东西就不算「一件没动」", () => {
    const done = createTask({ title: "做完了", phase: "action", status: "done" });
    done.completedAt = "2025-01-08T10:00:00.000Z";
    expect(kinds(run([...tasks, done], afternoon))).not.toContain("noStart");
  });
});

describe("各类模式识别", () => {
  it("超额承诺", () => {
    const tasks = Array.from({ length: 9 }, (_, i) =>
      createTask({ title: `t${i}`, phase: "action", plannedFor: TODAY }),
    );
    const o = run(tasks, afternoon).find((x) => x.kind === "overcommit")!;
    expect(o).toBeDefined();
    expect(o.evidence).toContain("9");
    expect(o.fallback).toContain("9");
  });

  it("在制品超上限", () => {
    const tasks = Array.from({ length: 4 }, (_, i) => {
      const t = createTask({ title: `d${i}`, phase: "action", status: "doing" });
      t.startedAt = "2025-01-08T09:00:00.000Z";
      return t;
    });
    expect(kinds(run(tasks, afternoon))).toContain("wipOver");
  });

  it("某件事开工很久没结束，且带上任务 id", () => {
    const t = createTask({ title: "重构日志模块", phase: "action", status: "doing" });
    t.startedAt = "2024-12-20T00:00:00.000Z";
    const o = run([t], afternoon).find((x) => x.kind === "staleDoing")!;
    expect(o.taskId).toBe(t.id);
    expect(o.evidence).toContain("重构日志模块");
  });

  it("等待挂太久；戳过之后重新计时就不再提", () => {
    const t = createTask({ title: "等报价", phase: "waiting" });
    t.createdAt = "2024-12-01T00:00:00.000Z";
    expect(kinds(run([t], afternoon))).toContain("staleWaiting");

    t.nudgedAt = "2025-01-07T00:00:00.000Z";
    expect(kinds(run([t], afternoon))).not.toContain("staleWaiting");
  });

  it("反复推迟：承诺过 3 次以上还没做完", () => {
    const t = createTask({ title: "写年度总结", phase: "action" });
    t.history = [
      { at: "2025-01-03T00:00:00.000Z", label: "承诺 2025-01-03 做" },
      { at: "2025-01-04T00:00:00.000Z", label: "移出了今天" },
      { at: "2025-01-05T00:00:00.000Z", label: "承诺 2025-01-05 做" },
      { at: "2025-01-06T00:00:00.000Z", label: "承诺 2025-01-06 做" },
    ];
    expect(deferCount(t)).toBe(3);
    const o = run([t], afternoon).find((x) => x.kind === "repeatedlyDeferred")!;
    expect(o.evidence).toContain("3 次");
    expect(o.taskId).toBe(t.id);
  });

  it("已完成的任务不再算反复推迟", () => {
    const t = createTask({ title: "写年度总结", phase: "action", status: "done" });
    t.history = Array.from({ length: 4 }, (_, i) => ({
      at: "2025-01-0" + (i + 1) + "T00:00:00.000Z",
      label: "承诺 2025-01-0" + (i + 1) + " 做",
    }));
    expect(kinds(run([t], afternoon))).not.toContain("repeatedlyDeferred");
  });

  it("项目截止在即但没有下一步行动", () => {
    const p = createProject({ name: "5.0.0 发布", deadline: "2025-01-10" });
    const obs = observe({
      tasks: [createTask({ title: "别的事", phase: "action" })],
      projects: [p],
      settings,
      now: afternoon,
    });
    const o = obs.find((x) => x.kind === "deadlineNoAction")!;
    expect(o).toBeDefined();
    expect(o.evidence).toContain("5.0.0 发布");
  });

  it("项目已有下一步行动就不报", () => {
    const p = createProject({ name: "5.0.0 发布", deadline: "2025-01-10" });
    const obs = observe({
      tasks: [createTask({ title: "写代码", phase: "action", projectId: p.id })],
      projects: [p],
      settings,
      now: afternoon,
    });
    expect(kinds(obs)).not.toContain("deadlineNoAction");
  });

  it("一周颗粒无收", () => {
    const tasks = Array.from({ length: 3 }, (_, i) =>
      createTask({ title: `t${i}`, phase: "action" }),
    );
    expect(kinds(run(tasks, afternoon))).toContain("zeroCompletion");
  });

  it("收件箱堆积", () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      createTask({ title: `i${i}`, phase: "inbox" }),
    );
    expect(kinds(run(tasks, afternoon))).toContain("inboxPileup");
  });
});

describe("只说最狠的那一条", () => {
  it("多个模式同时成立时按严重度排序，取第一条", () => {
    const stuck = createTask({ title: "拖着的", phase: "action", status: "doing" });
    stuck.startedAt = "2024-12-01T00:00:00.000Z";
    const inbox = Array.from({ length: 12 }, (_, i) =>
      createTask({ title: `i${i}`, phase: "inbox" }),
    );
    const obs = run([stuck, ...inbox], afternoon);
    expect(obs.length).toBeGreaterThan(1);
    // 停滞在制（85）比收件箱堆积（45）更该说
    expect(obs[0].kind).toBe("staleDoing");
    const top = topObservation({
      tasks: [stuck, ...inbox],
      projects: [],
      settings,
      now: afternoon,
    });
    expect(top!.kind).toBe("staleDoing");
  });

  it("每条观察都有稳定 id、客观事实与兜底文案", () => {
    const t = createTask({ title: "等报价", phase: "waiting" });
    t.createdAt = "2024-12-01T00:00:00.000Z";
    const a = run([t], afternoon);
    const b = run([t], afternoon);
    expect(a[0].id).toBe(b[0].id);
    expect(a[0].id).toContain(TODAY);
    expect(a[0].evidence.length).toBeGreaterThan(0);
    expect(a[0].fallback.length).toBeGreaterThan(0);
  });
});
