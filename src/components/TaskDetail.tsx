"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Hand, NotebookPen, Play, Square, X } from "lucide-react";
import { useStore } from "@/store/useStore";
import { EFFORT_OPTIONS, PHASE_LABELS, STATUS_LABELS } from "@/lib/domain/constants";
import { REPEAT_OPTIONS } from "@/lib/domain/repeat";
import { daysSince, isBlocked, isoDay, waitingSince } from "@/lib/engine/selectors";
import { splitCapture } from "@/lib/parsing/capture";
import { formatRelativeDate } from "@/lib/parsing/dateFormat";
import type { Priority } from "@/lib/domain/types";
import { api } from "@/lib/client/api";
import { usePomodoro } from "@/store/usePomodoro";
import { toastError, toastWithUndo } from "@/store/useToast";
import { Markdown } from "@/lib/markdown";
import { SearchSelect } from "./SearchSelect";

export function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const task = tasks.find((t) => t.id === id);
  const updateTask = useStore((s) => s.updateTask);
  const transition = useStore((s) => s.transition);
  const deleteTask = useStore((s) => s.deleteTask);
  const addTask = useStore((s) => s.addTask);
  const planTask = useStore((s) => s.planTask);
  const nudgeTask = useStore((s) => s.nudgeTask);
  const taskToNote = useStore((s) => s.taskToNote);
  const projects = useStore((s) => s.projects);
  const areas = useStore((s) => s.areas);
  const tags = useStore((s) => s.tags);
  const createTag = useStore((s) => s.createTag);
  const aiStatus = useStore((s) => s.aiStatus);
  const agentOpen = useStore((s) => s.agentOpen);

  const pomodoroStatus = usePomodoro((s) => s.status);
  const focusTaskId = usePomodoro((s) => s.focusTaskId);
  const pomodoroStart = usePomodoro((s) => s.start);
  const pomodoroPause = usePomodoro((s) => s.pause);

  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [tagInput, setTagInput] = useState("");
  const [depError, setDepError] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [previewNotes, setPreviewNotes] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
  }, [task?.id, task?.title, task?.notes]);

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

  const today = isoDay(new Date());
  const tomorrow = isoDay(new Date(Date.now() + 86400000));
  const done = task.status === "done" || task.status === "canceled";
  const isAction = task.phase === "action";

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
          phase: isAction ? "action" : "inbox",
          priority: task.priority,
          projectId: task.projectId,
          areaId: task.areaId,
          parentId: task.id,
        }),
      ),
    ).catch((e) => toastError(e));
  };

  const addTag = async (value: string) => {
    const name = value.trim();
    if (!name) return;
    try {
      const tag = await createTag(name);
      if (!task.tags.includes(tag.id)) save({ tags: [...task.tags, tag.id] });
      setTagInput("");
    } catch (e) {
      toastError(e);
    }
  };

  const convertToNote = async () => {
    try {
      await taskToNote(task.id);
      toastWithUndo({
        title: "已转存为笔记",
        desc: "任务已移入回收站，可恢复",
        undo: () => {
          transition(task.id, { type: "restore" }).catch((e) => toastError(e));
        },
      });
      onClose();
    } catch (e) {
      toastError(e);
    }
  };

  const projectOptions = projects.filter((p) => !p.archived);
  const areaOptions = areas.filter((a) => !a.archived);
  const tagChips = task.tags.map((tid) => tags.find((t) => t.id === tid)).filter(Boolean);
  const children = tasks.filter((t) => t.parentId === task.id);

  const planButton = (label: string, day: string | null) => (
    <button
      key={label}
      onClick={() => planTask(task.id, day).catch((e) => toastError(e))}
      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
        task.plannedFor === day
          ? "border-primary bg-primary/10 text-primary"
          : "hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`absolute top-0 h-full w-[26rem] overflow-y-auto border-l bg-background p-5 shadow-xl ${
          agentOpen ? "right-[26rem]" : "right-0"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {PHASE_LABELS[task.phase]} · {STATUS_LABELS[task.status]}
            {task.status === "doing" ? ` · 已进行 ${daysSince(task.startedAt)} 天` : ""}
            {task.phase === "waiting" && !done
              ? ` · 已等 ${daysSince(waitingSince(task))} 天`
              : ""}
          </span>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== task.title && save({ title })}
          className="mb-3 w-full rounded-md border bg-background px-3 py-2 text-lg font-medium focus:outline-none focus:ring-1 focus:ring-primary/40"
        />

        {task.canceledReason ? (
          <div className="mb-3 rounded-md border border-muted bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
            已取消：{task.canceledReason}
          </div>
        ) : null}

        {/* 主操作：一个任务在任意时刻只有两三个合理的下一步 */}
        <div className="mb-4 flex flex-wrap gap-2">
          {isAction && task.status === "todo" ? (
            <button
              onClick={() => transition(task.id, { type: "start" }).catch((e) => toastError(e))}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
            >
              <Play className="h-3 w-3" />
              开始
            </button>
          ) : null}
          {task.status === "doing" ? (
            <>
              <button
                onClick={() => transition(task.id, { type: "complete" }).catch((e) => toastError(e))}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
              >
                完成
              </button>
              <button
                onClick={() => transition(task.id, { type: "stop" }).catch((e) => toastError(e))}
                className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs"
              >
                <Square className="h-3 w-3" />
                放回待办
              </button>
            </>
          ) : null}
          {task.phase === "waiting" && !done ? (
            <>
              <button
                onClick={() => transition(task.id, { type: "complete" }).catch((e) => toastError(e))}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
              >
                已解决
              </button>
              <button
                onClick={() => nudgeTask(task.id).catch((e) => toastError(e))}
                className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs"
              >
                <Hand className="h-3 w-3" />
                戳一下
              </button>
            </>
          ) : null}
          {task.phase === "inbox" ? (
            <>
              {(["action", "waiting", "someday"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    transition(task.id, { type: "clarify", target: t }).catch((e) => toastError(e))
                  }
                  className="rounded-md border px-3 py-1.5 text-xs"
                >
                  {t === "action" ? "现在要做" : t === "waiting" ? "等别人" : "以后再说"}
                </button>
              ))}
            </>
          ) : null}
          {task.phase === "someday" ? (
            <button
              onClick={() =>
                transition(task.id, { type: "clarify", target: "action" }).catch((e) =>
                  toastError(e),
                )
              }
              className="rounded-md border px-3 py-1.5 text-xs"
            >
              提到下一步
            </button>
          ) : null}
          {!done && task.phase !== "trash" ? (
            <button
              onClick={() => {
                if (focusTaskId === task.id && pomodoroStatus === "running") pomodoroPause();
                else pomodoroStart(task.id);
              }}
              className="rounded-md border px-3 py-1.5 text-xs"
              title="开启一个 25 分钟专注番茄钟"
            >
              {focusTaskId === task.id && pomodoroStatus === "running" ? "🍅 专注中…" : "🍅 专注"}
            </button>
          ) : null}
          {task.phase === "trash" ? (
            <button
              onClick={() => transition(task.id, { type: "restore" }).catch((e) => toastError(e))}
              className="rounded-md border px-3 py-1.5 text-xs"
            >
              恢复
            </button>
          ) : null}
        </div>

        {/* 计划：承诺日 ≠ 截止日 */}
        {isAction && !done ? (
          <div className="mb-4 rounded-lg border bg-card p-3">
            <div className="mb-1.5 text-xs font-medium">我打算什么时候做</div>
            <div className="mb-3 flex flex-wrap gap-2">
              {planButton("今天", today)}
              {planButton("明天", tomorrow)}
              {planButton("不急", null)}
              {task.plannedFor && task.plannedFor !== today && task.plannedFor !== tomorrow ? (
                <span className="rounded-md border border-primary bg-primary/10 px-2.5 py-1 text-xs text-primary">
                  {formatRelativeDate(task.plannedFor)}
                </span>
              ) : null}
            </div>
            <label className="block text-xs text-muted-foreground">
              截止日期（世界的要求，不是我的承诺）
              <input
                type="date"
                value={task.dueDate ?? ""}
                onChange={(e) => save({ dueDate: e.target.value || null })}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
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

          {task.phase === "waiting" ? (
            <label className="col-span-2 text-xs text-muted-foreground">
              等待谁/什么
              <input
                value={task.waitingFor ?? ""}
                onChange={(e) => save({ waitingFor: e.target.value || null })}
                placeholder="如：等客户回复"
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </label>
          ) : null}
        </div>

        {/* 高级：默认隐藏。每个字段都在收认知税，95% 的任务不配收。 */}
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-4 flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {showAdvanced ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          高级
        </button>

        {showAdvanced ? (
          <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3">
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
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>

            <label className="col-span-2 text-xs text-muted-foreground">
              固定时刻（只给真的必须在那一刻发生的事，如会议）
              <input
                type="datetime-local"
                value={task.scheduledAt ? task.scheduledAt.slice(0, 16) : ""}
                onChange={(e) =>
                  save({ scheduledAt: e.target.value ? `${e.target.value}:00` : null })
                }
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </label>

            <label className="col-span-2 text-xs text-muted-foreground">
              重复
              <select
                value={task.repeatRule ?? ""}
                onChange={(e) => save({ repeatRule: e.target.value || null })}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">不重复</option>
                {REPEAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="col-span-2">
              <div className="mb-1 text-xs text-muted-foreground">标签</div>
              <div className="mb-2 flex flex-wrap gap-1">
                {tagChips.map((t) => (
                  <span
                    key={t!.id}
                    className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"
                  >
                    {t!.name}
                    <button
                      onClick={() => save({ tags: task.tags.filter((x) => x !== t!.id) })}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !e.nativeEvent.isComposing && addTag(tagInput)
                }
                placeholder="输入标签，回车添加"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </div>

            <div className="col-span-2">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>依赖（先完成才能开始）</span>
                {isBlocked(task, tasks) ? <span className="text-warning">被阻塞</span> : null}
              </div>
              <div className="mb-2 flex flex-wrap gap-1">
                {task.blockedBy.map((did) => {
                  const dep = tasks.find((t) => t.id === did);
                  return (
                    <span
                      key={did}
                      className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"
                    >
                      {dep ? dep.title : "已删除"}
                      <button
                        onClick={() => save({ blockedBy: task.blockedBy.filter((x) => x !== did) })}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
                {task.blockedBy.length === 0 ? (
                  <span className="text-xs text-muted-foreground">无</span>
                ) : null}
              </div>
              {depError ? <p className="mb-1 text-xs text-destructive">{depError}</p> : null}
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
          </div>
        ) : null}

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
                  <span className={c.status === "done" ? "text-muted-foreground line-through" : ""}>
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
                {splitting ? "AI 拆分中…" : aiStatus?.enabled ? "AI 拆分" : "拆分为子任务"}
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
              {[...task.history]
                .reverse()
                .slice(0, 10)
                .map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono text-[10px] tabular-nums">
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

        {/* 四种终局，只有一种是「完成」 */}
        <div className="mt-6 space-y-2 border-t pt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            结束这条任务
          </div>
          {canceling ? (
            <div className="space-y-2">
              <input
                autoFocus
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    transition(task.id, { type: "cancel", reason: cancelReason }).catch((err) =>
                      toastError(err),
                    );
                    setCanceling(false);
                  }
                  if (e.key === "Escape") setCanceling(false);
                }}
                placeholder="为什么不做了？"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    transition(task.id, { type: "cancel", reason: cancelReason }).catch((err) =>
                      toastError(err),
                    );
                    setCanceling(false);
                  }}
                  className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground"
                >
                  确认取消
                </button>
                <button
                  onClick={() => setCanceling(false)}
                  className="rounded-md border px-3 py-1.5 text-xs"
                >
                  返回
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {!done ? (
                <button
                  onClick={() => setCanceling(true)}
                  className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  取消（决定不做了）
                </button>
              ) : null}
              {task.phase !== "trash" ? (
                <button
                  onClick={convertToNote}
                  className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs"
                  title="内容留存到笔记，任务移入回收站"
                >
                  <NotebookPen className="h-3 w-3" />
                  转存为笔记
                </button>
              ) : null}
              <button
                onClick={() => deleteTask(task.id).then(onClose).catch((e) => toastError(e))}
                className="rounded-md border px-3 py-1.5 text-xs text-destructive"
              >
                {task.phase === "trash" ? "永久删除" : "移入回收站"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
