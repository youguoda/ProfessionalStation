"use client";

import { useStore } from "@/store/useStore";
import { TaskItem } from "./TaskItem";
import type { Task } from "@/lib/domain/types";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
      {text}
    </p>
  );
}

export function ParaView({ onSelect }: { onSelect: (id: string) => void }) {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const areas = useStore((s) => s.areas);
  const tags = useStore((s) => s.tags);

  const activeProjects = projects.filter((p) => !p.archived);
  const archivedProjects = projects.filter((p) => p.archived);
  const activeAreas = areas.filter((a) => !a.archived);
  const referenceTasks = tasks.filter((t) => t.phase === "reference");
  const doneTasks = tasks.filter((t) => t.status === "done" || t.status === "canceled");

  const openTasksFor = (pid: string) =>
    tasks.filter(
      (t) => t.projectId === pid && t.phase !== "trash" && t.status !== "done" && t.status !== "canceled",
    );
  const areaTasksFor = (aid: string) =>
    tasks.filter(
      (t) => t.areaId === aid && t.phase !== "trash" && t.status !== "done" && t.status !== "canceled",
    );

  const resourceGroups = new Map<string, Task[]>();
  for (const t of referenceTasks) {
    const tagId = t.tags[0];
    const name = tagId ? tags.find((g) => g.id === tagId)?.name ?? "未分类" : "未分类";
    if (!resourceGroups.has(name)) resourceGroups.set(name, []);
    resourceGroups.get(name)!.push(t);
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">PARA</h1>
      <p className="mb-5 text-xs text-muted-foreground">
        项目（有截止）· 领域（长期责任）· 资源（参考）· 归档
      </p>

      <Section title="📁 项目 Projects" hint={activeProjects.length ? `${activeProjects.length} 个` : ""}>
        {activeProjects.length === 0 ? (
          <Empty text="暂无项目，在左侧边栏「＋项目」添加" />
        ) : (
          <div className="space-y-4">
            {activeProjects.map((p) => {
              const list = openTasksFor(p.id);
              return (
                <div key={p.id} className="rounded-xl border bg-background p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium"># {p.name}</span>
                    <span className="text-xs text-muted-foreground">{list.length} 项进行中</span>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground">没有待办</p>
                  ) : (
                    <div className="space-y-1.5">
                      {list.map((t) => (
                        <TaskItem key={t.id} task={t} onSelect={onSelect} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="🌱 领域 Areas" hint={activeAreas.length ? `${activeAreas.length} 个` : ""}>
        {activeAreas.length === 0 ? (
          <Empty text="暂无领域，在左侧边栏「＋领域」添加（如 健康 / 财务）" />
        ) : (
          <div className="space-y-4">
            {activeAreas.map((a) => {
              const list = areaTasksFor(a.id);
              return (
                <div key={a.id} className="rounded-xl border bg-background p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{a.icon} {a.name}</span>
                    <span className="text-xs text-muted-foreground">{list.length} 项</span>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground">没有待办</p>
                  ) : (
                    <div className="space-y-1.5">
                      {list.map((t) => (
                        <TaskItem key={t.id} task={t} onSelect={onSelect} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="📚 资源 Resources" hint="reference 任务按标签分组">
        {resourceGroups.size === 0 ? (
          <Empty text="暂无资源，把任务澄清为「参考」即可" />
        ) : (
          <div className="space-y-4">
            {[...resourceGroups.entries()].map(([name, list]) => (
              <div key={name}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {name}
                </h3>
                <div className="space-y-1.5">
                  {list.map((t) => (
                    <TaskItem key={t.id} task={t} onSelect={onSelect} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="🗄 归档 Archives" hint={doneTasks.length ? `${doneTasks.length} 已完成` : ""}>
        {archivedProjects.length > 0 ? (
          <p className="mb-2 text-xs text-muted-foreground">
            已归档项目：{archivedProjects.map((p) => p.name).join("、")}
          </p>
        ) : null}
        {doneTasks.length === 0 ? (
          <Empty text="暂无已完成任务" />
        ) : (
          <div className="space-y-1.5">
            {doneTasks.slice(0, 30).map((t) => (
              <TaskItem key={t.id} task={t} onSelect={onSelect} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
