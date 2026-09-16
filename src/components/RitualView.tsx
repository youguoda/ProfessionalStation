"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Plus, Search, X } from "lucide-react";
import { useStore } from "@/store/useStore";
import { isoDay, selectNextActions, selectOverdue } from "@/lib/engine/selectors";
import { formatRelativeDate } from "@/lib/parsing/dateFormat";
import { toastError } from "@/store/useToast";
import type { Task } from "@/lib/domain/types";

/**
 * 今日开机仪式。
 *
 * Ivy Lee Method 的药效全在「事前挑」这一个动作上：前一天晚上（或当天开工前）
 * 写下今天要做的 N 件事，然后按顺序做。事后把做过的事补记成「今天」，
 * 是一份流水账，不是一份承诺——药效正好被摘干净。
 *
 * 所以这一屏挡在主界面前面，每天一次：左边是库存，右边是空槽，挑完才进去。
 * 但它不是牢笼——「今天什么都不挑」永远可点，只是要你**明确地**选择不挑。
 */
export function RitualView() {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const settings = useStore((s) => s.settings);
  const planTask = useStore((s) => s.planTask);
  const finishRitual = useStore((s) => s.finishRitual);
  const setScope = useStore((s) => s.setScope);

  const today = isoDay(new Date());
  const max = settings.maxToday;

  // 已经承诺过今天的（比如昨天排的、或刚从详情页放进来的）先占住槽位
  const preplanned = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.plannedFor === today &&
          t.phase === "action" &&
          t.status !== "done" &&
          t.status !== "canceled",
      ),
    [tasks, today],
  );

  const [picked, setPicked] = useState<string[]>(() => preplanned.map((t) => t.id));
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const overdue = useMemo(() => selectOverdue(tasks), [tasks]);

  const candidates = useMemo(() => {
    const pickedSet = new Set(picked);
    const needle = q.trim().toLowerCase();
    return selectNextActions(tasks)
      .filter((t) => !pickedSet.has(t.id))
      .filter((t) => !needle || t.title.toLowerCase().includes(needle));
  }, [tasks, picked, q]);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const projectName = (t: Task) =>
    t.projectId ? projects.find((p) => p.id === t.projectId)?.name ?? null : null;

  const over = picked.length > max;

  function add(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function remove(id: string) {
    setPicked((prev) => prev.filter((x) => x !== id));
  }

  /** 落盘：挑中的写承诺日，取消掉的从今天移走，然后记下今天已做过仪式 */
  async function commit() {
    setSaving(true);
    try {
      const pickedSet = new Set(picked);
      const dropped = preplanned.filter((t) => !pickedSet.has(t.id));
      const added = picked.filter((id) => byId.get(id)?.plannedFor !== today);

      for (const t of dropped) await planTask(t.id, null);
      for (const id of added) await planTask(id, today);

      await finishRitual();
      setScope("today");
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    setSaving(true);
    try {
      await finishRitual();
      setScope("today");
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  }

  const dateLabel = new Date().toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8">
        <header className="mb-6">
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            今天做哪 {max} 件？
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            先挑，再做。挑出来的是承诺，做完才补记的那叫流水账。
          </p>
        </header>

        {overdue.length > 0 ? (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {overdue.length} 条已逾期,会自动置顶显示,不占今天的额度。
              历史欠账要还,但别让它决定你今天做什么。
            </span>
          </div>
        ) : null}

        <div className="grid flex-1 gap-5 md:grid-cols-2">
          {/* 左：库存 */}
          <section className="flex min-h-0 flex-col rounded-xl border bg-card">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`搜索「下一步」…（共 ${candidates.length} 条）`}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-[52vh] flex-1 overflow-y-auto p-1.5">
              {candidates.length === 0 ? (
                <p className="px-3 py-10 text-center text-xs text-muted-foreground">
                  {q
                    ? "没有匹配的任务"
                    : "「下一步」是空的——没有存货，今天就直接开工吧。"}
                </p>
              ) : (
                candidates.map((t) => {
                  const proj = projectName(t);
                  return (
                    <button
                      key={t.id}
                      onClick={() => add(t.id)}
                      className="group flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="min-w-0 truncate">{t.title}</span>
                      <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                        {proj ? <span className="text-primary">#{proj}</span> : null}
                        {t.dueDate ? <span>{formatRelativeDate(t.dueDate)}</span> : null}
                        <Plus className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* 右：今天的槽位 */}
          <section className="flex min-h-0 flex-col rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-medium">今天</span>
              <span
                className={`text-xs tabular-nums ${over ? "text-warning" : "text-muted-foreground"}`}
              >
                {picked.length} / {max}
              </span>
            </div>
            <div className="max-h-[52vh] flex-1 space-y-1.5 overflow-y-auto p-3">
              {Array.from({ length: Math.max(max, picked.length) }, (_, i) => {
                const id = picked[i];
                const t = id ? byId.get(id) : undefined;
                if (!t) {
                  return (
                    <div
                      key={`empty-${i}`}
                      className="flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground"
                    >
                      <span className="w-4 shrink-0 text-center text-xs tabular-nums opacity-50">
                        {i + 1}
                      </span>
                      <span className="text-xs">从左边挑一条</span>
                    </div>
                  );
                }
                const proj = projectName(t);
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
                      i >= max ? "border-warning/50 bg-warning/5" : "bg-background"
                    }`}
                  >
                    <span className="w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    {proj ? (
                      <span className="shrink-0 text-[11px] text-primary">#{proj}</span>
                    ) : null}
                    <button
                      onClick={() => remove(t.id)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label={`从今天移除「${t.title}」`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            {over ? (
              <p className="border-t px-3 py-2 text-xs text-warning">
                挑了 {picked.length} 条,超过你给自己定的 {max} 条。不拦你,但别骗自己。
              </p>
            ) : null}
          </section>
        </div>

        <footer className="mt-6 flex items-center justify-between gap-4">
          <button
            onClick={skip}
            disabled={saving}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
          >
            今天什么都不挑
          </button>
          <button
            onClick={commit}
            disabled={saving || picked.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving
              ? "保存中…"
              : picked.length === 0
                ? "先挑至少一条"
                : `开始今天（${picked.length} 件）`}
            {!saving && picked.length > 0 ? <ArrowRight className="h-4 w-4" /> : null}
          </button>
        </footer>
      </div>
    </div>
  );
}
