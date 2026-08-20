"use client";

import { usePomodoro } from "@/store/usePomodoro";
import { useStore } from "@/store/useStore";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function PomodoroDock() {
  const p = usePomodoro();
  const tasks = useStore((s) => s.tasks);
  const task = p.focusTaskId ? tasks.find((t) => t.id === p.focusTaskId) : null;
  const running = p.status === "running";

  function toggle() {
    if (running) {
      p.pause();
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    if (p.status === "paused") p.resume();
    else p.start();
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border bg-background/95 px-4 py-2 shadow-lg backdrop-blur">
      <span className="text-sm">{p.mode === "focus" ? "🍅" : "☕"}</span>
      <span className="font-mono text-sm tabular-nums">{fmt(p.secondsLeft)}</span>
      {task ? (
        <span className="max-w-[8rem] truncate text-xs text-muted-foreground">{task.title}</span>
      ) : null}
      <span className="text-[10px] text-muted-foreground">×{p.cycles}</span>
      <button onClick={toggle} className="rounded px-1.5 py-0.5 text-xs hover:bg-muted" title="开始/暂停">
        {running ? "⏸" : "▶"}
      </button>
      <button onClick={() => p.skip()} className="rounded px-1.5 py-0.5 text-xs hover:bg-muted" title="跳过">
        ⏭
      </button>
      <button onClick={() => p.reset()} className="rounded px-1.5 py-0.5 text-xs hover:bg-muted" title="重置">
        ✕
      </button>
    </div>
  );
}
