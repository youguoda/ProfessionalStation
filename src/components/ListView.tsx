"use client";

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "@/store/useStore";
import { selectUpcoming, tasksForScope, upcomingDay } from "@/lib/engine/selectors";
import { formatRelativeDate } from "@/lib/parsing/dateFormat";
import { toastError } from "@/store/useToast";
import type { ScopeId, Task } from "@/lib/domain/types";
import { EmptyState, PageHeader, TaskList } from "./TaskList";
import { useTaskMeta } from "@/lib/client/useTaskMeta";
import { blockedIdSet } from "@/lib/engine/selectors";
import { TaskItem } from "./TaskItem";
import { useMemo } from "react";

const SCOPE_META: Record<
  string,
  { title: string; subtitle: string; empty: string; hint: string }
> = {
  upcoming: {
    title: "未来 7 天",
    subtitle: "已经有日子的事，可拖到别的一天",
    empty: "未来 7 天没有安排",
    hint: "这里只显示已经有承诺日或截止日的任务。没日子的事在「下一步」里等着。",
  },
  anytime: {
    title: "下一步",
    subtitle: "库存：所有可执行的事，不设上限，也不必每天看",
    empty: "库存是空的",
    hint: "去收件箱澄清几条，或者按 Q 直接捕获一个念头。",
  },
  waiting: {
    title: "等待",
    subtitle: "球在别人手上。这个清单唯一的价值是让你不忘记去戳。",
    empty: "没有在等的事",
    hint: "澄清时选「等别人」的任务会出现在这里，并开始计时。",
  },
  someday: {
    title: "将来/也许",
    subtitle: "现在不做，但还不想扔",
    empty: "空",
    hint: "把想法放这里，周回顾时会提醒你结算长期没动的条目。",
  },
  trash: {
    title: "回收站",
    subtitle: "恢复或永久删除",
    empty: "回收站为空",
    hint: "被删掉和转存成笔记的任务都会留在这里，可以恢复。",
  },
};

function UpcomingGroup({ day, children }: { day: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `up-day-${day}`, data: { day } });
  return (
    <section>
      <h3
        ref={setNodeRef}
        className={`mb-2 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
          isOver ? "bg-primary/10 text-primary" : "text-muted-foreground"
        }`}
      >
        {formatRelativeDate(day)}
        <span className="ml-2 font-normal normal-case tracking-normal">{day}</span>
      </h3>
      {children}
    </section>
  );
}

function DraggableRow({ task, children }: { task: Task; children: React.ReactNode }) {
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
      className={isDragging ? "opacity-50" : ""}
    >
      {children}
    </div>
  );
}

export function ListView({ scope, onSelect }: { scope: ScopeId; onSelect: (id: string) => void }) {
  const tasks = useStore((s) => s.tasks);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const setScope = useStore((s) => s.setScope);
  const planTask = useStore((s) => s.planTask);
  const areas = useStore((s) => s.areas);
  const meta = useTaskMeta();
  const blockedIds = useMemo(() => blockedIdSet(tasks), [tasks]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const info = SCOPE_META[scope] ?? SCOPE_META.anytime;
  let title = info.title;
  let subtitle = info.subtitle;
  const empty = info.empty;
  const hint = info.hint;

  if (scope.startsWith("area:")) {
    const area = areas.find((a) => a.id === scope.slice("area:".length));
    title = `${area?.icon ?? ""} ${area?.name ?? "领域"}`;
    subtitle = "长期责任：没有终点，只有维持的标准";
  }

  let list = scope === "upcoming" ? selectUpcoming(tasks) : tasksForScope(scope, tasks);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      (t) => t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q),
    );
  }

  // 拖到另一天 = 改承诺日（不是改截止日：截止日是世界的要求，不该被拖动）
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const day = over.data.current?.day as string | undefined;
    if (day) planTask(String(active.id), day).catch((err) => toastError(err));
  };

  const renderItem = (t: Task) => (
    <TaskItem
      task={t}
      meta={meta}
      blocked={blockedIds.has(t.id)}
      onSelect={onSelect}
      showPlan={scope !== "trash"}
    />
  );

  const emptyAction =
    scope === "anytime" ? (
      <button
        onClick={() => setScope("inbox")}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        去收件箱澄清
      </button>
    ) : undefined;

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索…"
          className="w-48 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </PageHeader>

      {search ? (
        <div className="mb-4 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">筛选：</span>
          <span className="flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5">
            搜索「{search}」
            <button
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </span>
        </div>
      ) : null}

      {scope === "upcoming" ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {(() => {
            const groups = new Map<string, Task[]>();
            for (const t of list) {
              const key = upcomingDay(t) ?? "未定";
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(t);
            }
            if (groups.size === 0) return <EmptyState text={empty} hint={hint} />;
            return (
              <div className="space-y-6">
                {[...groups.entries()].map(([day, items]) => (
                  <UpcomingGroup key={day} day={day}>
                    <div className="space-y-1.5">
                      {items.map((t) => (
                        <DraggableRow key={t.id} task={t}>
                          {renderItem(t)}
                        </DraggableRow>
                      ))}
                    </div>
                  </UpcomingGroup>
                ))}
              </div>
            );
          })()}
        </DndContext>
      ) : (
        <TaskList
          tasks={list}
          onSelect={onSelect}
          emptyText={empty}
          emptyHint={hint}
          emptyAction={emptyAction}
          showPlan={scope !== "trash"}
        />
      )}
    </div>
  );
}
