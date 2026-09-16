"use client";

import { useState } from "react";
import { Bot, Plus, Send, Sparkles, X } from "lucide-react";
import { api } from "@/lib/client/api";
import type { Task } from "@/lib/domain/types";

interface Turn {
  role: "assistant" | "user";
  content: string;
}

/**
 * 任务拆分台。
 *
 * 旧的「AI 拆分」是一按就拆、拆完直接落库——盲拆出来的子任务通常只是
 * 把主标题换了个说法，而且你连改的机会都没有。
 *
 * 这里把它拆成三步：
 *   1. 先交流：补背景，马力信息不够会反问一句
 *   2. 出草稿：拆出来的是**草稿**，不是既成事实
 *   3. 逐条改：改完、删掉、加几条，确认了才创建
 */
export function BreakdownPanel({
  task,
  onCreate,
  onClose,
}: {
  task: Task;
  onCreate: (titles: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [drafts, setDrafts] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  /** 带上目前为止的对话去要一次拆分结果：可能是反问，也可能是清单 */
  async function ask(extra?: string) {
    if (busy) return;
    const nextTurns = extra?.trim()
      ? [...turns, { role: "user" as const, content: extra.trim() }]
      : turns;
    setTurns(nextTurns);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await api.aiBreakdown(task.title, task.notes, nextTurns);
      if (res.titles.length > 0) {
        setDrafts(res.titles);
      } else if (res.question) {
        setTurns([...nextTurns, { role: "assistant", content: res.question }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "拆分失败");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const titles = (drafts ?? []).map((t) => t.trim()).filter(Boolean);
    if (titles.length === 0) return;
    setCreating(true);
    try {
      await onCreate(titles);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
      setCreating(false);
    }
  }

  const validDrafts = (drafts ?? []).filter((t) => t.trim()).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">拆分任务</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{task.title}</div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {drafts === null ? (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                先说说这个任务的背景、约束、你希望往哪个方向拆。说得越具体，拆出来越能直接做。
              </p>

              {turns.map((t, i) => (
                <div
                  key={i}
                  className={`mb-2 rounded-lg px-3 py-2 text-sm ${
                    t.role === "assistant"
                      ? "border border-primary/20 bg-primary/5"
                      : "bg-muted/50"
                  }`}
                >
                  <div className="mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    {t.role === "assistant" ? (
                      <>
                        <Bot className="h-3 w-3" />
                        马力
                      </>
                    ) : (
                      "我"
                    )}
                  </div>
                  {t.content}
                </div>
              ))}

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                rows={3}
                autoFocus
                placeholder={
                  turns.length > 0
                    ? "回答马力的问题…（Cmd/Ctrl+Enter 发送）"
                    : "补充背景，比如：这是给内网环境做的，不能联外网…（可留空直接拆）"
                }
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </>
          ) : (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                这是草稿,还没落库。改到你满意再创建——删掉不要的,补上漏掉的。
              </p>
              <div className="space-y-1.5">
                {drafts.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <input
                      value={d}
                      onChange={(e) =>
                        setDrafts((prev) =>
                          (prev ?? []).map((x, j) => (j === i ? e.target.value : x)),
                        )
                      }
                      className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                    />
                    <button
                      onClick={() =>
                        setDrafts((prev) => (prev ?? []).filter((_, j) => j !== i))
                      }
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`删除第 ${i + 1} 条`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setDrafts((prev) => [...(prev ?? []), ""])}
                className="mt-2 flex items-center gap-1 text-xs text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                加一条
              </button>
            </>
          )}

          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          {drafts === null ? (
            <>
              <span className="text-[11px] text-muted-foreground">
                {busy ? "马力在想…" : turns.length > 0 ? "答完再拆会准得多" : ""}
              </span>
              <div className="flex gap-2">
                {turns.length > 0 || input.trim() ? (
                  <button
                    onClick={() => ask(input)}
                    disabled={busy}
                    className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" />
                    发送
                  </button>
                ) : null}
                <button
                  onClick={() => ask(input)}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3" />
                  {busy ? "拆分中…" : "让马力拆"}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setDrafts(null);
                  setError(null);
                }}
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                重新拆
              </button>
              <button
                onClick={create}
                disabled={creating || validDrafts === 0}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
              >
                {creating ? "创建中…" : `创建 ${validDrafts} 个子任务`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
