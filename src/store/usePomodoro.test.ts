import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePomodoro } from "./usePomodoro";

const FOCUS = 25 * 60;
const BREAK = 5 * 60;

beforeEach(() => {
  vi.useFakeTimers();
  usePomodoro.getState().reset();
});
afterEach(() => {
  vi.useRealTimers();
  usePomodoro.getState().reset();
});

describe("番茄计时器", () => {
  it("start 进入 focus 运行态，25:00", () => {
    usePomodoro.getState().start();
    expect(usePomodoro.getState().status).toBe("running");
    expect(usePomodoro.getState().mode).toBe("focus");
    expect(usePomodoro.getState().secondsLeft).toBe(FOCUS);
    expect(usePomodoro.getState().cycles).toBe(0);
  });

  it("每秒递减 1", () => {
    usePomodoro.getState().start();
    vi.advanceTimersByTime(1000);
    expect(usePomodoro.getState().secondsLeft).toBe(FOCUS - 1);
  });

  it("pause 停止计时且秒数不再变化", () => {
    usePomodoro.getState().start();
    vi.advanceTimersByTime(1000);
    usePomodoro.getState().pause();
    expect(usePomodoro.getState().status).toBe("paused");
    const s = usePomodoro.getState().secondsLeft;
    vi.advanceTimersByTime(5000);
    expect(usePomodoro.getState().secondsLeft).toBe(s);
  });

  it("resume 从暂停恢复运行", () => {
    usePomodoro.getState().start();
    vi.advanceTimersByTime(1000);
    usePomodoro.getState().pause();
    usePomodoro.getState().resume();
    expect(usePomodoro.getState().status).toBe("running");
  });

  it("专注结束自动进入休息，cycles+1", () => {
    usePomodoro.getState().start();
    vi.advanceTimersByTime(FOCUS * 1000);
    expect(usePomodoro.getState().mode).toBe("break");
    expect(usePomodoro.getState().cycles).toBe(1);
    expect(usePomodoro.getState().secondsLeft).toBe(BREAK);
  });

  it("skip 在 focus/break 间切换", () => {
    usePomodoro.getState().start();
    usePomodoro.getState().skip();
    expect(usePomodoro.getState().mode).toBe("break");
    expect(usePomodoro.getState().secondsLeft).toBe(BREAK);
    expect(usePomodoro.getState().cycles).toBe(1);
    usePomodoro.getState().skip();
    expect(usePomodoro.getState().mode).toBe("focus");
    expect(usePomodoro.getState().secondsLeft).toBe(FOCUS);
    expect(usePomodoro.getState().cycles).toBe(1);
  });

  it("reset 回到 idle 并清除 focusTaskId", () => {
    usePomodoro.getState().start("task-1");
    usePomodoro.getState().reset();
    expect(usePomodoro.getState().status).toBe("idle");
    expect(usePomodoro.getState().mode).toBe("focus");
    expect(usePomodoro.getState().secondsLeft).toBe(FOCUS);
    expect(usePomodoro.getState().focusTaskId).toBeNull();
  });
});
