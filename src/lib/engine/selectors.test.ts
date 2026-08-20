import { describe, expect, it } from "vitest";
import { createTask } from "@/lib/domain/factory";
import { isBlocked } from "./selectors";

describe("isBlocked 依赖判断", () => {
  it("无依赖不阻塞", () => {
    const t = createTask({ title: "a", phase: "action" });
    expect(isBlocked(t, [t])).toBe(false);
  });

  it("依赖未完成则阻塞", () => {
    const dep = createTask({ title: "dep", phase: "action", status: "todo" });
    const t = createTask({ title: "a", phase: "action", blockedBy: [dep.id] });
    expect(isBlocked(t, [dep, t])).toBe(true);
  });

  it("依赖完成则不阻塞", () => {
    const dep = createTask({ title: "dep", phase: "action", status: "done" });
    const t = createTask({ title: "a", phase: "action", blockedBy: [dep.id] });
    expect(isBlocked(t, [dep, t])).toBe(false);
  });

  it("依赖缺失视为不阻塞（容错）", () => {
    const t = createTask({ title: "a", phase: "action", blockedBy: ["missing-id"] });
    expect(isBlocked(t, [t])).toBe(false);
  });

  it("依赖在回收站视为不阻塞", () => {
    const dep = createTask({ title: "dep", phase: "trash", status: "todo" });
    const t = createTask({ title: "a", phase: "action", blockedBy: [dep.id] });
    expect(isBlocked(t, [dep, t])).toBe(false);
  });
});
