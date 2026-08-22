"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Zap } from "lucide-react";
import { useStore } from "@/store/useStore";
import { toastError } from "@/store/useToast";
import type { LucideIcon } from "lucide-react";

const RULES: Array<{
  key: "autoClearPlanOnDone" | "staleWaitingReminder";
  icon: LucideIcon;
  title: string;
  desc: string;
}> = [
  {
    key: "autoClearPlanOnDone",
    icon: CheckCircle2,
    title: "完成后自动移出「今天」",
    desc: "任务完成或取消后清除承诺日，让今日清单只剩没做完的事。",
  },
  {
    key: "staleWaitingReminder",
    icon: Clock,
    title: "等待停滞提醒",
    desc: "等待项超过「停滞判定天数」还没被戳过时，生成一条跟进提醒。",
  },
];

export function AutomationView() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const runAutomations = useStore((s) => s.runAutomations);
  const automationLog = useStore((s) => s.automationLog);
  const setScope = useStore((s) => s.setScope);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<{ applied: number; notifications: string[] } | null>(null);

  const automations = settings.automations;

  async function toggleRule(key: (typeof RULES)[number]["key"], value: boolean) {
    await updateSettings({ automations: { ...automations, [key]: value } }).catch((e) =>
      toastError(e),
    );
  }

  async function run() {
    setRunning(true);
    try {
      setLast(await runAutomations());
    } catch (e) {
      toastError(e);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">自动化</h1>
      <p className="mb-5 text-xs text-muted-foreground">
        自动化只做<strong className="font-medium text-foreground">机械清理</strong>，不替你做决定。
        「该不该继续做」这类判断留给
        <button onClick={() => setScope("review")} className="mx-1 text-primary hover:underline">
          周回顾的结算台
        </button>
        。
      </p>

      <div className="space-y-2">
        {RULES.map((rule) => {
          const on = automations[rule.key];
          const Icon = rule.icon;
          return (
            <div
              key={rule.key}
              className="flex items-start justify-between gap-4 rounded-xl border bg-card p-3"
            >
              <div className="flex items-start gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
                role="switch"
                aria-checked={on}
                aria-label={rule.title}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform ${
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
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          <Zap className="h-3.5 w-3.5" />
          {running ? "运行中…" : "立即运行"}
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
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-1.5 text-xs"
              >
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  {entry.time}
                </span>
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
