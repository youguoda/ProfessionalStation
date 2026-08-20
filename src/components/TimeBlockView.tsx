"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "@/store/useStore";
import { isoDay } from "@/lib/engine/selectors";
import type { Task } from "@/lib/domain/types";

function startOfWeek(offset: number, now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offset * 7);
  return d;
}

function weekDays(offset: number) {
  const start = startOfWeek(offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function Card({ task, onSelect }: { task: Task; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { taskId: task.id },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(task.id)}
      className={`cursor-grab rounded-md border bg-background px-2 py-1.5 text-xs shadow-sm hover:shadow ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {task.scheduledAt ? (
        <span className="mr-1 font-mono text-muted-foreground">{task.scheduledAt.slice(11, 16)}</span>
      ) : null}
      <span>{task.title}</span>
    </div>
  );
}

function DayColumn({
  date,
  tasks,
  onSelect,
  isToday,
}: {
  date: Date;
  tasks: Task[];
  onSelect: (id: string) => void;
  isToday: boolean;
}) {
  const key = isoDay(date);
  const { setNodeRef, isOver } = useDroppable({ id: `day-${key}`, data: { day: key } });
  const list = tasks
    .filter((t) => t.scheduledAt?.slice(0, 10) === key)
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[50vh] flex-col rounded-xl border bg-muted/30 p-2 ${
        isOver ? "border-primary" : ""
      } ${isToday ? "ring-1 ring-primary/40" : ""}`}
    >
      <div className="mb-2 px-1 text-center">
        <div className={`text-xs font-semibold ${isToday ? "text-primary" : ""}`}>
          {date.toLocaleDateString("zh-CN", { weekday: "short" })}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {date.getMonth() + 1}/{date.getDate()}
        </div>
      </div>
      <div className="space-y-1.5">
        {list.map((t) => (
          <Card key={t.id} task={t} onSelect={onSelect} />
        ))}
        {list.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground">—</p>
        ) : null}
      </div>
    </div>
  );
}

export function TimeBlockView({ onSelect }: { onSelect: (id: string) => void }) {
  const tasks = useStore((s) => s.tasks);
  const updateTask = useStore((s) => s.updateTask);
  const [offset, setOffset] = useState(0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const days = weekDays(offset);
  const todayKey = isoDay(new Date());

  const unscheduled = tasks
    .filter((t) => t.phase === "action" && t.status !== "done" && t.status !== "canceled" && !t.scheduledAt)
    .sort((a, b) => a.priority - b.priority);

  const { setNodeRef: setUnschedRef, isOver: unschedOver } = useDroppable({
    id: "unscheduled",
    data: { unschedule: true },
  });

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const targetDay = over.data.current?.day as string | undefined;
    const unschedule = over.data.current?.unschedule as boolean | undefined;
    if (targetDay) {
      updateTask(taskId, { scheduledAt: `${targetDay}T09:00:00` }).catch(() => {});
    } else if (unschedule) {
      updateTask(taskId, { scheduledAt: null }).catch(() => {});
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">时间块 / 周历</h1>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setOffset((o) => o - 1)} className="rounded-md border px-2 py-1">←</button>
          <button onClick={() => setOffset(0)} className="rounded-md border px-2 py-1">本周</button>
          <button onClick={() => setOffset((o) => o + 1)} className="rounded-md border px-2 py-1">→</button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-[15rem_1fr] gap-4">
          <div
            ref={setUnschedRef}
            className={`rounded-xl border bg-muted/30 p-3 ${unschedOver ? "border-primary" : ""}`}
          >
            <div className="mb-2 text-xs font-semibold text-muted-foreground">待排期</div>
            <div className="space-y-1.5">
              {unscheduled.map((t) => (
                <Card key={t.id} task={t} onSelect={onSelect} />
              ))}
              {unscheduled.length === 0 ? (
                <p className="py-6 text-center text-[11px] text-muted-foreground">全部已排期</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {days.map((d) => {
              const key = isoDay(d);
              return (
                <DayColumn
                  key={key}
                  date={d}
                  tasks={tasks}
                  onSelect={onSelect}
                  isToday={key === todayKey}
                />
              );
            })}
          </div>
        </div>
      </DndContext>

      <p className="mt-4 text-xs text-muted-foreground">
        把「待排期」任务拖到某一天即可排期；把已排期任务拖回「待排期」取消排期。
      </p>
    </div>
  );
}
