"use client";

import { useEffect } from "react";
import { useStore } from "@/store/useStore";
import { Sidebar } from "./Sidebar";
import { CaptureBar } from "./CaptureBar";
import { ListView } from "./ListView";
import { ClarifyView } from "./ClarifyView";
import { TodayView } from "./TodayView";
import { DoingView } from "./DoingView";
import { NotesView } from "./NotesView";
import { WeeklyReviewView } from "./WeeklyReviewView";
import { HabitsView } from "./HabitsView";
import { AutomationView } from "./AutomationView";
import { PomodoroDock } from "./PomodoroDock";
import { TaskDetail } from "./TaskDetail";
import { AgentPanel } from "./AgentPanel";
import { ToastViewport } from "./ToastViewport";
import { CommandPalette } from "./CommandPalette";
import { LogView } from "./LogView";
import { ProjectDetailView } from "./ProjectDetailView";
import { SettingsView } from "./SettingsView";
import { CoachBar } from "./CoachBar";
import { triggerUndo } from "@/store/useToast";
import { checkReminders } from "@/lib/client/reminders";

export function App() {
  const load = useStore((s) => s.load);
  const scope = useStore((s) => s.scope);
  const loaded = useStore((s) => s.loaded);
  const error = useStore((s) => s.error);
  const agentOpen = useStore((s) => s.agentOpen);
  const setAgentOpen = useStore((s) => s.setAgentOpen);
  const selectedTaskId = useStore((s) => s.selectedTaskId);
  const openTask = useStore((s) => s.openTask);
  const closeTask = useStore((s) => s.closeTask);
  const tasks = useStore((s) => s.tasks);

  useEffect(() => {
    load();
  }, [load]);

  // 到期提醒（浏览器通知，同任务每次会话一次）
  useEffect(() => {
    if (loaded) checkReminders(tasks);
  }, [loaded, tasks]);

  // 全局快捷键：Cmd/Ctrl+Z 撤销；Q 聚焦快速捕获（不在输入框内时）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        triggerUndo();
      }
      if (e.key.toLowerCase() === "q" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        document.getElementById("capture-input")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (error && !loaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-3 text-3xl">⚠️</p>
          <p className="text-destructive">{error}</p>
          <button
            onClick={() => load()}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        加载中…
      </div>
    );
  }

  /**
   * 导航即生命周期：处理（收件箱→今天→进行中→等待）→ 库存 → 组织 → 结算。
   * 每个范围只有一种正确的展示方式，所以不再有「视图模式」这个选择。
   */
  function MainContent() {
    switch (scope) {
      case "inbox":
        return <ClarifyView onSelect={openTask} />;
      case "today":
        return <TodayView onSelect={openTask} />;
      case "doing":
        return <DoingView onSelect={openTask} />;
      case "notes":
        return <NotesView />;
      case "habits":
        return <HabitsView />;
      case "review":
        return <WeeklyReviewView onSelect={openTask} />;
      case "automation":
        return <AutomationView />;
      case "settings":
        return <SettingsView />;
      case "log":
        return <LogView onSelect={openTask} />;
      default:
        break;
    }
    if (scope.startsWith("project:")) {
      return <ProjectDetailView projectId={scope.slice("project:".length)} onSelect={openTask} />;
    }
    return <ListView scope={scope} onSelect={openTask} />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <CaptureBar />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl">
            <CoachBar />
            <MainContent />
          </div>
        </main>
      </div>
      {agentOpen ? <AgentPanel onClose={() => setAgentOpen(false)} /> : null}
      {selectedTaskId ? <TaskDetail id={selectedTaskId} onClose={closeTask} /> : null}
      {!selectedTaskId && !agentOpen ? <PomodoroDock /> : null}
      <ToastViewport />
      <CommandPalette />
    </div>
  );
}
