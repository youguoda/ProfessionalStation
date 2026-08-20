"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { Sidebar } from "./Sidebar";
import { CaptureBar } from "./CaptureBar";
import { ListView } from "./ListView";
import { KanbanView } from "./KanbanView";
import { MatrixView } from "./MatrixView";
import { WeeklyReviewView } from "./WeeklyReviewView";
import { TaskDetail } from "./TaskDetail";

export function App() {
  const load = useStore((s) => s.load);
  const view = useStore((s) => s.view);
  const loaded = useStore((s) => s.loaded);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
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

  if (!loaded || loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        加载中…
      </div>
    );
  }

  const isBoard = view === "kanban" || view === "matrix";

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
              ) : (
                <MatrixView onSelect={setSelectedId} />
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-4xl">
              {view === "review" ? (
                <WeeklyReviewView />
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
    </div>
  );
}
