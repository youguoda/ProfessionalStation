"use client";

import {
  ArrowRight,
  CalendarDays,
  Check,
  Hand,
  Lock,
  Play,
  Repeat,
  Square,
  Sun,
  Trash2,
} from "lucide-react";
import type { Task } from "@/lib/domain/types";
import { PRIORITY_BAR, PRIORITY_SHORT } from "@/lib/domain/constants";
import { formatRelativeDate } from "@/lib/parsing/dateFormat";
import { daysSince, isoDay, waitingSince } from "@/lib/engine/selectors";
import { useStore } from "@/store/useStore";
import { toastError, toastWithUndo, useToast } from "@/store/useToast";
import type { TaskMeta } from "@/lib/client/useTaskMeta";

function dueMeta(task: Task): { text: string; danger: boolean } | null {
  if (!task.dueDate) return null;
  const today = isoDay(new Date());
  const danger = task.dueDate < today && task.status !== "done" && task.status !== "canceled";
  return { text: formatRelativeDate(task.dueDate), danger };
}

/** 进行中/等待的时长标签——停滞是比逾期更强的腐烂信号 */
function ageBadge(task: Task, staleDays: number): { text: string; stale: boolean } | null {
  if (task.status === "doing") {
    const d = daysSince(task.startedAt);
    return { text: d === 0 ? "今天开始" : `进行 ${d} 天`, stale: d >= staleDays };
  }
  if (task.phase === "waiting" && task.status !== "done" && task.status !== "canceled") {
    const d = daysSince(waitingSince(task));
    return { text: d === 0 ? "今天开始等" : `已等 ${d} 天`, stale: d >= staleDays };
  }
  return null;
}

