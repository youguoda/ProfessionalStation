"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { selectReviewStats } from "@/lib/engine/selectors";

const CHECKLIST = [
  "清空收件箱（逐条澄清）",
  "回顾项目清单，确保每个项目都有下一步行动",
  "回顾日历（过去与未来）",
  "回顾「等待」清单",
  "回顾「将来/也许」",
  "整理参考资料",
  "确定下周重点",
];

export function WeeklyReviewView() {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const weeklyReviews = useStore((s) => s.weeklyReviews);
  const saveReview = useStore((s) => s.saveReview);

  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);

  const stats = selectReviewStats(tasks, projects);

  async function submit() {
    await saveReview(notes, checks);
    setNotes("");
    setChecks({});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">周回顾</h1>
      <p className="mb-5 text-xs text-muted-foreground">
        定期反思是 GTD / Scrum / Kaizen 的共同核心，让系统保持可信。
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="收件箱滞留>7天" value={stats.inboxStale} warn={stats.inboxStale > 0} />
        <Stat label="超期任务" value={stats.overdue} warn={stats.overdue > 0} />
        <Stat label="等待项" value={stats.waitingCount} />
        <Stat label="任务总数" value={stats.total} />
      </div>

      {stats.projectsWithoutAction.length > 0 ? (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          以下项目没有下一步行动：{stats.projectsWithoutAction.join("、")}
        </div>
      ) : null}

      <div className="mb-5 space-y-1.5">
        {CHECKLIST.map((step) => (
          <label key={step} className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5">
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

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        placeholder="本周复盘与下周计划…"
        className="mb-3 w-full rounded-lg border bg-background px-3 py-2 text-sm"
      />

      <button
        onClick={submit}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        {saved ? "已保存 ✓" : "保存周回顾"}
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
                {r.notes ? <p className="mt-1 text-sm">{r.notes}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-3 ${warn ? "border-red-200 bg-red-50" : "bg-background"}`}>
      <div className={`text-2xl font-semibold ${warn ? "text-red-600" : ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
