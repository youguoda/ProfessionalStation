"use client";

import { useEffect } from "react";
import { useStore } from "@/store/useStore";
import { Sidebar } from "./Sidebar";
import { CaptureBar } from "./CaptureBar";
import { ListView } from "./ListView";
import { KanbanView } from "./KanbanView";
import { MatrixView } from "./MatrixView";
import { WeeklyReviewView } from "./WeeklyReviewView";
import { ParaView } from "./ParaView";
import { TimeBlockView } from "./TimeBlockView";
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
import { ModeSwitcher } from "./ModeSwitcher";
import { triggerUndo } from "@/store/useToast";

const LIST_SCOPES = ["inbox", "today", "upcoming", "anytime", "waiting", "someday", "trash"];

export function App() {
  const load = useStore((s) => s.load);
  const scope = useStore((s) => s.scope);
  const mode = useStore((s) => s.mode);
  const loaded = useStore((s) => s.loaded);
  const error = useStore((s) => s.error);
  const agentOpen = useStore((s) => s.agentOpen);
  const setAgentOpen = useStore((s) => s.setAgentOpen);
  const selectedTaskId = useStore((s) => s.selectedTaskId);
  const openTask = useStore((s) => s.openTask);
  const closeTask = useStore((s) => s.closeTask);

  useEffect(() => {
    load();
  }, [load]);

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
          <p className="text-3xl mb-3">⚠️</p>
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

  const isTaskScope =
    LIST_SCOPES.includes(scope) || scope.startsWith("project:") || scope.startsWith("area:");
  const wide = isTaskScope && mode !== "list";

  function MainContent() {
    if (scope === "habits") return <HabitsView />;
    if (scope === "review") return <WeeklyReviewView />;
    if (scope === "automation") return <AutomationView />;
    if (scope === "settings") return <SettingsView />;
    if (scope === "log") return <LogView onSelect={openTask} />;
    if (scope === "para") return <ParaView onSelect={openTask} />;
    if (scope.startsWith("project:")) {
      return <ProjectDetailView projectId={scope.slice("project:".length)} onSelect={openTask} />;
    }
    if (scope.startsWith("area:")) return <ListView scope={scope} onSelect={openTask} />;

    // 任务范围：视图模式作用于当前范围
    return (
      <div>
        <ModeSwitcher />
        {mode === "list" ? (
          <ListView scope={scope} onSelect={openTask} />
        ) : mode === "kanban" ? (
          <KanbanView scope={scope} onSelect={openTask} />
        ) : mode === "matrix" ? (
          <MatrixView scope={scope} onSelect={openTask} />
        ) : (
          <TimeBlockView onSelect={openTask} />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <CaptureBar />
        <main className="flex-1 overflow-y-auto p-6">
          {wide ? (
            <MainContent />
          ) : (
            <div className="mx-auto max-w-4xl">
              <MainContent />
            </div>
          )}
        </main>
      </div>
      {selectedTaskId ? <TaskDetail id={selectedTaskId} onClose={closeTask} /> : null}
      {agentOpen ? <AgentPanel onClose={() => setAgentOpen(false)} /> : null}
      {!selectedTaskId && !agentOpen ? <PomodoroDock /> : null}
      <ToastViewport />
      <CommandPalette />
    </div>
  );
}
