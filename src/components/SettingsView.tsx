"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useStore } from "@/store/useStore";
import { THEME_LABELS } from "@/lib/client/theme";
import { toast, toastError } from "@/store/useToast";
import type { ThemeMode } from "@/lib/domain/types";

const THEMES: ThemeMode[] = ["light", "dark", "system"];

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border bg-card p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      </div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))));
        }}
        className="w-16 shrink-0 rounded-md border bg-background px-2 py-1.5 text-center text-sm tabular-nums"
      />
    </label>
  );
}

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const setTheme = useStore((s) => s.setTheme);
  const updateSettings = useStore((s) => s.updateSettings);
  const resetData = useStore((s) => s.resetData);
  const aiStatus = useStore((s) => s.aiStatus);
  const [confirmReset, setConfirmReset] = useState(false);

  const patch = (p: Record<string, unknown>) => updateSettings(p).catch((e) => toastError(e));

  return (
    <div>
      <h1 className="mb-5 text-xl font-semibold tracking-tight">设置</h1>

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold">约束</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          方法论的价值不在视图，在约束。这三个数字就是整套系统的全部规则。
        </p>
        <div className="space-y-2">
          <NumberField
            label="今天最多几条"
            hint="Ivy Lee Method：每天只写 6 件事。超了不拦你，但会明确告诉你超了。"
            value={settings.maxToday}
            min={1}
            max={20}
            onChange={(v) => patch({ maxToday: v })}
          />
          <NumberField
            label="同时最多做几件"
            hint="看板的 WIP 上限。开第 N+1 件时会被拦下——先结掉一件，或放回待办。"
            value={settings.maxDoing}
            min={1}
            max={10}
            onChange={(v) => patch({ maxDoing: v })}
          />
          <NumberField
            label="停滞判定天数"
            hint="进行中或等待超过这么多天，会出现在周回顾的结算台里。"
            value={settings.staleDays}
            min={1}
            max={90}
            onChange={(v) => patch({ staleDays: v })}
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold">教练模式</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          开启后，马力会在发现模式时**主动说一句话**——你连着五天推同一件事、等待挂了三周、
          今天排了一堆一件没动。一天最多一次，随手可关。罕见才有杀伤力。
        </p>
        <div className="flex items-start justify-between gap-4 rounded-xl border bg-card p-3">
          <div>
            <div className="text-sm font-medium">让马力主动开口</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {aiStatus?.enabled
                ? "由 AI 按人格现写；调用失败时用内置文案兜底。"
                : "未配置 AI，将使用内置文案（依然是他那张嘴）。"}
            </div>
          </div>
          <button
            onClick={() => patch({ coachEnabled: !settings.coachEnabled })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              settings.coachEnabled ? "bg-primary" : "bg-muted"
            }`}
            role="switch"
            aria-checked={settings.coachEnabled}
            aria-label="教练模式"
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform ${
                settings.coachEnabled ? "translate-x-[1.375rem]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">外观</h2>
        <div className="flex items-center gap-2">
          {THEMES.map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                settings.theme === t ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
              }`}
            >
              {THEME_LABELS[t]}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">AI 助手</h2>
        <p className="text-xs text-muted-foreground">
          {aiStatus?.enabled
            ? `已启用 · 模型 ${aiStatus.model}（在 .env 中配置 AI_API_KEY / AI_BASE_URL / AI_MODEL 后重启服务）`
            : "未配置。在项目根目录 .env 中设置 AI_API_KEY 后重启服务即可启用马力与 AI 拆分。"}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">提醒</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          开启后，打开应用时会收到「今天到期 / 已逾期」任务的浏览器通知（同任务每次会话一次）。
        </p>
        <button
          onClick={async () => {
            if (typeof Notification === "undefined") {
              toast({ title: "当前浏览器不支持通知", tone: "error" });
              return;
            }
            const p = await Notification.requestPermission();
            toast({
              title: p === "granted" ? "已开启到期提醒" : "未授权通知",
              tone: p === "granted" ? "success" : "info",
            });
          }}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          启用到期提醒
        </button>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">数据导出（个人数据不被锁定）</h2>
        <div className="flex items-center gap-2">
          {(["json", "csv", "md"] as const).map((f) => (
            <a
              key={f}
              href={`/api/export?format=${f}`}
              download
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" />
              {f.toUpperCase()}
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-destructive">清空任务与笔记</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          删除全部任务和笔记，保留项目、领域、设置与马力的人格记忆。
          用于从测试数据切换到真实使用——满屏假数据会让你不认真对待这个系统。
          建议先用上面的 JSON 导出备份。
        </p>
        {confirmReset ? (
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  await resetData();
                  toast({ title: "已清空任务与笔记", tone: "success" });
                } catch (e) {
                  toastError(e);
                } finally {
                  setConfirmReset(false);
                }
              }}
              className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground"
            >
              确认清空，不可撤销
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
          >
            清空数据…
          </button>
        )}
      </section>
    </div>
  );
}
