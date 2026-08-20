"use client";

import { useStore, type ViewId } from "@/store/useStore";
import {
  selectInbox,
  selectNextActions,
  selectSomeday,
  selectToday,
  selectTrash,
  selectWaiting,
} from "@/lib/engine/selectors";
import type { Task } from "@/lib/domain/types";
import { PageHeader, TaskList } from "./TaskList";

export function ListView({
  view,
  onSelect,
}: {
  view: ViewId;
  onSelect: (id: string) => void;
}) {
  const tasks = useStore((s) => s.tasks);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const projectFilter = useStore((s) => s.projectFilter);
  const areaFilter = useStore((s) => s.areaFilter);
  const setProjectFilter = useStore((s) => s.setProjectFilter);
  const setAreaFilter = useStore((s) => s.setAreaFilter);
  const projects = useStore((s) => s.projects);
  const areas = useStore((s) => s.areas);
  const tags = useStore((s) => s.tags);

  let list: Task[];
  let title = "";
  let subtitle = "";
  let empty = "";
  let showFrog = false;

  switch (view) {
    case "inbox":
      list = selectInbox(tasks);
      title = "收件箱";
      subtitle = "捕获的念头在这里澄清，收件箱永远可以清空";
      empty = "收件箱已清空 🎉";
      break;
    case "today":
      list = selectToday(tasks);
      title = "今天";
      subtitle = "青蛙优先，一次一件";
      empty = "今天没有安排，享受空白";
      showFrog = true;
      break;
    case "next":
      list = selectNextActions(tasks);
      title = "下一步行动";
      subtitle = "所有可执行的下一步，按上下文分组";
      empty = "没有下一步行动";
      break;
    case "waiting":
      list = selectWaiting(tasks);
      title = "等待";
      subtitle = "等待他人或依赖的事，定期回顾";
      empty = "没有等待项";
      break;
    case "someday":
      list = selectSomeday(tasks);
      title = "将来/也许";
      subtitle = "现在不做，但值得保留的想法";
      empty = "空";
      break;
    case "trash":
      list = selectTrash(tasks);
      title = "回收站";
      subtitle = "恢复或永久删除";
      empty = "回收站为空";
      break;
    default:
      list = [];
      empty = "";
  }

  // 过滤
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      (t) => t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q),
    );
  }
  if (projectFilter) list = list.filter((t) => t.projectId === projectFilter);
  if (areaFilter) list = list.filter((t) => t.areaId === areaFilter);

  const groupBy =
    view === "next"
      ? (t: Task) => {
          const ctx = t.contexts.map((id) => tags.find((g) => g.id === id)?.name).find(Boolean);
          return ctx ? `@${ctx}` : "未分类";
        }
      : undefined;

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索…"
          className="w-48 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </PageHeader>

      {search || projectFilter || areaFilter ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">筛选：</span>
          {search ? (
            <span className="flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5">
              搜索「{search}」
              <button
                onClick={() => setSearch("")}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </span>
          ) : null}
          {projectFilter ? (
            <span className="flex items-center gap-1 rounded-full border bg-primary/10 px-2 py-0.5 text-primary">
              #{projects.find((p) => p.id === projectFilter)?.name ?? "项目"}
              <button
                onClick={() => setProjectFilter(null)}
                className="hover:text-foreground"
              >
                ✕
              </button>
            </span>
          ) : null}
          {areaFilter ? (
            <span className="flex items-center gap-1 rounded-full border bg-primary/10 px-2 py-0.5 text-primary">
              {areas.find((a) => a.id === areaFilter)?.icon}{" "}
              {areas.find((a) => a.id === areaFilter)?.name ?? "领域"}
              <button onClick={() => setAreaFilter(null)} className="hover:text-foreground">
                ✕
              </button>
            </span>
          ) : null}
          <button
            onClick={() => {
              setSearch("");
              setProjectFilter(null);
              setAreaFilter(null);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            清除全部
          </button>
        </div>
      ) : null}

      <TaskList
        title={title}
        tasks={list}
        onSelect={onSelect}
        emptyText={empty}
        showFrog={showFrog}
        groupBy={groupBy}
      />
    </div>
  );
}
