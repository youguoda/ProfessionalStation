"use client";

import { useEffect } from "react";
import { Bot, X } from "lucide-react";
import { useStore } from "@/store/useStore";

/**
 * 教练层的出口：马力主动说的那一句话。
 *
 * 刻意做得很克制——一行、一天最多一次、随手可关。
 * 罕见才有杀伤力；如果它天天出现，第三天你就会开始无视它。
 */
export function CoachBar() {
  const nudge = useStore((s) => s.nudge);
  const loadNudge = useStore((s) => s.loadNudge);
  const dismissNudge = useStore((s) => s.dismissNudge);
  const setAgentOpen = useStore((s) => s.setAgentOpen);
  const openTask = useStore((s) => s.openTask);
  const loaded = useStore((s) => s.loaded);
  const coachEnabled = useStore((s) => s.settings.coachEnabled);
  const tasks = useStore((s) => s.tasks);

  useEffect(() => {
    if (loaded && coachEnabled) void loadNudge();
  }, [loaded, coachEnabled, loadNudge]);

  if (!nudge) return null;

  const target = nudge.taskId ? tasks.find((t) => t.id === nudge.taskId) : undefined;

  return (
    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-3">
      <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-sm leading-relaxed">{nudge.text}</p>
      <div className="flex shrink-0 items-center gap-1">
        {target ? (
          <button
            onClick={() => openTask(target.id)}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            看看那条
          </button>
        ) : null}
        <button
          onClick={() => setAgentOpen(true)}
          className="rounded-md px-2 py-1 text-xs text-primary hover:bg-primary/10"
        >
          回他一句
        </button>
        <button
          onClick={() => void dismissNudge()}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="今天别再说了"
          title="今天别再说了"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
