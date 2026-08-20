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
  Settings,
  Sun,
  Target,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { selectInbox, selectToday, selectWaiting, needsWeeklyReview } from "@/lib/engine/selectors";
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
  const projects = useStore((s) => s.projects);
  const areas = useStore((s) => s.areas);
  const weeklyReviews = useStore((s) => s.weeklyReviews);
  const createProject = useStore((s) => s.createProject);
  const createArea = useStore((s) => s.createArea);
  const aiStatus = useStore((s) => s.aiStatus);
  const agentOpen = useStore((s) => s.agentOpen);
  const setAgentOpen = useStore((s) => s.setAgentOpen);
  const theme = useStore((s) => s.settings.theme);
  const setTheme = useStore((s) => s.setTheme);

  const inboxCount = selectInbox(tasks).length;
  const todayCount = selectToday(tasks).length;
  const reviewDue = needsWeeklyReview(weeklyReviews);

  const NavItem = ({
    id,
    label,
    icon: Icon,
    badge,
    badgeTone = "default",
  }: {
    id: ScopeId;
    label: string;
    icon: LucideIcon;
    badge?: number;
    badgeTone?: "default" | "danger";
  }) => (
    <button
      onClick={() => setScope(id)}
      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
        scope === id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
      }`}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </span>
      {badge && badge > 0 ? (
        <span
          className={`rounded-full px-1.5 text-xs ${
            badgeTone === "danger" ? "bg-destructive text-destructive-foreground" : "opacity-70"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );

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

      <Group title="做什么">
        <NavItem id="inbox" label="收件箱" icon={Inbox} badge={inboxCount} />
        <NavItem id="today" label="今天" icon={Sun} badge={todayCount} badgeTone="danger" />
        <NavItem id="upcoming" label="未来 7 天" icon={CalendarClock} />
        <NavItem id="anytime" label="随时（下一步）" icon={ArrowRight} />
        <NavItem id="waiting" label="等待" icon={Clock} badge={selectWaiting(tasks).length} />
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
        <NavItem id="para" label="PARA 总览" icon={FolderTree} />
        <NavItem id="habits" label="习惯" icon={Target} />
      </Group>

      <Group title="回顾">
        <NavItem id="review" label="周回顾" icon={CheckCircle2} badge={reviewDue ? 1 : 0} badgeTone="danger" />
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
