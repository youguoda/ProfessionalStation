"use client";

import type { Task } from "@/lib/domain/types";
import { PRIORITY_LABELS } from "@/lib/domain/constants";
import { isBlocked, isoDay } from "@/lib/engine/selectors";
import { formatRelativeDate } from "@/lib/parsing/dateFormat";
import { useStore } from "@/store/useStore";
import { toastError } from "@/store/useToast";

function dueMeta(task: Task): { text: string; danger: boolean } | null {
  if (!task.dueDate) return null;
  const today = isoDay(new Date());
  const danger = task.dueDate < today && task.status !== "done" && task.status !== "canceled";
  return { text: formatRelativeDate(task.dueDate), danger };
}

export function TaskItem({
  task,
  onSelect,
  showFrog = false,
}: {
  task: Task;
  onSelect: (id: string) => void;
  showFrog?: boolean;
}) {
  const transition = useStore((s) => s.transition);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const projects = useStore((s) => s.projects);
  const areas = useStore((s) => s.areas);
  const tags = useStore((s) => s.tags);
  const tasks = useStore((s) => s.tasks);

  const project = projects.find((p) => p.id === task.projectId);
  const area = areas.find((a) => a.id === task.areaId);
  const contextNames = task.contexts
    .map((id) => tags.find((t) => t.id === id)?.name)
    .filter(Boolean) as string[];
  const tagNames = task.tags
    .map((id) => tags.find((t) => t.id === id)?.name)
    .filter(Boolean) as string[];

  const done = task.status === "done" || task.status === "canceled";
  const due = dueMeta(task);
  const blocked = isBlocked(task, tasks);

  async function run(e: React.MouseEvent, fn: () => Promise<unknown>) {
    e.stopPropagation();
    await fn().catch((err) => toastError(err));
  }

  function Checkbox() {
    if (task.phase === "inbox" || task.phase === "reference" || task.phase === "trash") return null;
    return (
      <button
        onClick={(e) =>
          run(e, () =>
            transition(task.id, done ? { type: "reopen" } : { type: "complete" }),
          )
        }
        className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border ${
          done ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"
        }`}
        aria-label={done ? "重新打开" : "完成"}
      >
        {done ? <span className="block text-[10px] text-primary-foreground leading-none mt-0.5">✓</span> : null}
      </button>
    );
  }

  return (
    <div
      onClick={() => onSelect(task.id)}
      className="group flex items-start gap-3 rounded-lg border bg-background px-3 py-2.5 hover:border-primary/40 hover:shadow-sm cursor-pointer transition"
    >
      <Checkbox />

      <div className="min-w-0 flex-1">
        <div className={`text-sm leading-snug ${done ? "line-through text-muted-foreground" : ""}`}>
          {task.title}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {task.phase === "inbox" ? (
            <span className="text-amber-500">待澄清</span>
          ) : null}
          <span className="font-medium text-foreground/70">{PRIORITY_LABELS[task.priority].split(" ")[0]}</span>
          {task.effort ? <span>⏱{task.effort}</span> : null}
          {due ? (
            <span className={due.danger ? "text-red-500 font-medium" : ""}>📅 {due.text}</span>
          ) : null}
          {project ? <span className="text-primary">#{project.name}</span> : null}
          {area ? <span>{area.icon} {area.name}</span> : null}
          {contextNames.map((c) => (
            <span key={c} className="rounded bg-muted px-1">@{c}</span>
          ))}
          {tagNames.map((t) => (
            <span key={t} className="rounded bg-muted px-1">{t}</span>
          ))}
          {task.isFrog ? <span>🐸</span> : null}
          {task.repeatRule ? <span title="重复任务">🔁</span> : null}
          {blocked ? <span title="被依赖阻塞" className="text-amber-500">🔒</span> : null}
          {task.phase === "waiting" && task.waitingFor ? <span>⌛ {task.waitingFor}</span> : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        {showFrog ? (
          <button
            onClick={(e) => run(e, () => updateTask(task.id, { isFrog: !task.isFrog }))}
            className={`rounded px-1.5 py-0.5 text-xs ${task.isFrog ? "bg-amber-100" : "hover:bg-muted"}`}
            title="标记为青蛙（最重要）"
          >
            🐸
          </button>
        ) : null}

        {task.phase === "inbox" ? (
          <select
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const target = e.target.value as "action" | "waiting" | "someday" | "reference";
              transition(task.id, { type: "clarify", target }).catch((err) => toastError(err));
            }}
            defaultValue=""
            className="rounded border bg-background px-1 py-0.5 text-xs"
          >
            <option value="" disabled>澄清…</option>
            <option value="action">→ 行动</option>
            <option value="waiting">→ 等待</option>
            <option value="someday">→ 将来</option>
            <option value="reference">→ 参考</option>
          </select>
        ) : null}

        {task.phase === "action" && task.status === "todo" ? (
          <button
            onClick={(e) => run(e, () => transition(task.id, { type: "start" }))}
            className="rounded px-1.5 py-0.5 text-xs hover:bg-muted"
            title="开始"
          >
            开始
          </button>
        ) : null}

        {task.phase === "action" && task.status === "doing" ? (
          <button
            onClick={(e) => run(e, () => transition(task.id, { type: "complete" }))}
            className="rounded px-1.5 py-0.5 text-xs hover:bg-muted"
            title="完成"
          >
            完成
          </button>
        ) : null}

        {task.phase === "someday" ? (
          <button
            onClick={(e) => run(e, () => transition(task.id, { type: "clarify", target: "action" }))}
            className="rounded px-1.5 py-0.5 text-xs hover:bg-muted"
            title="转为行动"
          >
            → 行动
          </button>
        ) : null}

        {task.phase === "trash" ? (
          <>
            <button
              onClick={(e) => run(e, () => transition(task.id, { type: "restore" }))}
              className="rounded px-1.5 py-0.5 text-xs hover:bg-muted"
            >
              恢复
            </button>
            <button
              onClick={(e) => run(e, () => deleteTask(task.id))}
              className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50"
            >
              删除
            </button>
          </>
        ) : (
          <button
            onClick={(e) => run(e, () => transition(task.id, { type: "trash" }))}
            className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-red-500 hover:bg-red-50"
            title="移入回收站"
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
}
