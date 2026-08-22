"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { useStore } from "@/store/useStore";
import {
  isoDay,
  needsWeeklyReview,
  selectNextActions,
  selectOverdue,
  selectToday,
  todayCapacity,
} from "@/lib/engine/selectors";
import { formatRelativeDate } from "@/lib/parsing/dateFormat";
import { toastError } from "@/store/useToast";
import { EmptyState, PageHeader, TaskList } from "./TaskList";

/**
 * 今天 = 我的承诺，不是系统算出来的查询结果。
 * 容量条实现 Ivy Lee Method：每天只准写 N 件事，超了不拦，但必须让你看见。
 */
export function TodayView({ onSelect }: { onSelect: (id: string) => void }) {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const weeklyReviews = useStore((s) => s.weeklyReviews);
  const planTask = useStore((s) => s.planTask);
  const setScope = useStore((s) => s.setScope);
  const [picking, setPicking] = useState(false);

  const today = isoDay(new Date());
  const list = selectToday(tasks);
  const cap = todayCapacity(tasks, settings);
  const overdueCount = selectOverdue(tasks).length;

  const candidates = useMemo(
    () => selectNextActions(tasks).filter((t) => t.plannedFor !== today),
    [tasks, today],
  );

  const dateLabel = new Date().toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const pct = Math.min(100, Math.round((cap.used / Math.max(1, cap.max)) * 100));

  return (
    <div>
      <PageHeader title="今天" subtitle={dateLabel}>
        <div className="text-right">
          <div
            className={`text-sm font-semibold tabular-nums ${
              cap.over ? "text-warning" : "text-foreground"
            }`}
          >
            {cap.used} / {cap.max}
          </div>
          <div className="text-[11px] text-muted-foreground">今日承诺</div>
        </div>
      </PageHeader>

      {/* 容量条：个人效率系统失败的头号死因是系统性高估自己 */}
      <div className="mb-4">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${
              cap.over ? "bg-warning" : "bg-primary"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {cap.over ? (
          <p className="mt-2 text-xs text-warning">
            今天排了 {cap.used} 条，超过了你给自己定的 {cap.max} 条上限。要移走点什么吗？
          </p>
        ) : null}
      </div>

      {overdueCount > 0 ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {overdueCount} 条已逾期，已置顶。逾期是历史欠账，不占今天的额度。
        </div>
      ) : null}

      {needsWeeklyReview(weeklyReviews) ? (
        <button
          onClick={() => setScope("review")}
          className="mb-4 flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/10"
        >
          本周还没结算 → 去周回顾，把悬着的事了结
        </button>
      ) : null}

      {list.length === 0 ? (
        <EmptyState
          text="今天还没有承诺任何事"
          hint="「今天」不会自动帮你填——只有你亲手放进来的才算数。自己选的会做，系统塞的会视而不见。"
          action={
            <button
              onClick={() => setPicking(true)}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              从「下一步」挑几条
            </button>
          }
        />
      ) : (
        <TaskList tasks={list} onSelect={onSelect} emptyText="" showPlan />
      )}

      {list.length > 0 ? (
        <button
          onClick={() => setPicking(true)}
          disabled={cap.remaining === 0}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {cap.remaining > 0 ? `从「下一步」添加（还能加 ${cap.remaining} 条）` : "今天已经满了"}
        </button>
      ) : null}

      {picking ? (
        <PickerDialog
          candidates={candidates}
          remaining={cap.remaining}
          onClose={() => setPicking(false)}
          onPick={(id) => planTask(id, today).catch((e) => toastError(e))}
        />
      ) : null}
    </div>
  );
}

function PickerDialog({
  candidates,
  remaining,
  onClose,
  onPick,
}: {
  candidates: ReturnType<typeof selectNextActions>;
  remaining: number;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = candidates.filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase()));
  const projects = useStore((s) => s.projects);

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute left-1/2 top-[12%] w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border bg-popover shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm font-medium">挑进今天</div>
            <div className="text-[11px] text-muted-foreground">
              {remaining > 0 ? `还能加 ${remaining} 条` : "已超过上限，加进来会超额"}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b px-4 py-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            placeholder="搜索下一步行动…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              「下一步」里没有可挑的任务了
            </p>
          ) : (
            filtered.map((t) => {
              const project = t.projectId
                ? projects.find((p) => p.id === t.projectId)
                : undefined;
              return (
                <button
                  key={t.id}
                  onClick={() => onPick(t.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                    {project ? <span className="text-primary">#{project.name}</span> : null}
                    {t.dueDate ? <span>{formatRelativeDate(t.dueDate)}</span> : null}
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
