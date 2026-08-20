"use client";

import { create } from "zustand";

/**
 * 全局 Toast + 撤销注册表。
 * - toast：5 秒自动消失，可带一个动作按钮（常用于「撤销」）。
 * - undo：记录最后一次可撤销的变更；Cmd+Z / toast 按钮触发。
 */

export interface Toast {
  id: string;
  title: string;
  desc?: string;
  tone?: "info" | "success" | "error";
  action?: { label: string; onClick: () => void };
}

export interface UndoEntry {
  label: string;
  undo: () => void | Promise<void>;
}

interface ToastState {
  toasts: Toast[];
  show: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
  undo: UndoEntry | null;
  setUndo: (entry: UndoEntry | null) => void;
  /** 刚完成的任务（完成动效：划线停留后淡出） */
  completedFx: Record<string, number>;
  markCompleted: (id: string) => void;
}

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  undo: null,
  completedFx: {},

  show: (t) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set({ toasts: [...get().toasts, { ...t, id }] });
    setTimeout(() => get().dismiss(id), 5000);
  },

  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),

  setUndo: (entry) => set({ undo: entry }),

  markCompleted: (id) => {
    set({ completedFx: { ...get().completedFx, [id]: Date.now() } });
    setTimeout(() => {
      const next = { ...get().completedFx };
      delete next[id];
      set({ completedFx: next });
    }, 1600);
  },
}));

export function toast(t: Omit<Toast, "id">) {
  useToast.getState().show(t);
}

/** 错误 Toast：优先展示 Error.message */
export function toastError(e: unknown, fallback = "操作失败") {
  useToast.getState().show({
    title: e instanceof Error && e.message ? e.message : fallback,
    tone: "error",
  });
}

/** 记录一次可撤销操作，并弹出带「撤销」按钮的 toast */
export function toastWithUndo(opts: {
  title: string;
  desc?: string;
  undoLabel?: string;
  undo: () => void | Promise<void>;
}) {
  useToast.getState().setUndo({ label: opts.title, undo: opts.undo });
  useToast.getState().show({
    title: opts.title,
    desc: opts.desc,
    tone: "success",
    action: {
      label: opts.undoLabel ?? "撤销",
      onClick: () => {
        void opts.undo();
        useToast.getState().setUndo(null);
      },
    },
  });
}

/** Cmd/Ctrl+Z 触发最近一次撤销（供全局键盘监听调用） */
export function triggerUndo(): boolean {
  const entry = useToast.getState().undo;
  if (!entry) return false;
  void entry.undo();
  useToast.getState().setUndo(null);
  return true;
}
