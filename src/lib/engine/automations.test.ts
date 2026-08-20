import { describe, expect, it } from "vitest";
import { createTask } from "@/lib/domain/factory";
import { defaultAutomationSettings, evaluateAutomations } from "./automations";

const now = new Date(2025, 0, 8); // 2025-01-08

describe("自动化：超期自动标记青蛙", () => {
  it("超期且未标记 → 补丁 + 通知", () => {
    const t = createTask({ title: "报告", phase: "action", dueDate: "2025-01-07" });
    const r = evaluateAutomations([t], defaultAutomationSettings(), now);
    expect(r.patches).toEqual([{ id: t.id, patch: { isFrog: true } }]);
    expect(r.notifications).toHaveLength(1);
  });

  it("已标记青蛙 → 幂等无补丁", () => {
    const t = createTask({ title: "报告", phase: "action", dueDate: "2025-01-07", isFrog: true });
    const r = evaluateAutomations([t], defaultAutomationSettings(), now);
    expect(r.patches).toEqual([]);
    expect(r.notifications).toEqual([]);
  });

  it("未超期 → 无补丁", () => {
    const t = createTask({ title: "报告", phase: "action", dueDate: "2025-01-20" });
    expect(evaluateAutomations([t], defaultAutomationSettings(), now).patches).toEqual([]);
  });

  it("规则关闭 → 无补丁", () => {
    const t = createTask({ title: "报告", phase: "action", dueDate: "2025-01-07" });
    const r = evaluateAutomations(
      [t],
      { ...defaultAutomationSettings(), autoFlagOverdueFrog: false },
      now,
    );
    expect(r.patches).toEqual([]);
  });
});

describe("自动化：完成自动清除青蛙", () => {
  it("已完成且带青蛙 → 清除补丁", () => {
    const t = createTask({ title: "x", phase: "action", status: "done", isFrog: true });
    const r = evaluateAutomations([t], defaultAutomationSettings(), now);
    expect(r.patches).toEqual([{ id: t.id, patch: { isFrog: false } }]);
  });

  it("未完成 → 不清除", () => {
    const t = createTask({ title: "x", phase: "action", status: "todo", isFrog: true });
    expect(evaluateAutomations([t], defaultAutomationSettings(), now).patches).toEqual([]);
  });
});

describe("自动化：等待超时提醒", () => {
  function staleWaiting() {
    const t = createTask({ title: "等报价", phase: "waiting" });
    t.createdAt = "2024-12-01T00:00:00.000Z";
    return t;
  }

  it("等待超 7 天且规则开启 → 通知", () => {
    const settings = { ...defaultAutomationSettings(), staleWaitingReminder: true };
    const r = evaluateAutomations([staleWaiting()], settings, now);
    expect(r.patches).toEqual([]);
    expect(r.notifications).toHaveLength(1);
    expect(r.notifications[0]).toContain("等报价");
  });

  it("等待未超 7 天 → 无通知", () => {
    const t = createTask({ title: "新等待", phase: "waiting" });
    t.createdAt = "2025-01-07T00:00:00.000Z";
    const settings = { ...defaultAutomationSettings(), staleWaitingReminder: true };
    expect(evaluateAutomations([t], settings, now).notifications).toEqual([]);
  });

  it("规则关闭 → 无通知", () => {
    expect(evaluateAutomations([staleWaiting()], defaultAutomationSettings(), now).notifications).toEqual([]);
  });
});
