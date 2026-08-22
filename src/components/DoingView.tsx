"use client";

import { useMemo } from "react";
import { Check, Square } from "lucide-react";
import { useStore } from "@/store/useStore";
import { blockedIdSet, daysSince, doingCapacity, selectDoing } from "@/lib/engine/selectors";
import { useTaskMeta } from "@/lib/client/useTaskMeta";
import { toastError, toastWithUndo, useToast } from "@/store/useToast";
import { usePomodoro } from "@/store/usePomodoro";
import { EmptyState, PageHeader } from "./TaskList";
import { TaskItem } from "./TaskItem";

/**
 * 进行中（WIP）。
 * 看板唯一值钱的东西是「限制在制品」这条约束——把约束提取出来做成一个永远可见的
 * 计数器，三列看板就没有存在必要了。
 */
export function DoingView({ onSelect }: { onSelect: (id: string) => void }) {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const transition = useStore((s) => s.transition);
  const setScope = useStore((s) => s.setScope);
  const meta = useTaskMeta();
  const blockedIds = useMemo(() => blockedIdSet(tasks), [tasks]);
  const markCompleted = useToast((s) => s.markCompleted);
  const pomodoroStart = usePomodoro((s) => s.start);
  const focusTaskId = usePomodoro((s) => s.focusTaskId);

  const list = selectDoing(tasks);
  const cap = doingCapacity(tasks, settings);

  async function complete(id: string, title: string) {
    try {
      await transition(id, { type: "complete" });
      markCompleted(id);
      toastWithUndo({
        title: `已完成「${title}」`,
        desc: `在制降到 ${Math.max(0, cap.used - 1)}/${cap.max}`,
        undo: () => {
          transition(id, { type: "reopen" }).catch((e) => toastError(e));
        },
      });
    } catch (e) {
      toastError(e);
    }
  }

  async function stop(id: string, title: string) {
    try {
      await transition(id, { type: "stop" });
      toastWithUndo({
        title: `已放回待办「${title}」`,
        undo: () => {
          transition(id, { type: "start" }).catch((e) => toastError(e));
        },
      });
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div>
      <PageHeader title="进行中" subtitle="球在我手上的事。库存无限，在制有限。">
        <div className="text-right">
          <div
            className={`text-sm font-semibold tabular-nums ${
              cap.over ? "text-destructive" : "text-foreground"
            }`}
          >
            {cap.used} / {cap.max}
          </div>
          <div className="text-[11px] text-muted-foreground">在制品</div>
        </div>
      </PageHeader>

      <div className="mb-5 flex gap-1.5">
        {Array.from({ length: Math.max(cap.max, cap.used) }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < cap.used ? (i >= cap.max ? "bg-destructive" : "bg-primary") : "bg-muted"
            }`}
          />
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          text="手上没有正在做的事"
          hint="去「今天」挑一条按开始。一次只推进两三件，比同时开十件快得多。"
          action={
            <button
              onClick={() => setScope("today")}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              去「今天」
            </button>
          }
        />
      ) : (
        <div className="space-y-2">
          {list.map((t) => {
            const days = daysSince(t.startedAt);
            const stale = days >= settings.staleDays;
            return (
              <div
                key={t.id}
                className={`rounded-xl border p-1 ${stale ? "border-warning/50 bg-warning/5" : ""}`}
              >
                <TaskItem
                  task={t}
                  meta={meta}
                  blocked={blockedIds.has(t.id)}
                  onSelect={onSelect}
                />
                <div className="flex items-center gap-2 px-3 pb-2 pt-1">
                  <button
                    onClick={() => complete(t.id, t.title)}
                    className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground"
                  >
                    <Check className="h-3 w-3" />
                    完成
                  </button>
                  <button
                    onClick={() => stop(t.id, t.title)}
                    className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
                  >
                    <Square className="h-3 w-3" />
                    放回待办
                  </button>
                  <button
                    onClick={() => pomodoroStart(t.id)}
                    className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
                  >
                    {focusTaskId === t.id ? "🍅 专注中" : "🍅 专注"}
                  </button>
                  {stale ? (
                    <span className="ml-auto text-[11px] text-warning">
                      开始 {days} 天了 — 周回顾会让你结算它
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cap.over ? (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          在制品超过上限了。这通常不是效率问题，是没有结掉旧的就开了新的。
        </p>
      ) : null}
    </div>
  );
}
