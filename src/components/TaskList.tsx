"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { blockedIdSet } from "@/lib/engine/selectors";
import { useTaskMeta } from "@/lib/client/useTaskMeta";
import { toastError, useToast } from "@/store/useToast";
import type { Task } from "@/lib/domain/types";
import { TaskItem } from "./TaskItem";

export function TaskList({
  title,
  tasks,
  onSelect,
  emptyText,
  showFrog = false,
  groupBy,
}: {
  title: string;
  tasks: Task[];
  onSelect: (id: string) => void;
  emptyText: string;
  showFrog?: boolean;
  groupBy?: (task: Task) => string;
}) {
  const meta = useTaskMeta();
  const allTasks = useStore((s) => s.tasks);
  const transition = useStore((s) => s.transition);
  const updateTask = useStore((s) => s.updateTask);
  const blockedIds = useMemo(() => blockedIdSet(allTasks), [allTasks]);
  const completedFx = useToast((s) => s.completedFx);

  // 完成动效：刚完成的任务短暂保留（划线 → 淡出）
  const fxTasks = useMemo(
    () =>
      Object.keys(completedFx)
        .map((id) => allTasks.find((t) => t.id === id))
        .filter(
          (t): t is Task => t !== undefined && !tasks.some((x) => x.id === t.id),
        ),
    [completedFx, allTasks, tasks],
  );

  // 键盘导航（↑↓ 选中 / Enter 打开 / Space 完成 / 1-4 优先级）
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
      const list = flatRef.current;
      if (list.length === 0) return;
      const idx = list.findIndex((t) => t.id === selectedId);
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
        if (idx >= 0) onSelect(list[idx].id);
      } else if (e.key === " ") {
        e.preventDefault();
        const t = list[idx];
        if (t) {
          transition(
            t.id,
            t.status === "done" ? { type: "reopen" } : { type: "complete" },
          ).catch((err) => toastError(err));
        }
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        const t = list[idx];
        if (t) {
          updateTask(t.id, { priority: Number(e.key) }).catch((err) => toastError(err));
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, onSelect, transition, updateTask]);

  const renderItem = (t: Task) => (
    <div
      key={t.id}
      className={selectedId === t.id ? "rounded-lg ring-1 ring-primary/50" : ""}
    >
      <TaskItem
        task={t}
        meta={meta}
        blocked={blockedIds.has(t.id)}
        onSelect={onSelect}
        showFrog={showFrog}
      />
    </div>
  );

  if (tasks.length === 0 && fxTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <div className="text-3xl mb-2">🗂</div>
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  }

  if (!groupBy) {
    return (
      <div className="space-y-1.5">
        {tasks.map(renderItem)}
        {fxTasks.map(renderItem)}
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
          <div className="space-y-1.5">{list.map(renderItem)}</div>
        </section>
      ))}
      {fxTasks.length > 0 ? (
        <div className="space-y-1.5">{fxTasks.map(renderItem)}</div>
      ) : null}
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
    <div className="mb-5 flex items-end justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}
