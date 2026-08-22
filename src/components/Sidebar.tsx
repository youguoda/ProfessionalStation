"use client";

import {
  ArrowRight,
  Bot,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  Folder,
  FolderTree,
  Inbox,
  LayoutList,
  Monitor,
  Moon,
  NotebookPen,
  PlayCircle,
  Settings,
  Sun,
  Target,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import {
  doingCapacity,
  needsWeeklyReview,
  selectInbox,
  selectWaiting,
  todayCapacity,
} from "@/lib/engine/selectors";
import { InlineAdd } from "./InlineAdd";
import { nextTheme, THEME_LABELS } from "@/lib/client/theme";
import type { ScopeId } from "@/lib/domain/types";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="mt-1 space-y-0.5 px-2">{children}</div>
    </div>
  );
}

export function Sidebar() {
  const scope = useStore((s) => s.scope);
  const setScope = useStore((s) => s.setScope);
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const projects = useStore((s) => s.projects);
  const areas = useStore((s) => s.areas);
  const weeklyReviews = useStore((s) => s.weeklyReviews);
  const settings = useStore((s) => s.settings);
  const createProject = useStore((s) => s.createProject);
  const createArea = useStore((s) => s.createArea);
  const aiStatus = useStore((s) => s.aiStatus);
  const agentOpen = useStore((s) => s.agentOpen);
  const setAgentOpen = useStore((s) => s.setAgentOpen);
  const setTheme = useStore((s) => s.setTheme);

  const inboxCount = selectInbox(tasks).length;
  const today = todayCapacity(tasks, settings);
  const doing = doingCapacity(tasks, settings);
  const reviewDue = needsWeeklyReview(weeklyReviews);
  const theme = settings.theme;

  const NavItem = ({
    id,
    label,
    icon: Icon,
    badge,
    tone = "default",
  }: {
    id: ScopeId;
    label: string;
    icon: LucideIcon;
    /** 已经格式化好的徽章文本；空字符串/undefined 不显示 */
    badge?: string;
    tone?: "default" | "danger" | "warning";
  }) => {
    const active = scope === id;
    return (
      <button
        onClick={() => setScope(id)}
        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
          active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        {badge ? (
          <span
            className={`ml-2 shrink-0 rounded-full px-1.5 text-[11px] tabular-nums ${
              active
                ? "bg-primary-foreground/20"
                : tone === "danger"
                  ? "bg-destructive text-destructive-foreground"
                  : tone === "warning"
                    ? "bg-warning text-warning-foreground"
                    : "text-muted-foreground"
            }`}
          >
            {badge}
          </span>
        ) : null}
      </button>
    );
  };

  const ThemeIcon = { light: Sun, dark: Moon, system: Monitor }[theme];

  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r bg-muted/40">
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

      {/* 处理：任务生命周期里「需要我动手」的四个位置 */}
      <Group title="处理">
        <NavItem
          id="inbox"
          label="收件箱"
          icon={Inbox}
          badge={inboxCount > 0 ? String(inboxCount) : ""}
        />
        <NavItem
          id="today"
          label="今天"
          icon={Sun}
          badge={`${today.used}/${today.max}`}
          tone={today.over ? "warning" : "default"}
        />
        <NavItem
          id="doing"
          label="进行中"
          icon={PlayCircle}
          badge={`${doing.used}/${doing.max}`}
          tone={doing.over ? "danger" : "default"}
        />
        <NavItem
          id="waiting"
          label="等待"
          icon={Clock}
          badge={selectWaiting(tasks).length > 0 ? String(selectWaiting(tasks).length) : ""}
        />
      </Group>

      {/* 库存：可以很长，不设上限，也不该每天看 */}
      <Group title="库存">
        <NavItem id="anytime" label="下一步" icon={ArrowRight} />
        <NavItem id="upcoming" label="未来 7 天" icon={CalendarClock} />
        <NavItem id="someday" label="将来/也许" icon={CalendarDays} />
      </Group>

      <Group title="组织">
        {projects.filter((p) => !p.archived).map((p) => (
          <NavItem key={p.id} id={`project:${p.id}`} label={`# ${p.name}`} icon={Folder} />
        ))}
        <InlineAdd label="项目" placeholder="项目名" onSubmit={(v) => void createProject(v)} />
        {areas.filter((a) => !a.archived).map((a) => (
          <NavItem key={a.id} id={`area:${a.id}`} label={`${a.icon} ${a.name}`} icon={FolderTree} />
        ))}
        <InlineAdd label="领域" placeholder="领域名（如 健康）" onSubmit={(v) => void createArea(v)} />
        <NavItem
          id="notes"
          label="笔记"
          icon={NotebookPen}
          badge={notes.length > 0 ? String(notes.length) : ""}
        />
        <NavItem id="habits" label="习惯" icon={Target} />
      </Group>

      {/* 结算：每周一次，把悬着的东西了结 */}
      <Group title="结算">
        <NavItem
          id="review"
          label="周回顾"
          icon={CheckCircle2}
          badge={reviewDue ? "!" : ""}
          tone="danger"
        />
        <NavItem id="log" label="已完成日志" icon={LayoutList} />
      </Group>

      <div className="mt-auto border-t px-2 py-3">
        <NavItem id="automation" label="自动化" icon={Zap} />
        <NavItem id="trash" label="回收站" icon={Trash2} />
        <NavItem id="settings" label="设置" icon={Settings} />
        <button
          onClick={() => setTheme(nextTheme(theme))}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          title="切换主题"
        >
          <ThemeIcon className="h-4 w-4" />
          主题：{THEME_LABELS[theme]}
        </button>
      </div>
    </aside>
  );
}
