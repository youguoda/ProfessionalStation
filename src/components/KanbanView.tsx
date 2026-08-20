"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "@/store/useStore";
import { selectKanban } from "@/lib/engine/selectors";
import { PRIORITY_SHORT, STATUS_LABELS } from "@/lib/domain/constants";
import type { Status, Task } from "@/lib/domain/types";
import { toastError } from "@/store/useToast";
import { formatRelativeDate } from "@/lib/parsing/dateFormat";

const COLUMNS: Status[] = ["todo", "doing", "done"];

function Card({ task, onSelect }: { task: Task; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: task.id,
    data: { column: task.status },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform) }}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(task.id)}
      className={`cursor-grab rounded-lg border bg-background px-3 py-2.5 text-sm shadow-sm hover:shadow ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="leading-snug">{task.title}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/70">
          {PRIORITY_SHORT[task.priority]}
        </span>
        {task.effort ? <span>{task.effort}pt</span> : null}
        {task.dueDate ? <span>{formatRelativeDate(task.dueDate)}</span> : null}
        {task.isFrog ? <span>🐸</span> : null}
      </div>
    </div>
  );
}

function Column({
  status,
  tasks,
  wip,
  onSelect,
}: {
  status: Status;
  tasks: Task[];
  wip: number;
  onSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}`, data: { column: status } });
  const over = wip > 0 && tasks.length > wip;

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[60vh] flex-col rounded-xl border bg-muted/40 p-3 ${
        isOver ? "border-primary" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{STATUS_LABELS[status]}</h3>
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            over ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
          }`}
        >
          {tasks.length}
          {wip > 0 ? `/${wip}` : ""}
        </span>
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {tasks.map((t) => (
            <Card key={t.id} task={t} onSelect={onSelect} />
          ))}
          {tasks.length === 0 ? (
            <p className="px-1 py-8 text-center text-xs text-muted-foreground">空</p>
          ) : null}
        </div>
      </SortableContext>
    </div>
  );
}

export function KanbanView({ onSelect }: { onSelect: (id: string) => void }) {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const transition = useStore((s) => s.transition);
  const updateSettings = useStore((s) => s.updateSettings);
  const [showWip, setShowWip] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const columns = selectKanban(tasks, settings).filter((c) =>
    COLUMNS.includes(c.status as Status),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const source = active.data.current?.column as Status | undefined;
    let target = over.data.current?.column as Status | undefined;
    if (!target && typeof over.id === "string" && over.id.startsWith("col-")) {
      target = over.id.replace("col-", "") as Status;
    }
    if (target && source && target !== source) {
      transition(String(active.id), { type: "setStatus", status: target }).catch((e) =>
        toastError(e),
      );
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">看板</h1>
        <button
          onClick={() => setShowWip((v) => !v)}
          className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          ⚙ WIP 上限
        </button>
      </div>

      {showWip ? (
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border bg-muted/40 p-3 text-xs">
          <span className="text-muted-foreground">每列在制品上限（留空 = 不限）</span>
          {COLUMNS.map((s) => (
            <label key={s} className="flex items-center gap-1">
              {STATUS_LABELS[s]}
              <input
                type="number"
                min={0}
                max={50}
                value={settings.kanbanWip[s] === -1 ? "" : settings.kanbanWip[s]}
                onChange={(e) => {
                  const v = e.target.value === "" ? -1 : Math.max(0, Number(e.target.value));
                  updateSettings({ kanbanWip: { ...settings.kanbanWip, [s]: v } }).catch((e) =>
                    toastError(e),
                  );
                }}
                className="w-14 rounded-md border bg-background px-1 py-1 text-sm"
              />
            </label>
          ))}
        </div>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-3 gap-4">
          {columns.map((c) => (
            <Column key={c.status} status={c.status} tasks={c.tasks} wip={c.wip} onSelect={onSelect} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
