"use client";

import { useMemo } from "react";
import { Archive } from "lucide-react";
import { useStore } from "@/store/useStore";
import { blockedIdSet, tasksForScope } from "@/lib/engine/selectors";
import { useTaskMeta } from "@/lib/client/useTaskMeta";
import { toastError } from "@/store/useToast";
import { TaskList, PageHeader } from "./TaskList";

function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-14 w-14">
      <svg viewBox="0 0 44 44" className="h-14 w-14 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className="stroke-primary"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold">
        {pct}%
      </span>
    </div>
  );
}

export function ProjectDetailView({
  projectId,
  onSelect,
}: {
  projectId: string;
  onSelect: (id: string) => void;
}) {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const updateProject = useStore((s) => s.updateProject);
  const setScope = useStore((s) => s.setScope);
  const meta = useTaskMeta();
  const blockedIds = useMemo(() => blockedIdSet(tasks), [tasks]);

  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">项目不存在或已删除</div>
    );
  }

  const open = tasksForScope(`project:${project.id}`, tasks);
  const doneCount = tasks.filter(
    (t) => t.projectId === project.id && (t.status === "done" || t.status === "canceled"),
  ).length;
  const total = open.length + doneCount;

  return (
    <div>
      <PageHeader title={`# ${project.name}`} subtitle="项目详情">
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              updateProject(project.id, { archived: true })
                .then(() => setScope("para"))
                .catch((e) => toastError(e))
            }
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Archive className="h-3.5 w-3.5" />
            归档
          </button>
        </div>
      </PageHeader>

      <div className="mb-6 grid grid-cols-[auto_1fr_auto] items-start gap-4 rounded-xl border bg-card p-4">
        <ProgressRing done={doneCount} total={total} />
        <div className="space-y-2">
          <input
            defaultValue={project.name}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== project.name) {
                updateProject(project.id, { name }).catch((err) => toastError(err));
              }
            }}
            className="w-full rounded-md border bg-background px-2 py-1 text-base font-medium"
          />
          <input
            defaultValue={project.goal ?? ""}
            onBlur={(e) => {
              updateProject(project.id, { goal: e.target.value || null }).catch((err) =>
                toastError(err),
              );
            }}
            placeholder="项目目标（如：6 月底上线 V1）"
            className="w-full rounded-md border bg-background px-2 py-1 text-sm text-muted-foreground"
          />
        </div>
        <label className="text-xs text-muted-foreground">
          截止
          <input
            type="date"
            defaultValue={project.deadline ?? ""}
            onChange={(e) => {
              updateProject(project.id, { deadline: e.target.value || null }).catch((err) =>
                toastError(err),
              );
            }}
            className="mt-1 block rounded-md border bg-background px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <TaskList
        title="进行中"
        tasks={open}
        onSelect={onSelect}
        emptyText="这个项目没有待办任务"
      />
      {blockedIds.size > 0 ? null : null}
    </div>
  );
}
