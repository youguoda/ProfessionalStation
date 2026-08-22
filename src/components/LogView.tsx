"use client";

import { useMemo } from "react";
import { useStore } from "@/store/useStore";
import { blockedIdSet, selectLog } from "@/lib/engine/selectors";
import { useTaskMeta } from "@/lib/client/useTaskMeta";
import { TaskItem } from "./TaskItem";
import { PageHeader } from "./TaskList";

export function LogView({ onSelect }: { onSelect: (id: string) => void }) {
  const tasks = useStore((s) => s.tasks);
  const meta = useTaskMeta();
  const blockedIds = useMemo(() => blockedIdSet(tasks), [tasks]);
  const done = selectLog(tasks);

  const groups = new Map<string, typeof done>();
  for (const t of done) {
    const key = t.completedAt
      ? new Date(t.completedAt).toISOString().slice(0, 10)
      : "更早";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  return (
    <div>
      <PageHeader title="已完成日志" subtitle="按完成时间倒序。完成与取消都是终局——两种都记在这里。" />
      {done.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p className="text-sm">还没有结束过任何任务</p>
          <p className="mt-1 text-xs">去「今天」承诺一条，做完它。完成是这套系统里唯一的正反馈。</p>
        </div>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([day, items]) => (
            <section key={day}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {day}
              </h3>
              <div className="space-y-1.5">
                {items.map((t) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    meta={meta}
                    blocked={blockedIds.has(t.id)}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
