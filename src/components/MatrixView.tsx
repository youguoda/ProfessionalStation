"use client";

import { useMemo } from "react";
import { useStore } from "@/store/useStore";
import { blockedIdSet, scopeSource, selectMatrix } from "@/lib/engine/selectors";
import { useTaskMeta } from "@/lib/client/useTaskMeta";
import type { ScopeId } from "@/lib/domain/types";
import { TaskItem } from "./TaskItem";

const QUADRANT_STYLE: Record<string, string> = {
  q1: "border-quadrant-1/30 bg-quadrant-1/10",
  q2: "border-quadrant-2/30 bg-quadrant-2/10",
  q3: "border-quadrant-3/30 bg-quadrant-3/10",
  q4: "border-quadrant-4/30 bg-quadrant-4/10",
};

export function MatrixView({ scope, onSelect }: { scope: ScopeId; onSelect: (id: string) => void }) {
  const tasks = useStore((s) => s.tasks);
  const meta = useTaskMeta();
  const blockedIds = useMemo(() => blockedIdSet(tasks), [tasks]);
  const quadrants = selectMatrix(scopeSource(scope, tasks));

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">四象限</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          依据「优先级（重要）× 截止日期（紧急）」自动落位
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {quadrants.map((q) => (
          <div key={q.key} className={`rounded-xl border p-4 ${QUADRANT_STYLE[q.key]}`}>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">{q.label}</h3>
              <span className="text-xs text-muted-foreground">{q.hint}</span>
            </div>
            <div className="space-y-1.5">
              {q.tasks.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  meta={meta}
                  blocked={blockedIds.has(t.id)}
                  onSelect={onSelect}
                />
              ))}
              {q.tasks.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">空</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        优先级 P1/P2 视为重要；7 天内到期视为紧急。可在任务详情里调整优先级与截止日期。
      </p>
    </div>
  );
}
