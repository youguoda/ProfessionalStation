"use client";

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
  if (tasks.length === 0) {
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
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} onSelect={onSelect} showFrog={showFrog} />
        ))}
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
          <div className="space-y-1.5">
            {list.map((t) => (
              <TaskItem key={t.id} task={t} onSelect={onSelect} showFrog={showFrog} />
            ))}
          </div>
        </section>
      ))}
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