export function TaskItem({
  task,
  meta,
  blocked,
  onSelect,
  showPlan = false,
}: {
  task: Task;
  meta: TaskMeta;
  blocked: boolean;
  onSelect: (id: string) => void;
  /** 是否显示「放进今天 / 移出今天」按钮 */
  showPlan?: boolean;
}) {
  const transition = useStore((s) => s.transition);
  const updateTask = useStore((s) => s.updateTask);
  const planTask = useStore((s) => s.planTask);
  const nudgeTask = useStore((s) => s.nudgeTask);
  const staleDays = useStore((s) => s.settings.staleDays);
  const markCompleted = useToast((s) => s.markCompleted);
  const fading = useToast((s) => Boolean(s.completedFx[task.id]));

  const project = task.projectId ? meta.projectMap.get(task.projectId) : undefined;
  const tagNames = task.tags
    .map((id) => meta.tagMap.get(id)?.name)
    .filter(Boolean) as string[];

  const done = task.status === "done" || task.status === "canceled";
  const due = dueMeta(task);
  const age = ageBadge(task, staleDays);
  const today = isoDay(new Date());
  const plannedToday = task.plannedFor === today;

  const visibleTags = tagNames.slice(0, 1);
  const hiddenCount = tagNames.length - visibleTags.length;

  async function run(e: React.MouseEvent, fn: () => Promise<unknown>) {
    e.stopPropagation();
    await fn().catch((err) => toastError(err));
  }

  async function toggleComplete(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      if (done) {
        await transition(task.id, { type: "reopen" });
        return;
      }
      await transition(task.id, { type: "complete" });
      markCompleted(task.id);
      toastWithUndo({
        title: `已完成「${task.title}」`,
        undo: () => {
          transition(task.id, { type: "reopen" }).catch((err) => toastError(err));
        },
      });
    } catch (err) {
      toastError(err);
    }
  }

  async function trashTask(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await transition(task.id, { type: "trash" });
      toastWithUndo({
        title: `已移入回收站「${task.title}」`,
        undo: () => {
          transition(task.id, { type: "restore" }).catch((err) => toastError(err));
        },
      });
    } catch (err) {
      toastError(err);
    }
  }

  async function togglePlan(e: React.MouseEvent) {
    e.stopPropagation();
    const prev = task.plannedFor;
    try {
      await planTask(task.id, plannedToday ? null : today);
      toastWithUndo({
        title: plannedToday ? "已移出今天" : `已放进今天「${task.title}」`,
        undo: () => {
          planTask(task.id, prev).catch((err) => toastError(err));
        },
      });
    } catch (err) {
      toastError(err);
    }
  }

  const iconBtn =
    "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground";

  return (
    <div
      onClick={() => onSelect(task.id)}
      className={`group relative flex cursor-pointer items-start gap-3 rounded-lg border bg-card py-2.5 pl-4 pr-3 transition hover:border-primary/40 hover:shadow-sm ${
        fading ? "opacity-60" : ""
      }`}
    >
      <span
        className={`absolute left-0 top-0 h-full w-[3px] rounded-l-lg ${PRIORITY_BAR[task.priority]}`}
      />

      <button
        onClick={toggleComplete}
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          done ? "border-primary bg-primary" : "border-muted-foreground/40 hover:border-primary"
        }`}
        aria-label={done ? "重新打开" : "完成"}
      >
        {done ? <Check className="h-3 w-3 text-primary-foreground" /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={`text-sm leading-snug ${
            done || fading ? "text-muted-foreground line-through" : ""
          }`}
        >
          {task.title}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {task.phase === "inbox" ? <span className="text-warning">待澄清</span> : null}
          {task.priority <= 2 ? (
            <span className="font-medium text-foreground/70">{PRIORITY_SHORT[task.priority]}</span>
          ) : null}
          {due ? (
            <span
              className={`flex items-center gap-0.5 ${
                due.danger ? "font-medium text-destructive" : ""
              }`}
            >
              <CalendarDays className="h-3 w-3" />
              {due.text}
            </span>
          ) : null}
          {project ? <span className="text-primary">#{project.name}</span> : null}
          {visibleTags.map((t) => (
            <span key={t} className="rounded bg-muted px-1">
              {t}
            </span>
          ))}
          {hiddenCount > 0 ? <span className="rounded bg-muted px-1">+{hiddenCount}</span> : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {age ? (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${
              age.stale ? "bg-warning/20 text-warning" : "text-muted-foreground"
            }`}
          >
            {age.text}
          </span>
        ) : null}
        {task.repeatRule ? (
          <Repeat className="h-3.5 w-3.5 text-muted-foreground" aria-label="重复任务" />
        ) : null}
        {blocked ? (
          <Lock className="h-3.5 w-3.5 text-warning" aria-label="被依赖阻塞" />
        ) : null}

        <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          {showPlan && task.phase === "action" && !done ? (
            <button
              onClick={togglePlan}
              className={`rounded p-1 hover:bg-muted ${
                plannedToday ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              title={plannedToday ? "移出今天" : "放进今天"}
            >
              <Sun className="h-3.5 w-3.5" />
            </button>
          ) : null}

          {task.phase === "action" && task.status === "todo" ? (
            <button
              onClick={(e) => run(e, () => transition(task.id, { type: "start" }))}
              className={iconBtn}
              title="开始（占用一个在制品名额）"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          ) : null}

          {task.status === "doing" ? (
            <button
              onClick={(e) => run(e, () => transition(task.id, { type: "stop" }))}
              className={iconBtn}
              title="放回待办"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : null}

          {task.phase === "waiting" && !done ? (
            <button
              onClick={(e) =>
                run(e, async () => {
                  await nudgeTask(task.id);
                })
              }
              className={iconBtn}
              title="戳一下（重置等待计时）"
            >
              <Hand className="h-3.5 w-3.5" />
            </button>
          ) : null}

          {task.phase === "someday" ? (
            <button
              onClick={(e) =>
                run(e, () => transition(task.id, { type: "clarify", target: "action" }))
              }
              className={iconBtn}
              title="提到下一步"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}

          {task.phase === "trash" ? (
            <>
              <button
                onClick={(e) => run(e, () => transition(task.id, { type: "restore" }))}
                className="rounded px-1.5 py-0.5 text-xs hover:bg-muted"
              >
                恢复
              </button>
              <button
                onClick={(e) => run(e, () => useStore.getState().deleteTask(task.id))}
                className="rounded px-1.5 py-0.5 text-xs text-destructive hover:bg-destructive/10"
              >
                删除
              </button>
            </>
          ) : (
            <button
              onClick={trashTask}
              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="移入回收站"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
