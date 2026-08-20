"use client";

import { useStore } from "@/store/useStore";
import { selectMatrix } from "@/lib/engine/selectors";
import { PRIORITY_LABELS } from "@/lib/domain/constants";
import { TaskItem } from "./TaskItem";

const QUADRANT_STYLE: Record<string, string> = {
  q1: "border-red-200 bg-red-50/40",
  q2: "border-blue-200 bg-blue-50/40",
  q3: "border-amber-200 bg-amber-50/40",
  q4: "border-neutral-200 bg-neutral-50/40",
};

export function MatrixView({ onSelect }: { onSelect: (id: string) => void }) {
  const tasks = useStore((s) => s.tasks);
  const quadrants = selectMatrix(tasks);

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
                <TaskItem key={t.id} task={t} onSelect={onSelect} />
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
