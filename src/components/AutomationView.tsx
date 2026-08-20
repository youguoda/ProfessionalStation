"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { toastError } from "@/store/useToast";

const RULES = [
  {
    key: "autoFlagOverdueFrog",
    icon: "🐸",
    title: "超期任务自动标记为青蛙",
    desc: "截止日期已过的行动任务会被自动标记为「青蛙」，进入今日聚焦。",
  },
  {
    key: "autoClearFrogOnDone",
    icon: "✓",
    title: "完成任务自动清除青蛙标记",
    desc: "任务完成或取消后自动移除青蛙标记，保持今日清单干净。",
  },
  {
    key: "staleWaitingReminder",
    icon: "⏳",
    title: "等待超过 7 天提醒",
    desc: "等待项超过 7 天未解决时生成跟进提醒。",
  },
] as const;

type RuleKey = (typeof RULES)[number]["key"];

export function AutomationView() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const runAutomations = useStore((s) => s.runAutomations);
  const automationLog = useStore((s) => s.automationLog);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<{ applied: number; notifications: string[] } | null>(null);

  const automations = settings.automations;

  async function toggleRule(key: RuleKey, value: boolean) {
    await updateSettings({ automations: { ...automations, [key]: value } }).catch((e) =>
      toastError(e),
    );
  }

  async function run() {
    setRunning(true);
    try {
      const r = await runAutomations();
      setLast(r);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">自动化</h1>
      <p className="mb-5 text-xs text-muted-foreground">
        内置规则引擎（触发器 → 动作）：开启的规则会在每次加载时自动运行，也可以手动触发。
      </p>

      <div className="space-y-2">
        {RULES.map((rule) => {
          const on = automations[rule.key];
          return (
            <div key={rule.key} className="flex items-start justify-between gap-4 rounded-xl border bg-background p-3">
              <div className="flex items-start gap-2">
                <span className="text-lg">{rule.icon}</span>
                <div>
                  <div className="text-sm font-medium">{rule.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{rule.desc}</div>
                </div>
              </div>
              <button
                onClick={() => toggleRule(rule.key, !on)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  on ? "bg-primary" : "bg-muted"
                }`}
                aria-pressed={on}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    on ? "translate-x-[1.375rem]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={run}
          disabled={running}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {running ? "运行中…" : "⚡ 立即运行"}
        </button>
        {last ? (
          <span className="text-xs text-muted-foreground">
            本次应用 {last.applied} 处修改、{last.notifications.length} 条通知
          </span>
        ) : null}
      </div>

      {automationLog.length > 0 ? (
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            运行记录（本次会话）
          </h2>
          <div className="space-y-1">
            {automationLog.map((entry, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-1.5 text-xs">
                <span className="shrink-0 font-mono text-muted-foreground">{entry.time}</span>
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
