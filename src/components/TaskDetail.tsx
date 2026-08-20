"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { EFFORT_OPTIONS, PHASE_LABELS, STATUS_LABELS } from "@/lib/domain/constants";
import { REPEAT_OPTIONS } from "@/lib/domain/repeat";
import { isBlocked } from "@/lib/engine/selectors";
import { splitCapture } from "@/lib/parsing/capture";
import type { Priority, Task } from "@/lib/domain/types";
import { api } from "@/lib/client/api";
import { usePomodoro } from "@/store/usePomodoro";
import { toastError } from "@/store/useToast";
import { Markdown } from "@/lib/markdown";
import { SearchSelect } from "./SearchSelect";

export function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const task = tasks.find((t) => t.id === id);
  const updateTask = useStore((s) => s.updateTask);
  const transition = useStore((s) => s.transition);
  const deleteTask = useStore((s) => s.deleteTask);
  const addTask = useStore((s) => s.addTask);
  const projects = useStore((s) => s.projects);
  const areas = useStore((s) => s.areas);
  const tags = useStore((s) => s.tags);
  const createTag = useStore((s) => s.createTag);
  const aiStatus = useStore((s) => s.aiStatus);

  const pomodoroStatus = usePomodoro((s) => s.status);
  const focusTaskId = usePomodoro((s) => s.focusTaskId);
  const pomodoroStart = usePomodoro((s) => s.start);
  const pomodoroPause = usePomodoro((s) => s.pause);

  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [tagInput, setTagInput] = useState("");
  const [ctxInput, setCtxInput] = useState("");
  const [depError, setDepError] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [previewNotes, setPreviewNotes] = useState(false);
  const [frogConflict, setFrogConflict] = useState<Task | null>(null);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
  }, [task?.id, task?.title, task?.notes]);

  // Esc 关闭抽屉
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!task) return null;

  const save = (patch: Record<string, unknown>) => {
    updateTask(task.id, patch).catch((e) => toastError(e));
  };

  /** 设置青蛙：若已有青蛙则先弹替换确认 */
  const setFrog = async (checked: boolean) => {
    if (!checked) {
      save({ isFrog: false });
      return;
    }
    const other = tasks.find((t) => t.id !== task.id && t.isFrog);
    if (other) {
      setFrogConflict(other);
      return;
    }
    save({ isFrog: true });
  };

  const replaceFrog = async () => {
    const other = frogConflict;
    setFrogConflict(null);
    try {
      if (other) await updateTask(other.id, { isFrog: false });
      await updateTask(task.id, { isFrog: true });
    } catch (e) {
      toastError(e);
    }
  };

  const addDependency = async (depId: string) => {
    try {
      await updateTask(task.id, { blockedBy: [...task.blockedBy, depId] });
      setDepError("");
    } catch (e) {
      setDepError(e instanceof Error ? e.message : "添加依赖失败");
    }
  };

  const splitNotes = async () => {
    if (splitting) return;
    const lines = splitCapture(task.notes);
    let titles: string[] = [];
    if (aiStatus?.enabled) {
      setSplitting(true);
      try {
        const result = await api.aiBreakdown(task.title, task.notes);
        titles = result.titles;
      } catch {
        titles = []; // AI 失败时降级到本地按行拆分
      } finally {
        setSplitting(false);
      }
    }
    const items = titles.length > 0 ? titles : lines;
    if (items.length === 0) return;
    await Promise.all(
      items.map((line) =>
        addTask({
          title: line,
          notes: "",
          phase: task.phase === "action" ? "action" : "inbox",
          priority: task.priority,
          projectId: task.projectId,
          areaId: task.areaId,
          parentId: task.id,
        }),
      ),
    );
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
  const children = tasks.filter((t) => t.parentId === task.id);

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
            onClick={() =>
              transition(task.id, {
                type: task.status === "doing" ? "complete" : "start",
              }).catch((e) => toastError(e))
            }
            disabled={task.phase !== "action"}
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
          >
            {task.status === "doing" ? "完成" : "开始"}
          </button>
          {task.phase !== "trash" && task.status !== "done" && task.status !== "canceled" ? (
            <button
              onClick={() => {
                if (focusTaskId === task.id && pomodoroStatus === "running") {
                  pomodoroPause();
                } else {
                  pomodoroStart(task.id);
                }
              }}
              className="rounded-md border px-3 py-1.5 text-xs"
              title="开启一个 25 分钟专注番茄钟"
            >
              {focusTaskId === task.id && pomodoroStatus === "running" ? "🍅 专注中…" : "🍅 专注"}
            </button>
          ) : null}
          {task.phase === "inbox" ? (
            <select
              onChange={(e) =>
                transition(task.id, {
                  type: "clarify",
                  target: e.target.value as "action" | "waiting" | "someday" | "reference",
                }).catch((err) => toastError(err))
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
              onClick={() =>
                transition(task.id, { type: "clarify", target: "action" }).catch((e) => toastError(e))
              }
              className="rounded-md border px-3 py-1.5 text-xs"
            >
              转为行动
            </button>
          ) : null}
          {task.phase === "trash" ? (
            <button
              onClick={() => transition(task.id, { type: "restore" }).catch((e) => toastError(e))}
              className="rounded-md border px-3 py-1.5 text-xs"
            >
              恢复
            </button>
          ) : (
            <button
              onClick={() => transition(task.id, { type: "trash" }).catch((e) => toastError(e))}
              className="rounded-md border px-3 py-1.5 text-xs text-destructive"
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

          <label className="col-span-2 text-xs text-muted-foreground">
            排期时间（时间块）
            <input
              type="datetime-local"
              value={task.scheduledAt ? task.scheduledAt.slice(0, 16) : ""}
              onChange={(e) =>
                save({ scheduledAt: e.target.value ? `${e.target.value}:00` : null })
              }
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>

          <label className="text-xs text-muted-foreground">
            项目
            <SearchSelect
              value={task.projectId}
              options={projectOptions.map((p) => ({ value: p.id, label: p.name }))}
              onSelect={(v) => save({ projectId: v })}
              placeholder="无项目"
            />
          </label>

          <label className="text-xs text-muted-foreground">
            领域
            <SearchSelect
              value={task.areaId}
              options={areaOptions.map((a) => ({ value: a.id, label: `${a.icon} ${a.name}` }))}
              onSelect={(v) => save({ areaId: v })}
              placeholder="无领域"
            />
          </label>

          <label className="text-xs text-muted-foreground">
            重复
            <select
              value={task.repeatRule ?? ""}
              onChange={(e) => save({ repeatRule: e.target.value || null })}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">不重复</option>
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          {task.phase === "waiting" ? (
            <label className="text-xs text-muted-foreground">
              等待谁/什么
              <input
                value={task.waitingFor ?? ""}
                onChange={(e) => save({ waitingFor: e.target.value || null })}
                placeholder="如：等客户回复"
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </label>
          ) : null}

          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={task.isFrog}
              onChange={(e) => setFrog(e.target.checked)}
            />
            🐸 标记为青蛙（今天最重要，同时只能有一只）
          </label>
          {frogConflict ? (
            <div className="col-span-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs">
              已有一只青蛙「{frogConflict.title}」，要替换成当前任务吗？
              <span className="ml-2">
                <button onClick={replaceFrog} className="font-medium text-primary">
                  替换
                </button>
                <button onClick={() => setFrogConflict(null)} className="ml-2 text-muted-foreground">
                  取消
                </button>
              </span>
            </div>
          ) : null}
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
            onKeyDown={(e) =>
              e.key === "Enter" && !e.nativeEvent.isComposing && addTag("tag", tagInput)
            }
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
            onKeyDown={(e) =>
              e.key === "Enter" && !e.nativeEvent.isComposing && addTag("context", ctxInput)
            }
            placeholder="如 @home / @办公室，回车添加"
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          />
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>依赖（先完成才能开始）</span>
            {isBlocked(task, tasks) ? <span className="text-warning">🔒 被阻塞</span> : null}
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {task.blockedBy.map((did) => {
              const dep = tasks.find((t) => t.id === did);
              return (
                <span key={did} className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">
                  {dep ? dep.title : "已删除"}
                  <button
                    onClick={() => save({ blockedBy: task.blockedBy.filter((x) => x !== did) })}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                </span>
              );
            })}
            {task.blockedBy.length === 0 ? <span className="text-xs text-muted-foreground">无</span> : null}
          </div>
          {depError ? (
            <p className="mb-1 text-xs text-destructive">{depError}</p>
          ) : null}
          <SearchSelect
            value={null}
            allowClear={false}
            options={tasks
              .filter((t) => t.id !== task.id && (t.phase === "action" || t.phase === "waiting"))
              .map((t) => ({ value: t.id, label: t.title }))}
            onSelect={(v) => {
              if (v) addDependency(v);
            }}
            placeholder="添加依赖任务…"
          />
        </div>

        {children.length > 0 ? (
          <div className="mt-4">
            <div className="mb-1 text-xs text-muted-foreground">子任务（{children.length}）</div>
            <div className="space-y-1">
              {children.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={c.status === "done"}
                    onChange={() =>
                      transition(
                        c.id,
                        c.status === "done" ? { type: "reopen" } : { type: "complete" },
                      ).catch((e) => toastError(e))
                    }
                  />
                  <span className={c.status === "done" ? "line-through text-muted-foreground" : ""}>
                    {c.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>备注</span>
            <span className="flex items-center gap-2">
              <button
                onClick={() => setPreviewNotes((v) => !v)}
                className="text-muted-foreground hover:text-foreground"
              >
                {previewNotes ? "编辑" : "预览"}
              </button>
              <button
                onClick={splitNotes}
                disabled={splitting || (!aiStatus?.enabled && splitCapture(task.notes).length === 0)}
                className="text-primary disabled:opacity-40"
              >
                {splitting ? "AI 拆分中…" : aiStatus?.enabled ? "🤖 AI 拆分" : "拆分备注为子任务"}
              </button>
            </span>
          </div>
          {previewNotes ? (
            <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-sm">
              <Markdown text={task.notes} />
            </div>
          ) : (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== task.notes && save({ notes })}
              rows={5}
              placeholder="补充说明…（每行一条，可拆分为子任务）"
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          )}
        </div>

        {task.history?.length ? (
          <div className="mt-6 border-t pt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              活动记录
            </div>
            <div className="space-y-1">
              {[...task.history].reverse().slice(0, 10).map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono text-[10px]">
                    {new Date(h.at).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {h.label}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 border-t pt-4">
          <button
            onClick={() => deleteTask(task.id).then(onClose)}
            className="text-xs text-destructive"
          >
            {task.phase === "trash" ? "永久删除" : "移入回收站"}
          </button>
        </div>
      </div>
    </div>
  );
}
