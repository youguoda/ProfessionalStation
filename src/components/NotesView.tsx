"use client";

import { useMemo, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { useStore } from "@/store/useStore";
import { formatRelativeDate } from "@/lib/parsing/dateFormat";
import { toastError, toastWithUndo } from "@/store/useToast";
import { Markdown } from "@/lib/markdown";
import { EmptyState, PageHeader } from "./TaskList";
import type { Note } from "@/lib/domain/types";

/**
 * 笔记 / 工作日志。
 * 不是任务：没有状态、没有优先级、没有截止日期。只有内容、时间和可搜索性。
 * 这是每天真的会做的事（记录报错、记录结论），也是最容易养成的打开习惯。
 */
export function NotesView() {
  const notes = useStore((s) => s.notes);
  const projects = useStore((s) => s.projects);
  const createNote = useStore((s) => s.createNote);
  const updateNote = useStore((s) => s.updateNote);
  const deleteNote = useStore((s) => s.deleteNote);

  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const list = [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!q) return list;
    const needle = q.toLowerCase();
    return list.filter((n) => n.content.toLowerCase().includes(needle));
  }, [notes, q]);

  const groups = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of filtered) {
      const day = n.createdAt.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(n);
    }
    return [...map.entries()];
  }, [filtered]);

  async function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await createNote(text);
      setDraft("");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove(note: Note) {
    try {
      await deleteNote(note.id);
      toastWithUndo({
        title: "已删除笔记",
        undo: () => {
          createNote(note.content, {
            tags: note.tags,
            projectId: note.projectId,
            taskId: note.taskId,
          }).catch((e) => toastError(e));
        },
      });
    } catch (e) {
      toastError(e);
    }
  }

  async function saveEdit(id: string) {
    try {
      await updateNote(id, { content: editText });
      setEditingId(null);
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div>
      <PageHeader title="笔记" subtitle="工作日志：报错、结论、想记住的东西。支持 Markdown">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索笔记…"
          className="w-48 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </PageHeader>

      <div className="mb-6 rounded-xl border bg-card p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={draft.split("\n").length > 3 ? Math.min(12, draft.split("\n").length) : 3}
          placeholder={"记点什么…\n例如：`vllm OOM` — PagedAttention 的 block_size 调到 16 后解决"}
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            <kbd className="rounded border px-1">Cmd/Ctrl</kbd> +{" "}
            <kbd className="rounded border px-1">Enter</kbd> 保存
          </span>
          <button
            onClick={submit}
            disabled={!draft.trim() || busy}
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
          >
            {busy ? "保存中…" : "记下来"}
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          text={q ? "没有匹配的笔记" : "还没有笔记"}
          hint={
            q
              ? "换个关键词试试。"
              : "任务系统管「要做什么」，笔记管「学到了什么」。两者都需要，但它们不是一回事。"
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([day, list]) => (
            <section key={day}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {formatRelativeDate(day)}
                <span className="ml-2 font-normal normal-case tracking-normal">{day}</span>
              </h3>
              <div className="space-y-2">
                {list.map((n) => {
                  const project = n.projectId
                    ? projects.find((p) => p.id === n.projectId)
                    : undefined;
                  return (
                    <div key={n.id} className="group rounded-lg border bg-card px-3 py-2.5">
                      {editingId === n.id ? (
                        <div>
                          <textarea
                            autoFocus
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={Math.max(3, editText.split("\n").length)}
                            className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => saveEdit(n.id)}
                              className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded-md border px-2.5 py-1 text-xs"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 text-sm">
                              <Markdown text={n.content} />
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                              <button
                                onClick={() => {
                                  setEditingId(n.id);
                                  setEditText(n.content);
                                }}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title="编辑"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => remove(n)}
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                title="删除"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="tabular-nums">
                              {new Date(n.createdAt).toLocaleTimeString("zh-CN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {project ? <span className="text-primary">#{project.name}</span> : null}
                            {n.projectId ? null : (
                              <button
                                onClick={() => {
                                  const first = projects.filter((p) => !p.archived)[0];
                                  if (first) {
                                    updateNote(n.id, { projectId: first.id }).catch((e) =>
                                      toastError(e),
                                    );
                                  }
                                }}
                                className="opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                              >
                                挂到项目
                              </button>
                            )}
                            {project ? (
                              <button
                                onClick={() =>
                                  updateNote(n.id, { projectId: null }).catch((e) => toastError(e))
                                }
                                className="opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                                title="取消关联"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
