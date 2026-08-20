"use client";

import {
  ArrowRight,
  Bot,
  CalendarClock,
  CalendarDays,
  Clock,
  FolderTree,
  Inbox,
  LayoutGrid,
  Monitor,
  Moon,
  RefreshCw,
  SquareKanban,
  Sun,
  Target,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useStore, type ViewId } from "@/store/useStore";
import {
  selectInbox,
  selectNextActions,
  selectSomeday,
  selectToday,
  selectTrash,
  selectWaiting,
} from "@/lib/engine/selectors";
import { InlineAdd } from "./InlineAdd";
import { nextTheme, THEME_LABELS } from "@/lib/client/theme";

const VIEWS: Array<{ id: ViewId; label: string; icon: LucideIcon }> = [
  { id: "inbox", label: "收件箱", icon: Inbox },
  { id: "today", label: "今天", icon: Sun },
  { id: "next", label: "下一步行动", icon: ArrowRight },
  { id: "waiting", label: "等待", icon: Clock },
  { id: "someday", label: "将来/也许", icon: CalendarDays },
  { id: "kanban", label: "看板", icon: SquareKanban },
  { id: "matrix", label: "四象限", icon: LayoutGrid },
  { id: "para", label: "PARA", icon: FolderTree },
  { id: "timeblock", label: "时间块", icon: CalendarClock },
  { id: "habits", label: "习惯", icon: Target },
  { id: "automation", label: "自动化", icon: Zap },
  { id: "review", label: "周回顾", icon: RefreshCw },
  { id: "trash", label: "回收站", icon: Trash2 },
];

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const areas = useStore((s) => s.areas);
  const projectFilter = useStore((s) => s.projectFilter);
  const areaFilter = useStore((s) => s.areaFilter);
  const setProjectFilter = useStore((s) => s.setProjectFilter);
  const setAreaFilter = useStore((s) => s.setAreaFilter);
  const createProject = useStore((s) => s.createProject);
  const createArea = useStore((s) => s.createArea);
  const habits = useStore((s) => s.habits);
  const aiStatus = useStore((s) => s.aiStatus);
  const agentOpen = useStore((s) => s.agentOpen);
  const setAgentOpen = useStore((s) => s.setAgentOpen);
  const theme = useStore((s) => s.settings.theme);
  const setTheme = useStore((s) => s.setTheme);

  const counts: Record<ViewId, number> = {
    inbox: selectInbox(tasks).length,
    today: selectToday(tasks).length,
    next: selectNextActions(tasks).length,
    waiting: selectWaiting(tasks).length,
    someday: selectSomeday(tasks).length,
    kanban: tasks.filter((t) => t.phase === "action").length,
    matrix: tasks.filter((t) => t.phase === "action").length,
    para: 0,
    timeblock: tasks.filter((t) => t.scheduledAt).length,
    habits: habits.length,
    automation: 0,
    review: 0,
    trash: selectTrash(tasks).length,
  };

  const ThemeIcon = THEME_ICONS[theme];

  return (
    <aside className="w-60 shrink-0 border-r bg-muted/40 flex flex-col overflow-y-auto">
      <div className="px-4 pt-5 font-semibold tracking-tight">
        Professional<span className="text-primary">Station</span>
      </div>
      <div className="px-4 pb-2 text-[11px] text-muted-foreground">
        {aiStatus?.enabled ? `AI 已启用 · ${aiStatus.model}` : "AI 未配置"}
      </div>

      <button
        onClick={() => setAgentOpen(!agentOpen)}
        className={`mx-3 mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
          agentOpen
            ? "border-primary bg-primary/15 text-primary"
            : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
        }`}
      >
        <Bot className="h-4 w-4" />
        马力
        <span className="ml-auto text-[11px] text-muted-foreground">计划助手</span>
      </button>

      <nav className="px-2 space-y-0.5">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                view === v.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                {v.label}
              </span>
              {counts[v.id] > 0 ? (
                <span className="text-xs opacity-70">{counts[v.id]}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        项目
      </div>
      <div className="px-2 mt-1 space-y-0.5">
        {projects.filter((p) => !p.archived).map((p) => (
          <button
            key={p.id}
            onClick={() => {
              // 先切视图（会清筛选），再设置项目筛选
              setView("next");
              setAreaFilter(null);
              setProjectFilter(projectFilter === p.id ? null : p.id);
            }}
            className={`w-full flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
              projectFilter === p.id ? "bg-primary/15 text-primary" : "hover:bg-muted"
            }`}
          >
            <span className="truncate"># {p.name}</span>
          </button>
        ))}
        <InlineAdd label="项目" placeholder="项目名" onSubmit={(v) => void createProject(v)} />
      </div>

      <div className="mt-4 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        领域
      </div>
      <div className="px-2 mt-1 space-y-0.5">
        {areas.filter((a) => !a.archived).map((a) => (
          <button
            key={a.id}
            onClick={() => {
              setView("next");
              setProjectFilter(null);
              setAreaFilter(areaFilter === a.id ? null : a.id);
            }}
            className={`w-full flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
              areaFilter === a.id ? "bg-primary/15 text-primary" : "hover:bg-muted"
            }`}
          >
            <span className="truncate">{a.icon} {a.name}</span>
          </button>
        ))}
        <InlineAdd label="领域" placeholder="领域名（如 健康）" onSubmit={(v) => void createArea(v)} />
      </div>

      <div className="mt-auto border-t px-4 py-3">
        <button
          onClick={() => setTheme(nextTheme(theme))}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          title="切换主题"
        >
          <ThemeIcon className="h-4 w-4" />
          主题：{THEME_LABELS[theme]}
        </button>
        <div className="px-2 pt-2 text-[11px] leading-relaxed text-muted-foreground">
          一个任务引擎 · 多种工作流
        </div>
      </div>
    </aside>
  );
}
