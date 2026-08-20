"use client";

import { Download } from "lucide-react";
import { useStore } from "@/store/useStore";
import { THEME_LABELS } from "@/lib/client/theme";
import type { ThemeMode } from "@/lib/domain/types";

const THEMES: ThemeMode[] = ["light", "dark", "system"];

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const setTheme = useStore((s) => s.setTheme);
  const aiStatus = useStore((s) => s.aiStatus);

  return (
    <div>
      <h1 className="mb-5 text-xl font-semibold tracking-tight">设置</h1>

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
            : "未配置。在项目根目录 .env 中设置 AI_API_KEY 后重启服务即可启用马力与 AI 拆分/排期。"}
        </p>
      </section>

      <section>
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
    </div>
  );
}
