import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast, toastWithUndo, triggerUndo, useToast } from "./useToast";

beforeEach(() => {
  useToast.setState({ toasts: [], undo: null, completedFx: {} });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast 与撤销注册表", () => {
  it("show 添加 toast，dismiss 移除", () => {
    toast({ title: "你好" });
    expect(useToast.getState().toasts).toHaveLength(1);
    const id = useToast.getState().toasts[0].id;
    useToast.getState().dismiss(id);
    expect(useToast.getState().toasts).toHaveLength(0);
  });

  it("toast 5 秒自动消失", () => {
    toast({ title: "你好" });
    vi.advanceTimersByTime(5000);
    expect(useToast.getState().toasts).toHaveLength(0);
  });

  it("toastWithUndo 注册撤销并可通过 triggerUndo 触发", () => {
    let undone = false;
    toastWithUndo({ title: "已删除", undo: () => { undone = true; } });
    expect(useToast.getState().undo).not.toBeNull();
    expect(triggerUndo()).toBe(true);
    expect(undone).toBe(true);
    expect(useToast.getState().undo).toBeNull();
    // 第二次触发返回 false
    expect(triggerUndo()).toBe(false);
  });

  it("completedFx 1.6 秒后过期", () => {
    useToast.getState().markCompleted("t1");
    expect(useToast.getState().completedFx["t1"]).toBeDefined();
    vi.advanceTimersByTime(1600);
    expect(useToast.getState().completedFx["t1"]).toBeUndefined();
  });
});
