"use client";

import { useMemo, useRef, useState } from "react";
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
import { type SlotSuggestion } from "@/lib/engine/scheduler";
import type { Task } from "@/lib/domain/types";
import { api } from "@/lib/client/api";
import { toastError, toastWithUndo } from "@/store/useToast";

/** 每 30 分钟对应的高度（px），块高度 = 时长 × 此比例 */
const PX_PER_30 = 22;
const HOUR_ROW_PX = 44;

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
  const updateTask = useStore((s) => s.updateTask);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { taskId: task.id },
  });
  const startY = useRef(0);
  const [dragH, setDragH] = useState(0);

  const height = Math.max(22, (task.durationMinutes / 30) * PX_PER_30) + dragH;

  function onResizeDown(e: React.PointerEvent) {
    e.stopPropagation();
    startY.current = e.clientY;
    setDragH(0);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setDragH(ev.clientY - startY.current);
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const delta = ev.clientY - startY.current;
      const next = Math.round(
        Math.min(480, Math.max(15, task.durationMinutes + (delta / PX_PER_30) * 30) / 15),
      ) * 15;
      setDragH(0);
      if (next !== task.durationMinutes) {
        updateTask(task.id, { durationMinutes: next }).catch((err) => toastError(err));
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), height }}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(task.id)}
      className={`cursor-grab overflow-hidden rounded-md border bg-background px-2 pt-1 text-xs shadow-sm hover:shadow ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span>
          {task.scheduledAt ? (
            <span className="mr-1 font-mono text-muted-foreground">{task.scheduledAt.slice(11, 16)}</span>
          ) : null}
          {task.title}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {task.durationMinutes}m
        </span>
      </div>
      <div
        onPointerDown={onResizeDown}
        className="mt-1 flex h-2 cursor-ns-resize items-center justify-center rounded hover:bg-muted"
        title="拖拽调整时长"
      >
        <span className="h-0.5 w-6 rounded bg-muted-foreground/40" />
      </div>
    </div>
  );
}

function HourSlot({
  day,
  hour,
  tasks,
  onSelect,
}: {
  day: string;
  hour: number;
  tasks: Task[];
  onSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${day}-${hour}`, data: { day, hour } });
  const pad = String(hour).padStart(2, "0");
  const list = tasks.filter((t) => t.scheduledAt?.slice(0, 13) === `${day}T${pad}`);
  return (
    <div
      ref={setNodeRef}
      style={{ minHeight: HOUR_ROW_PX }}
      className={`flex items-start gap-1 rounded px-1 py-0.5 ${
        isOver ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted/60"
      }`}
    >
      <span className="w-9 shrink-0 pt-0.5 font-mono text-[10px] text-muted-foreground">
        {pad}:00
      </span>
      <div className="flex-1 space-y-0.5">
        {list.map((t) => (
          <Card key={t.id} task={t} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function DayColumn({
  date,
  tasks,
  onSelect,
  isToday,
  hours,
}: {
  date: Date;
  tasks: Task[];
  onSelect: (id: string) => void;
  isToday: boolean;
  hours: number[];
}) {
  const key = isoDay(date);
  const dayTasks = tasks.filter((t) => t.scheduledAt?.slice(0, 10) === key);
  const overflow = dayTasks.filter((t) => {
    const h = Number(t.scheduledAt?.slice(11, 13));
    return h < hours[0] || h >= hours[hours.length - 1] + 1;
  });
  // 全天区：dueDate 落在今天但没有具体排期
  const allDay = tasks.filter(
    (t) =>
      t.phase === "action" &&
      t.status !== "done" &&
      t.status !== "canceled" &&
      t.dueDate === key &&
      !t.scheduledAt,
  );

  // 当前时间红线（仅今天列）
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = hours[0] * 60;
  const totalMinutes = hours.length * 60;
  const nowTop = Math.min(1, Math.max(0, (nowMinutes - startMinutes) / totalMinutes)) * (totalMinutes * (HOUR_ROW_PX / 60));

  return (
    <div
      className={`relative flex flex-col rounded-xl border bg-muted/30 p-2 ${
        isToday ? "ring-1 ring-primary/40" : ""
      }`}
    >
      <div className="mb-2 px-1 text-center">
        <div className={`text-xs font-semibold ${isToday ? "text-primary" : ""}`}>
          {date.toLocaleDateString("zh-CN", { weekday: "short" })}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {date.getMonth() + 1}/{date.getDate()}
        </div>
      </div>

      {isToday && now.getHours() >= hours[0] && now.getHours() < hours[hours.length - 1] + 1 ? (
        <div
          className="pointer-events-none absolute left-1 right-1 z-10 h-px bg-destructive"
          style={{ top: nowTop + 40 }}
        >
          <span className="absolute -top-1.5 right-0 rounded bg-destructive px-1 text-[9px] text-destructive-foreground">
            {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
          </span>
        </div>
      ) : null}

      {allDay.length > 0 ? (
        <div className="mb-2 space-y-0.5">
          <div className="text-[10px] font-semibold uppercase text-muted-foreground">全天</div>
          {allDay.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className="block w-full truncate rounded border border-dashed px-1.5 py-1 text-left text-[11px] hover:bg-muted/60"
            >
              {t.title}
            </button>
          ))}
        </div>
      ) : null}

      {overflow.length > 0 ? (
        <div className="mb-2 space-y-0.5 rounded border border-dashed px-1 py-1">
          {overflow.map((t) => (
            <Card key={t.id} task={t} onSelect={onSelect} />
          ))}
        </div>
      ) : null}

      <div className="space-y-px">
        {hours.map((h) => (
          <HourSlot key={h} day={key} hour={h} tasks={dayTasks} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

export function TimeBlockView({ onSelect }: { onSelect: (id: string) => void }) {
  const tasks = useStore((s) => s.tasks);
  const updateTask = useStore((s) => s.updateTask);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const aiStatus = useStore((s) => s.aiStatus);
  const [offset, setOffset] = useState(0);
  const [scheduling, setScheduling] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const [preview, setPreview] = useState<SlotSuggestion[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const startHour = settings.dayStartHour ?? 8;
  const endHour = Math.min(24, Math.max(startHour + 1, settings.dayEndHour ?? 22));
  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  const days = weekDays(offset);
  const todayKey = isoDay(new Date());
  const weekKeys = useMemo(() => new Set(days.map((d) => isoDay(d))), [days]);

  const unscheduled = tasks
    .filter(
      (t) =>
        t.phase === "action" &&
        t.status !== "done" &&
        t.status !== "canceled" &&
        !t.scheduledAt &&
        (!t.dueDate || !weekKeys.has(t.dueDate)),
    )
    .sort((a, b) => a.priority - b.priority);

  const { setNodeRef: setUnschedRef, isOver: unschedOver } = useDroppable({
    id: "unscheduled",
    data: { unschedule: true },
  });

  // AI 排期：先预览（提案模式），确认后才写入
  async function generateSchedule() {
    if (scheduling) return;
    setScheduling(true);
    try {
      const r = await api.aiSchedule();
      setPreview(r.suggestions);
      setSelected(new Set(r.suggestions.map((s) => s.taskId)));
    } catch (e) {
      toastError(e);
    } finally {
      setScheduling(false);
    }
  }

  async function applySelected() {
    if (!preview) return;
    const toApply = preview.filter((s) => selected.has(s.taskId));
    const prevValues = new Map(
      toApply.map((s) => {
        const t = tasks.find((x) => x.id === s.taskId);
        return [s.taskId, t?.scheduledAt ?? null];
      }),
    );
    await Promise.all(
      toApply.map((s) => updateTask(s.taskId, { scheduledAt: s.scheduledAt })),
    );
    toastWithUndo({
      title: `已排期 ${toApply.length} 个任务`,
      undo: () => {
        for (const s of toApply) {
          updateTask(s.taskId, { scheduledAt: prevValues.get(s.taskId) ?? null }).catch(() => {});
        }
      },
    });
    setPreview(null);
    setSelected(new Set());
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const targetDay = over.data.current?.day as string | undefined;
    const targetHour = over.data.current?.hour as number | undefined;
    const unschedule = over.data.current?.unschedule as boolean | undefined;
    if (targetDay && targetHour !== undefined) {
      const pad = String(targetHour).padStart(2, "0");
      const prev = tasks.find((t) => t.id === taskId)?.scheduledAt ?? null;
      updateTask(taskId, { scheduledAt: `${targetDay}T${pad}:00:00` })
        .then(() =>
          toastWithUndo({
            title: "已排期",
            undo: () => {
              updateTask(taskId, { scheduledAt: prev }).catch(() => {});
            },
          }),
        )
        .catch((e) => toastError(e));
    } else if (unschedule) {
      const prev = tasks.find((t) => t.id === taskId)?.scheduledAt ?? null;
      updateTask(taskId, { scheduledAt: null })
        .then(() =>
          toastWithUndo({
            title: "已取消排期",
            undo: () => {
              updateTask(taskId, { scheduledAt: prev }).catch(() => {});
            },
          }),
        )
        .catch((e) => toastError(e));
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">时间块 / 周历</h1>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={generateSchedule}
            disabled={scheduling}
            className="rounded-md border px-2 py-1 text-xs text-primary disabled:opacity-50"
            title="生成排期建议，确认后才写入"
          >
            {scheduling ? "生成中…" : aiStatus?.enabled ? "🤖 AI 排期建议" : "✨ 智能排期建议"}
          </button>
          <button onClick={() => setShowHours((v) => !v)} className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
            时段
          </button>
          <button onClick={() => setOffset((o) => o - 1)} className="rounded-md border px-2 py-1">←</button>
          <button onClick={() => setOffset(0)} className="rounded-md border px-2 py-1">本周</button>
          <button onClick={() => setOffset((o) => o + 1)} className="rounded-md border px-2 py-1">→</button>
        </div>
      </div>

      {showHours ? (
        <div className="mb-4 flex items-center gap-4 rounded-lg border bg-muted/40 p-3 text-xs">
          <span className="text-muted-foreground">可见时段：</span>
          <label className="flex items-center gap-1">
            开始
            <input
              type="number"
              min={0}
              max={23}
              value={startHour}
              onChange={(e) =>
                updateSettings({ dayStartHour: Math.max(0, Math.min(23, Number(e.target.value))) }).catch(
                  (err) => toastError(err),
                )
              }
              className="w-14 rounded-md border bg-background px-1 py-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-1">
            结束
            <input
              type="number"
              min={1}
              max={24}
              value={endHour}
              onChange={(e) =>
                updateSettings({ dayEndHour: Math.max(1, Math.min(24, Number(e.target.value))) }).catch(
                  (err) => toastError(err),
                )
              }
              className="w-14 rounded-md border bg-background px-1 py-1 text-sm"
            />
          </label>
        </div>
      ) : null}

      {preview ? (
        <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">排期建议（确认后写入）</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelected(new Set(preview.map((s) => s.taskId)));
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                全选
              </button>
              <button onClick={applySelected} className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">
                应用所选（{selected.size}）
              </button>
              <button onClick={() => setPreview(null)} className="rounded-md border px-2 py-1 text-xs">
                取消
              </button>
            </div>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {preview.map((s) => {
              const t = tasks.find((x) => x.id === s.taskId);
              if (!t) return null;
              const checked = selected.has(s.taskId);
              return (
                <label
                  key={s.taskId}
                  className="flex cursor-pointer items-center gap-2 rounded border bg-background px-2 py-1.5 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = new Set(selected);
                      if (checked) next.delete(s.taskId);
                      else next.add(s.taskId);
                      setSelected(next);
                    }}
                  />
                  <span className="font-mono text-muted-foreground">
                    {s.scheduledAt.slice(5, 16).replace("T", " ")}
                  </span>
                  <span className="truncate">{t.title}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-[15rem_1fr] gap-4">
          <div
            ref={setUnschedRef}
            className={`h-fit rounded-xl border bg-muted/30 p-3 ${unschedOver ? "border-primary" : ""}`}
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
                  hours={hours}
                />
              );
            })}
          </div>
        </div>
      </DndContext>

      <p className="mt-4 text-xs text-muted-foreground">
        块高度 = 时长（拖动卡片底部把手调整时长）；把任务拖到某个小时即排期；拖回「待排期」取消。
      </p>
    </div>
  );
}
