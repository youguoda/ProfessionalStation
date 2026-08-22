"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Hand, Square, X } from "lucide-react";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/client/api";
import {
  selectImportantNotUrgent,
  selectReviewStats,
  selectSettlement,
  type SettlementItem,
} from "@/lib/engine/selectors";
import { toastError } from "@/store/useToast";
import { PageHeader } from "./TaskList";

const CHECKLIST = [
  "清空收件箱（逐条澄清）",
  "回顾项目清单，确保每个项目都有下一步行动",
  "回顾日历（过去与未来）",
  "确定下周重点",
];

/**
 * 周回顾 = 结算台。
 * 日常只管推进，每周强制结算一次——每一条悬着的东西都必须做一个决定，
 * 没有「稍后再说」这个选项，因为「稍后再说」正是它已经悬了 23 天的原因。
 */
export function WeeklyReviewView({ onSelect }: { onSelect: (id: string) => void }) {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const settings = useStore((s) => s.settings);
  const weeklyReviews = useStore((s) => s.weeklyReviews);
  const saveReview = useStore((s) => s.saveReview);
  const setScope = useStore((s) => s.setScope);

  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const loadedDraft = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api
      .reviewState()
      .then(({ draft }) => {
        if (!loadedDraft.current) {
          setChecks(draft.checklist ?? {});
          setNotes(draft.notes ?? "");
          loadedDraft.current = true;
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!loadedDraft.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.saveReviewDraft(checks, notes).catch((e) => toastError(e));
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [checks, notes]);

  const stats = useMemo(() => selectReviewStats(tasks, projects), [tasks, projects]);
  const settlement = useMemo(() => selectSettlement(tasks, settings), [tasks, settings]);
  const q2 = useMemo(() => selectImportantNotUrgent(tasks).slice(0, 5), [tasks]);

  async function submit() {
    try {
      await saveReview(notes, checks);
      setNotes("");
      setChecks({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div>
      <PageHeader
        title="周回顾"
        subtitle="日常只管推进，每周结算一次。进度自动保存。"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="本周完成" value={stats.completedThisWeek} tone="success" />
        <Stat label="本周取消" value={stats.canceledThisWeek} />
        <Stat label="本周新建" value={stats.createdThisWeek} />
        <Stat
          label="当前在制"
          value={stats.doing}
          suffix={`/${settings.maxDoing}`}
          tone={stats.doing > settings.maxDoing ? "danger" : undefined}
        />
      </div>

      {stats.createdThisWeek > stats.completedThisWeek + stats.canceledThisWeek ? (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          本周新建 {stats.createdThisWeek} 条，结掉 {stats.completedThisWeek + stats.canceledThisWeek} 条——
          进得比出得多。长期如此，系统会淤积。
        </div>
      ) : null}

      {/* 结算台：每条都必须选一个按钮 */}
      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold">
          需要你结算的
          {settlement.length > 0 ? (
            <span className="ml-2 rounded-full bg-destructive px-1.5 text-[11px] text-destructive-foreground">
              {settlement.length}
            </span>
          ) : null}
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          悬着的任务是系统腐烂的开始。每条选一个终局，不提供「稍后再说」。
        </p>
        {settlement.length === 0 ? (
          <div className="rounded-lg border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">
            没有停滞的条目 — 系统是干净的
          </div>
        ) : (
          <div className="space-y-2">
            {settlement.map((item) => (
              <SettlementRow key={item.task.id} item={item} onSelect={onSelect} />
            ))}
          </div>
        )}
      </section>

      {stats.projectsWithoutAction.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold">没有下一步行动的项目</h2>
          <div className="flex flex-wrap gap-2">
            {projects
              .filter((p) => !p.archived && stats.projectsWithoutAction.includes(p.name))
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => setScope(`project:${p.id}`)}
                  className="flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs text-warning"
                >
                  # {p.name}
                  <ArrowRight className="h-3 w-3" />
                </button>
              ))}
          </div>
        </section>
      ) : null}

      {/* 四象限降级为这里的一个提醒：它每周提醒一次就够了 */}
      {q2.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-semibold">重要但不紧急</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            最容易被紧急的事挤掉的一类。这周推进了吗？
          </p>
          <div className="space-y-1">
            {q2.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelect(t.id)}
                className="flex w-full items-center justify-between rounded-lg border bg-card px-3 py-2 text-left text-sm hover:border-primary/40"
              >
                <span className="truncate">{t.title}</span>
                <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">
                  P{t.priority}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">清单</h2>
        <div className="space-y-1.5">
          {CHECKLIST.map((step) => (
            <label
              key={step}
              className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
            >
              <input
                type="checkbox"
                checked={!!checks[step]}
                onChange={(e) => setChecks((c) => ({ ...c, [step]: e.target.checked }))}
              />
              <span className={`text-sm ${checks[step] ? "text-muted-foreground line-through" : ""}`}>
                {step}
              </span>
            </label>
          ))}
        </div>
      </section>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        placeholder="本周复盘与下周重点…"
        className="mb-3 w-full rounded-lg border bg-background px-3 py-2 text-sm"
      />

      <button
        onClick={submit}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        {saved ? "已保存 ✓" : "完成并保存周回顾"}
      </button>

      {weeklyReviews.length > 0 ? (
        <div className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            历史回顾
          </h2>
          <div className="space-y-2">
            {[...weeklyReviews].reverse().map((r) => (
              <div key={r.id} className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="text-xs text-muted-foreground">{r.date}</div>
                {r.notes ? <p className="mt-1 whitespace-pre-wrap text-sm">{r.notes}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const KIND_LABEL: Record<SettlementItem["kind"], string> = {
  doing: "进行中",
  waiting: "等待",
  inbox: "收件箱",
  someday: "将来/也许",
};

function SettlementRow({
  item,
  onSelect,
}: {
  item: SettlementItem;
  onSelect: (id: string) => void;
}) {
  const transition = useStore((s) => s.transition);
  const nudgeTask = useStore((s) => s.nudgeTask);
  const setScope = useStore((s) => s.setScope);
  const [canceling, setCanceling] = useState(false);
  const [reason, setReason] = useState("");

  const { task, kind, reason: why } = item;

  const run = (fn: () => Promise<unknown>) => fn().catch((e) => toastError(e));

  const btn = "rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-muted";

  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => onSelect(task.id)} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm">{task.title}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {KIND_LABEL[kind]} · {why}
          </div>
        </button>
      </div>

      {canceling ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                run(() => transition(task.id, { type: "cancel", reason }));
                setCanceling(false);
              }
              if (e.key === "Escape") setCanceling(false);
            }}
            placeholder="为什么不做了？（可留空，但写一句以后有用）"
            className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
          />
          <button
            onClick={() => {
              run(() => transition(task.id, { type: "cancel", reason }));
              setCanceling(false);
            }}
            className="rounded-md bg-destructive px-2.5 py-1 text-xs text-destructive-foreground"
          >
            确认取消
          </button>
          <button onClick={() => setCanceling(false)} className={btn}>
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {kind === "doing" ? (
            <>
              <button
                onClick={() => run(() => transition(task.id, { type: "complete" }))}
                className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground"
              >
                <Check className="h-3 w-3" />
                完成
              </button>
              <button
                onClick={() => run(() => transition(task.id, { type: "stop" }))}
                className={`flex items-center gap-1 ${btn}`}
              >
                <Square className="h-3 w-3" />
                放回待办
              </button>
            </>
          ) : null}

          {kind === "waiting" ? (
            <>
              <button
                onClick={() => run(() => transition(task.id, { type: "complete" }))}
                className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground"
              >
                <Check className="h-3 w-3" />
                已解决
              </button>
              <button
                onClick={() => run(async () => nudgeTask(task.id))}
                className={`flex items-center gap-1 ${btn}`}
              >
                <Hand className="h-3 w-3" />
                再戳一次
              </button>
            </>
          ) : null}

          {kind === "someday" ? (
            <button
              onClick={() => run(() => transition(task.id, { type: "clarify", target: "action" }))}
              className={`flex items-center gap-1 ${btn}`}
            >
              <ArrowRight className="h-3 w-3" />
              提到下一步
            </button>
          ) : null}

          {kind === "inbox" ? (
            <button onClick={() => setScope("inbox")} className={btn}>
              去澄清
            </button>
          ) : null}

          <button
            onClick={() => setCanceling(true)}
            className="rounded-md border border-destructive/30 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
          >
            取消不做了
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "success" | "danger";
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-3 ${
        tone === "danger" ? "border-destructive/30 bg-destructive/10" : "bg-card"
      }`}
    >
      <div
        className={`text-2xl font-semibold tabular-nums ${
          tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : ""
        }`}
      >
        {value}
        {suffix ? <span className="text-sm text-muted-foreground">{suffix}</span> : null}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
