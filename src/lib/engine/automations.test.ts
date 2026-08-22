import { describe, expect, it } from "vitest";
import { createTask } from "@/lib/domain/factory";
import { defaultAutomationSettings, evaluateAutomations } from "./automations";

const now = new Date(2025, 0, 8); // 2025-01-08
const STALE = 7;

describe("自动化：完成后自动移出「今天」", () => {
  it("已完成且仍占着今天的额度 → 清除承诺日", () => {
    const t = createTask({ title: "x", phase: "action", status: "done", plannedFor: "2025-01-08" });
    const r = evaluateAutomations([t], defaultAutomationSettings(), STALE, now);
    expect(r.patches).toEqual([{ id: t.id, patch: { plannedFor: null } }]);
  });

  it("已取消同样清除（取消也是一种终局）", () => {
    const t = createTask({
      title: "x",
      phase: "action",
      status: "canceled",
      plannedFor: "2025-01-08",
    });
    const r = evaluateAutomations([t], defaultAutomationSettings(), STALE, now);
    expect(r.patches).toEqual([{ id: t.id, patch: { plannedFor: null } }]);
  });

  it("未完成 → 不动", () => {
    const t = createTask({ title: "x", phase: "action", status: "todo", plannedFor: "2025-01-08" });
    expect(evaluateAutomations([t], defaultAutomationSettings(), STALE, now).patches).toEqual([]);
  });

  it("已完成但本来就没承诺日 → 幂等无补丁", () => {
    const t = createTask({ title: "x", phase: "action", status: "done" });
    expect(evaluateAutomations([t], defaultAutomationSettings(), STALE, now).patches).toEqual([]);
  });

  it("规则关闭 → 无补丁", () => {
    const t = createTask({ title: "x", phase: "action", status: "done", plannedFor: "2025-01-08" });
    const r = evaluateAutomations(
      [t],
      { ...defaultAutomationSettings(), autoClearPlanOnDone: false },
      STALE,
      now,
    );
    expect(r.patches).toEqual([]);
  });
});

describe("自动化：等待停滞提醒", () => {
  function staleWaiting() {
    const t = createTask({ title: "等报价", phase: "waiting" });
    t.createdAt = "2024-12-01T00:00:00.000Z";
    return t;
  }

  it("等待超过阈值且规则开启 → 通知，但不改数据", () => {
    const settings = { ...defaultAutomationSettings(), staleWaitingReminder: true };
    const r = evaluateAutomations([staleWaiting()], settings, STALE, now);
    expect(r.patches).toEqual([]);
    expect(r.notifications).toHaveLength(1);
    expect(r.notifications[0]).toContain("等报价");
  });

  it("戳过一下之后重新计时 → 不再提醒", () => {
    const t = staleWaiting();
    t.nudgedAt = "2025-01-07T00:00:00.000Z";
    const settings = { ...defaultAutomationSettings(), staleWaitingReminder: true };
    expect(evaluateAutomations([t], settings, STALE, now).notifications).toEqual([]);
  });

  it("等待未超阈值 → 无通知", () => {
    const t = createTask({ title: "新等待", phase: "waiting" });
    t.createdAt = "2025-01-07T00:00:00.000Z";
    const settings = { ...defaultAutomationSettings(), staleWaitingReminder: true };
    expect(evaluateAutomations([t], settings, STALE, now).notifications).toEqual([]);
  });

  it("规则关闭 → 无通知", () => {
    expect(
      evaluateAutomations([staleWaiting()], defaultAutomationSettings(), STALE, now).notifications,
    ).toEqual([]);
  });
});
