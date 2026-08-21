"use client";

import { useMemo } from "react";
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
import { BookOpen, Hourglass, Sparkles, Zap } from "lucide-react";
import { useStore } from "@/store/useStore";
import {
  needsWeeklyReview,
  selectInbox,
  selectNextActions,
  selectSomeday,
  selectToday,
  selectTrash,
  selectUpcoming,
  selectWaiting,
  tasksForScope,
} from "@/lib/engine/selectors";
import { CLARIFY_BUCKETS, clarifyTargetFromDrop } from "@/lib/engine/clarifyDrop";
import type { ClarifyTarget } from "@/lib/engine/stateMachine";
import { formatRelativeDate } from "@/lib/parsing/dateFormat";
import { toastError } from "@/store/useToast";
import type { ScopeId, Task } from "@/lib/domain/types";
import { PageHeader, TaskList } from "./TaskList";
import { TaskItem } from "./TaskItem";
import { useTaskMeta } from "@/lib/client/useTaskMeta";
import { blockedIdSet } from "@/lib/engine/selectors";

const SCOPE_META: Record<string, { title: string; subtitle: string; empty: string }> = {
  inbox: { title: "收件箱", subtitle: "捕获的念头在这里澄清，收件箱永远可以清空", empty: "收件箱已清空 🎉" },
  today: { title: "今天", subtitle: "逾期置顶 · 青蛙优先，一次一件", empty: "今天没有安排，享受空白" },
  upcoming: { title: "未来 7 天", subtitle: "按天分组，可拖拽到其他日期", empty: "未来 7 天没有安排" },
  anytime: { title: "随时（下一步）", subtitle: "所有可执行的下一步，按上下文分组", empty: "没有下一步行动" },
  waiting: { title: "等待", subtitle: "等待他人或依赖的事，定期回顾", empty: "没有等待项" },
  someday: { title: "将来/也许", subtitle: "现在不做，但值得保留的想法", empty: "暂时没有想法" },
  trash: { title: "回收站", subtitle: "恢复或永久删除", empty: "回收站为空" },
};

function UpcomingGroup({ day, children }: { day: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `up-day-${day}`, data: { day } });
  return (
    <section>
      <h3
        ref={setNodeRef}
        className={`mb-2 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide ${
          isOver ? "bg-primary/10 text-primary" : "text-muted-foreground"
        }`}
      >
        {formatRelativeDate(day)}
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

const CLARIFY_ICONS: Record<ClarifyTarget, typeof Zap> = {
  action: Zap,
  waiting: Hourglass,
  someday: Sparkles,
  reference: BookOpen,
};

function ClarifyBucket({ target }: { target: ClarifyTarget }) {
  const { setNodeRef, isOver } = useDroppable({ id: `clarify-${target}`, data: { clarify: target } });
  const meta = CLARIFY_BUCKETS.find((b) => b.target === target)!;
  const Icon = CLARIFY_ICONS[target];
  return (
    <div
      ref={setNodeRef}
      title={meta.hint}
      className={`flex items-center gap-2 rounded-xl border-2 border-dashed px-3 py-2.5 text-sm transition-colors ${
        isOver
          ? "border-primary bg-primary/10 text-primary"
          : "border-muted-foreground/25 bg-muted/30 text-muted-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{meta.label}</span>
    </div>
  );
}

export function ListView({ scope, onSelect }: { scope: ScopeId; onSelect: (id: string) => void }) {
  const tasks = useStore((s) => s.tasks);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const updateTask = useStore((s) => s.updateTask);
  const transition = useStore((s) => s.transition);
  const areas = useStore((s) => s.areas);
  const weeklyReviews = useStore((s) => s.weeklyReviews);
  const setScope = useStore((s) => s.setScope);
  const meta = useTaskMeta();
  const blockedIds = useMemo(() => blockedIdSet(tasks), [tasks]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const metaInfo = SCOPE_META[scope] ?? SCOPE_META.anytime;
  let title = metaInfo.title;
  let subtitle = metaInfo.subtitle;
  let empty = metaInfo.empty;
  if (scope.startsWith("area:")) {
    const area = areas.find((a) => a.id === scope.slice("area:".length));
    title = `${area?.icon ?? ""} ${area?.name ?? "领域"}`;
    subtitle = "该领域的进行中任务";
    empty = "该领域没有进行中的任务";
  }
  let list = tasksForScope(scope, tasks);
  if (scope === "anytime") list = selectNextActions(tasks);

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      (t) => t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q),
    );
  }

  const groupBy =
    scope === "anytime"
      ? (t: Task) => {
          const ctx = t.contexts.map((id) => meta.tagMap.get(id)?.name).find(Boolean);
          return ctx ? `@${ctx}` : "未分类";
        }
      : undefined;

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const day = over.data.current?.day as string | undefined;
    if (day) {
      updateTask(String(active.id), { dueDate: day }).catch((err) => toastError(err));
    }
  };

  // 收件箱拖拽澄清：落点必须命中澄清桶，且拖动的必须是当前列表内的任务
  const handleClarifyDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const target = clarifyTargetFromDrop(over.data.current?.clarify);
    if (!target) return;
    if (!list.some((t) => t.id === String(active.id))) return;
    transition(String(active.id), { type: "clarify", target }).catch((err) => toastError(err));
  };

  const renderItem = (t: Task) => (
    <TaskItem
      task={t}
      meta={meta}
      blocked={blockedIds.has(t.id)}
      onSelect={onSelect}
      showFrog={scope === "today"}
    />
  );

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
            <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </span>
        </div>
      ) : null}

      {scope === "today" && needsWeeklyReview(weeklyReviews) ? (
        <button
          onClick={() => setScope("review")}
          className="mb-4 flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/10"
        >
          🔁 本周还没回顾 → 花 20 分钟让系统保持可信
        </button>
      ) : null}

      {scope === "inbox" ? (
        <DndContext sensors={sensors} onDragEnd={handleClarifyDragEnd}>
          {list.length > 0 ? (
            <div className="mb-4">
              <p className="mb-2 text-xs text-muted-foreground">
                拖拽任务卡片到对应桶完成澄清
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CLARIFY_BUCKETS.map((b) => (
                  <ClarifyBucket key={b.target} target={b.target} />
                ))}
              </div>
            </div>
          ) : null}
          <TaskList
            title={title}
            tasks={list}
            onSelect={onSelect}
            emptyText={empty}
            renderItem={(t) => <DraggableRow task={t}>{renderItem(t)}</DraggableRow>}
          />
        </DndContext>
      ) : scope === "upcoming" ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {(() => {
            const groups = new Map<string, Task[]>();
            for (const t of list) {
              const key = t.dueDate ?? t.scheduledAt?.slice(0, 10) ?? "未定";
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(t);
            }
            if (groups.size === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <p className="text-sm">{empty}</p>
                </div>
              );
            }
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
          title={title}
          tasks={list}
          onSelect={onSelect}
          emptyText={empty}
          showFrog={scope === "today"}
          groupBy={groupBy}
        />
      )}
    </div>
  );
}
