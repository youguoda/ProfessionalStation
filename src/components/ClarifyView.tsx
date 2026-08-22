"use client";

import { useEffect, useState } from "react";
import { PartyPopper, Undo2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { isoDay, selectInbox } from "@/lib/engine/selectors";
import { CLARIFY_CHOICES, clarifyChoiceFromKey, type ClarifyChoice } from "@/lib/engine/clarifyDrop";
import { formatRelativeDate } from "@/lib/parsing/dateFormat";
import { toastError } from "@/store/useToast";
import { PageHeader } from "./TaskList";
import { SearchSelect } from "./SearchSelect";

/**
 * 澄清流：一次一条，纯键盘。
 * 收件箱是唯一需要「做决定」的地方，所以把决定做成一屏一个，而不是一行一个下拉。
 */
export function ClarifyView({ onSelect }: { onSelect: (id: string) => void }) {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const transition = useStore((s) => s.transition);
  const updateTask = useStore((s) => s.updateTask);
  const planTask = useStore((s) => s.planTask);
  const taskToNote = useStore((s) => s.taskToNote);
  const setScope = useStore((s) => s.setScope);

  const inbox = selectInbox(tasks);
  const current = inbox[0];
  // 澄清成「现在要做」后的可选追问（挂项目 / 什么时候做）
  const [followUpId, setFollowUpId] = useState<string | null>(null);
  const followUp = followUpId ? tasks.find((t) => t.id === followUpId) : undefined;
  const [busy, setBusy] = useState(false);

  async function choose(choice: ClarifyChoice) {
    if (!current || busy) return;
    setBusy(true);
    try {
      if (choice === "note") {
        await taskToNote(current.id);
      } else if (choice === "trash") {
        await transition(current.id, { type: "trash" });
      } else {
        await transition(current.id, { type: "clarify", target: choice });
        if (choice === "action") setFollowUpId(current.id);
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (followUpId) {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          setFollowUpId(null);
        }
        return;
      }
      const choice = clarifyChoiceFromKey(e.key);
      if (choice) {
        e.preventDefault();
        void choose(choice);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!current && !followUp) {
    return (
      <div>
        <PageHeader title="收件箱" subtitle="捕获的念头在这里澄清" />
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <PartyPopper className="mb-3 h-8 w-8 text-primary" />
          <p className="text-base font-medium">收件箱已清空</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            这是这套系统里唯一值得庆祝的两个状态之一（另一个是完成任务）。
            <br />
            按 <kbd className="rounded border px-1">Q</kbd> 随时捕获新的念头。
          </p>
          <button
            onClick={() => setScope("today")}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            去「今天」
          </button>
        </div>
      </div>
    );
  }

  // 追问步骤：只在澄清为「现在要做」之后出现，可以直接回车跳过
  if (followUp) {
    const today = isoDay(new Date());
    const tomorrow = isoDay(new Date(Date.now() + 86400000));
    return (
      <div>
        <PageHeader title="收件箱" subtitle={`还剩 ${inbox.length} 条`} />
        <div className="rounded-xl border bg-card p-6">
          <div className="mb-1 text-xs text-muted-foreground">已放入「下一步」</div>
          <div className="mb-5 text-lg font-medium">{followUp.title}</div>

          <div className="mb-4">
            <div className="mb-1.5 text-xs text-muted-foreground">什么时候做？（可选）</div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "今天", day: today },
                { label: "明天", day: tomorrow },
              ].map((o) => (
                <button
                  key={o.day}
                  onClick={() => planTask(followUp.id, o.day).catch((e) => toastError(e))}
                  className={`rounded-md border px-3 py-1.5 text-xs ${
                    followUp.plannedFor === o.day
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {o.label}
                </button>
              ))}
              <button
                onClick={() => planTask(followUp.id, null).catch((e) => toastError(e))}
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  followUp.plannedFor === null
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-muted"
                }`}
              >
                不急，先放库存
              </button>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">
              挂到项目（可选）
              <SearchSelect
                value={followUp.projectId}
                options={projects
                  .filter((p) => !p.archived)
                  .map((p) => ({ value: p.id, label: p.name }))}
                onSelect={(v) =>
                  updateTask(followUp.id, { projectId: v }).catch((e) => toastError(e))
                }
                placeholder="无项目"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              截止日期（可选）
              <input
                type="date"
                value={followUp.dueDate ?? ""}
                onChange={(e) =>
                  updateTask(followUp.id, { dueDate: e.target.value || null }).catch((err) =>
                    toastError(err),
                  )
                }
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setFollowUpId(null)}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              下一条
            </button>
            <span className="text-xs text-muted-foreground">
              或按 <kbd className="rounded border px-1">Enter</kbd> 继续
            </span>
            <button
              onClick={() => {
                onSelect(followUp.id);
                setFollowUpId(null);
              }}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              打开详情
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="收件箱" subtitle={`还剩 ${inbox.length} 条 · 一次处理一条`}>
        <button
          onClick={() => onSelect(current!.id)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          打开详情
        </button>
      </PageHeader>

      <div className="rounded-xl border bg-card px-6 py-10">
        <div className="mb-8 text-center">
          <div className="text-xl font-medium leading-snug">{current!.title}</div>
          {current!.notes ? (
            <p className="mx-auto mt-2 max-w-lg whitespace-pre-wrap text-xs text-muted-foreground">
              {current!.notes}
            </p>
          ) : null}
          <p className="mt-3 text-[11px] text-muted-foreground">
            捕获于 {formatRelativeDate(current!.createdAt.slice(0, 10))}
          </p>
        </div>

        <div className="mb-3 text-center text-xs text-muted-foreground">这是什么？</div>
        <div className="mx-auto grid max-w-lg grid-cols-2 gap-2 sm:grid-cols-3">
          {CLARIFY_CHOICES.map((c) => (
            <button
              key={c.choice}
              onClick={() => choose(c.choice)}
              disabled={busy}
              title={c.hint}
              className="flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-sm transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border px-1 text-[10px] text-muted-foreground">{c.key}</kbd>
                {c.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{c.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {inbox.length > 1 ? (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Undo2 className="h-3 w-3" />
          按数字键快速澄清；选错了用 <kbd className="rounded border px-1">Cmd/Ctrl+Z</kbd> 撤销
        </p>
      ) : null}
    </div>
  );
}
