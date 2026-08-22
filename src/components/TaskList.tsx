"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { blockedIdSet, isoDay } from "@/lib/engine/selectors";
import { useTaskMeta } from "@/lib/client/useTaskMeta";
import { toastError, useToast } from "@/store/useToast";
import type { Task } from "@/lib/domain/types";
import { TaskItem } from "./TaskItem";

export function TaskList({
  tasks,
  onSelect,
  emptyText,
  emptyHint,
  emptyAction,
  showPlan = false,
  groupBy,
  renderItem,
}: {
  tasks: Task[];
  onSelect: (id: string) => void;
  emptyText: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
  showPlan?: boolean;
  groupBy?: (task: Task) => string;
  renderItem?: (task: Task) => React.ReactNode;
}) {
  const meta = useTaskMeta();
  const allTasks = useStore((s) => s.tasks);
  const transition = useStore((s) => s.transition);
  const updateTask = useStore((s) => s.updateTask);
  const planTask = useStore((s) => s.planTask);
  const blockedIds = useMemo(() => blockedIdSet(allTasks), [allTasks]);
  const completedFx = useToast((s) => s.completedFx);

  // 完成动效：刚完成的任务短暂保留（划线 → 淡出）
  const fxTasks = useMemo(
    () =>
      Object.keys(completedFx)
        .map((id) => allTasks.find((t) => t.id === id))
        .filter((t): t is Task => t !== undefined && !tasks.some((x) => x.id === t.id)),
    [completedFx, allTasks, tasks],
  );

  // 键盘导航（↑↓ 选中 / Enter 打开 / Space 完成 / T 放进今天 / 1-4 优先级）
  const flatRef = useRef(tasks);
  flatRef.current = tasks;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId((cur) => {
      if (cur && tasks.some((t) => t.id === cur)) return cur;
      return tasks[0]?.id ?? null;
    });
  }, [tasks]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const list = flatRef.current;
      if (list.length === 0) return;
      const idx = list.findIndex((t) => t.id === selectedId);
      const current = list[idx];
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = list[Math.min(idx + 1, list.length - 1)];
        if (next) setSelectedId(next.id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = list[Math.max(idx - 1, 0)];
        if (prev) setSelectedId(prev.id);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (current) onSelect(current.id);
      } else if (e.key === " ") {
        e.preventDefault();
        if (current) {
          transition(
            current.id,
            current.status === "done" ? { type: "reopen" } : { type: "complete" },
          ).catch((err) => toastError(err));
        }
      } else if (e.key.toLowerCase() === "t") {
        if (current && current.phase === "action") {
          e.preventDefault();
          const today = isoDay(new Date());
          planTask(current.id, current.plannedFor === today ? null : today).catch((err) =>
            toastError(err),
          );
        }
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        if (current) {
          updateTask(current.id, { priority: Number(e.key) }).catch((err) => toastError(err));
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, onSelect, transition, updateTask, planTask]);

  const defaultRenderItem = (t: Task) => (
    <div className={selectedId === t.id ? "rounded-lg ring-1 ring-primary/50" : ""}>
      <TaskItem
        task={t}
        meta={meta}
        blocked={blockedIds.has(t.id)}
        onSelect={onSelect}
        showPlan={showPlan}
      />
    </div>
  );

  const renderRow = (t: Task) => (
    <Fragment key={t.id}>{renderItem ? renderItem(t) : defaultRenderItem(t)}</Fragment>
  );

  if (tasks.length === 0 && fxTasks.length === 0) {
    return <EmptyState text={emptyText} hint={emptyHint} action={emptyAction} />;
  }

  if (!groupBy) {
    return (
      <div className="space-y-1.5">
        {tasks.map(renderRow)}
        {fxTasks.map(renderRow)}
      </div>
    );
  }

  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = groupBy(t);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([key, list]) => (
        <section key={key}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {key}
          </h3>
          <div className="space-y-1.5">{list.map(renderRow)}</div>
        </section>
      ))}
      {fxTasks.length > 0 ? <div className="space-y-1.5">{fxTasks.map(renderRow)}</div> : null}
    </div>
  );
}

/** 空状态是教学时机：一句解释 + 一个下一步动作 */
export function EmptyState({
  text,
  hint,
  action,
}: {
  text: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <p className="text-sm font-medium">{text}</p>
      {hint ? <p className="mt-1 max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}
