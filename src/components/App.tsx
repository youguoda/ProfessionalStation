"use client";

import { useEffect, useState } from "react";
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

export function App() {
  const load = useStore((s) => s.load);
  const view = useStore((s) => s.view);
  const loaded = useStore((s) => s.loaded);
  const error = useStore((s) => s.error);
  const agentOpen = useStore((s) => s.agentOpen);
  const setAgentOpen = useStore((s) => s.setAgentOpen);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !loaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-3xl mb-3">⚠️</p>
          <p className="text-red-500">{error}</p>
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

  const isBoard = view === "kanban" || view === "matrix" || view === "timeblock";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <CaptureBar />
        <main className="flex-1 overflow-y-auto p-6">
          {isBoard ? (
            <div>
              {view === "kanban" ? (
                <KanbanView onSelect={setSelectedId} />
              ) : view === "matrix" ? (
                <MatrixView onSelect={setSelectedId} />
              ) : (
                <TimeBlockView onSelect={setSelectedId} />
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-4xl">
              {view === "review" ? (
                <WeeklyReviewView />
              ) : view === "para" ? (
                <ParaView onSelect={setSelectedId} />
              ) : view === "habits" ? (
                <HabitsView />
              ) : view === "automation" ? (
                <AutomationView />
              ) : (
                <ListView view={view} onSelect={setSelectedId} />
              )}
            </div>
          )}
        </main>
      </div>
      {selectedId ? (
        <TaskDetail id={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}
      {agentOpen ? <AgentPanel onClose={() => setAgentOpen(false)} /> : null}
      <PomodoroDock />
    </div>
  );
}
