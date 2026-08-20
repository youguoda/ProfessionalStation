"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { isoDay } from "@/lib/engine/selectors";
import { InlineAdd } from "./InlineAdd";

function lastDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return d;
  });
}

export function HabitsView() {
  const habits = useStore((s) => s.habits);
  const habitChecks = useStore((s) => s.habitChecks);
  const createHabit = useStore((s) => s.createHabit);
  const deleteHabit = useStore((s) => s.deleteHabit);
  const toggleHabitCheck = useStore((s) => s.toggleHabitCheck);
  const [busy, setBusy] = useState(false);

  const days = lastDays(7);
  const dayKeys = days.map((d) => isoDay(d));
  const todayKey = isoDay(new Date());

  function checked(habitId: string, date: string) {
    return habitChecks.some((c) => c.habitId === habitId && c.date === date);
  }

  async function toggle(habitId: string, date: string) {
    if (busy) return;
    setBusy(true);
    try {
      await toggleHabitCheck(habitId, date);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">习惯</h1>
      <p className="mb-5 text-xs text-muted-foreground">
        系统胜过目标（Atomic Habits）——每天 1%，长期复利。
      </p>

      {habits.length === 0 ? (
        <div className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
          还没有习惯，添加一个吧（如：阅读 30 分钟 / 运动 / 早睡）
        </div>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_repeat(7,2rem)_3rem] items-center gap-1 px-2 text-center text-[10px] text-muted-foreground">
            <span className="text-left">习惯</span>
            {days.map((d) => (
              <span
                key={isoDay(d)}
                className={isoDay(d) === todayKey ? "font-semibold text-primary" : ""}
              >
                {d.toLocaleDateString("zh-CN", { weekday: "short" }).replace("周", "")}
              </span>
            ))}
            <span>本周</span>
          </div>

          {habits.map((h) => {
            const weekCount = dayKeys.filter((d) => checked(h.id, d)).length;
            return (
              <div
                key={h.id}
                className="group grid grid-cols-[1fr_repeat(7,2rem)_3rem] items-center gap-1 rounded-lg border bg-background px-2 py-2"
              >
                <span className="flex min-w-0 items-center gap-1 text-sm">
                  <span>{h.icon}</span>
                  <span className="truncate">{h.name}</span>
                  <button
                    onClick={() => deleteHabit(h.id)}
                    className="ml-1 hidden text-xs text-muted-foreground hover:text-red-500 group-hover:inline"
                  >
                    ✕
                  </button>
                </span>
                {dayKeys.map((d) => (
                  <button
                    key={d}
                    onClick={() => toggle(h.id, d)}
                    className={`mx-auto h-5 w-5 rounded-full border ${
                      checked(h.id, d)
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/40 hover:border-primary"
                    }`}
                    aria-label={d}
                  >
                    {checked(h.id, d) ? (
                      <span className="text-[10px] leading-none text-primary-foreground">✓</span>
                    ) : null}
                  </button>
                ))}
                <span className="text-center text-xs text-muted-foreground">{weekCount}/7</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        <InlineAdd
          label="习惯"
          placeholder="习惯名（如 阅读 30 分钟）"
          onSubmit={(v) => void createHabit(v)}
        />
      </div>
    </div>
  );
}
