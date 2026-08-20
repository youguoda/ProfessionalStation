"use client";

import { CalendarClock, LayoutGrid, List, SquareKanban, type LucideIcon } from "lucide-react";
import { useStore } from "@/store/useStore";
import type { DisplayMode } from "@/lib/domain/types";

const MODES: Array<{ id: DisplayMode; icon: LucideIcon; label: string }> = [
  { id: "list", icon: List, label: "列表" },
  { id: "kanban", icon: SquareKanban, label: "看板" },
  { id: "matrix", icon: LayoutGrid, label: "四象限" },
  { id: "timeblock", icon: CalendarClock, label: "时间块" },
];

/** 视图切换器：作用于「当前所选范围」，不再是导航入口 */
export function ModeSwitcher() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  return (
    <div className="mb-4 inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
      {MODES.map((m) => {
        const Icon = m.icon;
        return (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
              mode === m.id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            title={m.label}
          >
            <Icon className="h-3.5 w-3.5" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
