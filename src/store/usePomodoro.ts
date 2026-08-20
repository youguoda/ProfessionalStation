"use client";

import { create } from "zustand";

const FOCUS_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

type Status = "idle" | "running" | "paused";
type Mode = "focus" | "break";

interface PomodoroState {
  status: Status;
  mode: Mode;
  secondsLeft: number;
  cycles: number;
  focusTaskId: string | null;
  start: (focusTaskId?: string | null) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  skip: () => void;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function notify(title: string) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(title);
    } catch {
      /* ignore */
    }
  }
}

export const usePomodoro = create<PomodoroState>((set, get) => {
  function runInterval() {
    intervalId = setInterval(() => {
      const { secondsLeft, mode, cycles } = get();
      if (secondsLeft <= 1) {
        const nextMode: Mode = mode === "focus" ? "break" : "focus";
        const nextSeconds = nextMode === "focus" ? FOCUS_SECONDS : BREAK_SECONDS;
        const nextCycles = mode === "focus" ? cycles + 1 : cycles;
        notify(nextMode === "focus" ? "🍅 休息结束，开始专注" : "🍅 专注结束，休息一下");
        set({ mode: nextMode, secondsLeft: nextSeconds, cycles: nextCycles });
      } else {
        set({ secondsLeft: secondsLeft - 1 });
      }
    }, 1000);
  }

  return {
    status: "idle",
    mode: "focus",
    secondsLeft: FOCUS_SECONDS,
    cycles: 0,
    focusTaskId: null,

    start: (focusTaskId = null) => {
      stop();
      set({ status: "running", mode: "focus", secondsLeft: FOCUS_SECONDS, focusTaskId });
      runInterval();
    },
    pause: () => {
      stop();
      set({ status: "paused" });
    },
    resume: () => {
      if (get().status !== "paused") return;
      set({ status: "running" });
      runInterval();
    },
    reset: () => {
      stop();
      set({ status: "idle", mode: "focus", secondsLeft: FOCUS_SECONDS, focusTaskId: null });
    },
    skip: () => {
      const { mode, cycles } = get();
      const nextMode: Mode = mode === "focus" ? "break" : "focus";
      set({
        mode: nextMode,
        secondsLeft: nextMode === "focus" ? FOCUS_SECONDS : BREAK_SECONDS,
        cycles: mode === "focus" ? cycles + 1 : cycles,
      });
    },
  };
});
