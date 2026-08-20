"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { EFFORT_OPTIONS, PHASE_LABELS, STATUS_LABELS } from "@/lib/domain/constants";
import type { Priority } from "@/lib/domain/types";

export function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const task = tasks.find((t) => t.id === id);
  const updateTask = useStore((s) => s.updateTask);
  const transition = useStore((s) => s.transition);
  const deleteTask = useStore((s) => s.deleteTask);
  const projects = useStore((s) => s.projects);
  const areas = useStore((s) => s.areas);
  const tags = useStore((s) => s.tags);
  const createTag = useStore((s) => s.createTag);

  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [tagInput, setTagInput] = useState("");
  const [ctxInput, setCtxInput] = useState("");

  useEffect(() => {
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
  }, [task?.id]);

  if (!task) return null;

  const save = (patch: Record<string, unknown>) => {
    updateTask(task.id, patch).catch(() => {});
  };

  const addTag = async (kind: "tag" | "context", value: string) => {
    const name = value.trim();
    if (!name) return;
    const tag = await createTag(name, kind);
    const field = kind === "tag" ? "tags" : "contexts";
    const current = (task[field] ?? []) as string[];
    if (!current.includes(tag.id)) save({ [field]: [...current, tag.id] });
    if (kind === "tag") setTagInput("");
    else setCtxInput("");
  };

  const projectOptions = projects.filter((p) => !p.archived);
  const areaOptions = areas.filter((a) => !a.archived);

  const tagChips = task.tags.map((tid) => tags.find((t) => t.id === tid)).filter(Boolean);
  const ctxChips = task.contexts.map((tid) => tags.find((t) => t.id === tid)).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-[26rem] overflow-y-auto border-l bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {PHASE_LABELS[task.phase]} · {STATUS_LABELS[task.status]}
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== task.title && save({ title })}
          className="mb-3 w-full rounded-md border bg-background px-3 py-2 text-lg font-medium focus:outline-none focus:ring-1 focus:ring-primary/40"
        />

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => transition(task.id, { type: task.status === "doing" ? "complete" : "start" }).catch(() => {})}
            disabled={task.phase !== "action"}
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
          >
            {task.status === "doing" ? "完成" : "开始"}
          </button>
          {task.phase === "inbox" ? (
            <select
              onChange={(e) =>
                transition(task.id, {
                  type: "clarify",
                  target: e.target.value as "action" | "waiting" | "someday" | "reference",
                }).catch(() => {})
              }
              defaultValue=""
              className="rounded-md border bg-background px-3 py-1.5 text-xs"
            >
              <option value="" disabled>澄清为…</option>
              <option value="action">下一步行动</option>
              <option value="waiting">等待</option>
              <option value="someday">将来/也许</option>
              <option value="reference">参考资料</option>
            </select>
          ) : null}
          {task.phase === "someday" ? (
            <button
              onClick={() => transition(task.id, { type: "clarify", target: "action" }).catch(() => {})}
              className="rounded-md border px-3 py-1.5 text-xs"
            >
              转为行动
            </button>
          ) : null}
          {task.phase === "trash" ? (
            <button
              onClick={() => transition(task.id, { type: "restore" }).catch(() => {})}
              className="rounded-md border px-3 py-1.5 text-xs"
            >
              恢复
            </button>
          ) : (
            <button
              onClick={() => transition(task.id, { type: "trash" }).catch(() => {})}
              className="rounded-md border px-3 py-1.5 text-xs text-red-500"
            >
              移入回收站
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground">
            优先级
            <select
              value={task.priority}
              onChange={(e) => save({ priority: Number(e.target.value) as Priority })}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value={1}>P1 · 最高</option>
              <option value={2}>P2 · 高</option>
              <option value={3}>P3 · 中</option>
              <option value={4}>P4 · 低</option>
            </select>
          </label>

          <label className="text-xs text-muted-foreground">
            努力值
            <select
              value={task.effort ?? ""}
              onChange={(e) => save({ effort: e.target.value ? Number(e.target.value) : null })}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">未评估</option>
              {EFFORT_OPTIONS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-muted-foreground">
            截止日期
            <input
              type="date"
              value={task.dueDate ?? ""}
              onChange={(e) => save({ dueDate: e.target.value || null })}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>

          <label className="text-xs text-muted-foreground">
            项目
            <select
              value={task.projectId ?? ""}
              onChange={(e) => save({ projectId: e.target.value || null })}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">无项目</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-muted-foreground">
            领域
            <select
              value={task.areaId ?? ""}
              onChange={(e) => save({ areaId: e.target.value || null })}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">无领域</option>
              {areaOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
              ))}
            </select>
          </label>

          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={task.isFrog}
              onChange={(e) => save({ isFrog: e.target.checked })}
            />
            🐸 标记为青蛙（今天最重要）
          </label>
        </div>

        <div className="mt-4">
          <div className="mb-1 text-xs text-muted-foreground">标签</div>
          <div className="mb-2 flex flex-wrap gap-1">
            {tagChips.map((t) => (
              <span key={t!.id} className="rounded bg-muted px-2 py-0.5 text-xs">
                {t!.name}
              </span>
            ))}
          </div>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTag("tag", tagInput)}
            placeholder="输入标签，回车添加"
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          />
        </div>

        <div className="mt-4">
          <div className="mb-1 text-xs text-muted-foreground">上下文（@context）</div>
          <div className="mb-2 flex flex-wrap gap-1">
            {ctxChips.map((t) => (
              <span key={t!.id} className="rounded bg-muted px-2 py-0.5 text-xs">
                @{t!.name}
              </span>
            ))}
          </div>
          <input
            value={ctxInput}
            onChange={(e) => setCtxInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTag("context", ctxInput)}
            placeholder="如 @home / @办公室，回车添加"
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          />
        </div>

        <div className="mt-4">
          <div className="mb-1 text-xs text-muted-foreground">备注</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== task.notes && save({ notes })}
            rows={5}
            placeholder="补充说明…"
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          />
        </div>

        <div className="mt-6 border-t pt-4">
          <button
            onClick={() => deleteTask(task.id).then(onClose)}
            className="text-xs text-red-500"
          >
            {task.phase === "trash" ? "永久删除" : "移入回收站"}
          </button>
        </div>
      </div>
    </div>
  );
}
