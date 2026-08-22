"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bot, Moon, Palette, Search } from "lucide-react";
import { useStore } from "@/store/useStore";
import { nextTheme, THEME_LABELS } from "@/lib/client/theme";
import type { ScopeId } from "@/lib/domain/types";

const SCOPE_ITEMS: Array<{ id: ScopeId; label: string }> = [
  { id: "inbox", label: "收件箱" },
  { id: "today", label: "今天" },
  { id: "doing", label: "进行中" },
  { id: "waiting", label: "等待" },
  { id: "anytime", label: "下一步" },
  { id: "upcoming", label: "未来 7 天" },
  { id: "someday", label: "将来/也许" },
  { id: "notes", label: "笔记" },
  { id: "habits", label: "习惯" },
  { id: "review", label: "周回顾" },
  { id: "log", label: "已完成日志" },
  { id: "automation", label: "自动化" },
  { id: "settings", label: "设置" },
  { id: "trash", label: "回收站" },
];

interface Item {
  key: string;
  icon: React.ReactNode;
  label: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  const setScope = useStore((s) => s.setScope);
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const openTask = useStore((s) => s.openTask);
  const setTheme = useStore((s) => s.setTheme);
  const theme = useStore((s) => s.settings.theme);
  const setAgentOpen = useStore((s) => s.setAgentOpen);

  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 全局 Cmd/Ctrl+K 开关
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useStore.getState().paletteOpen);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const scopes = SCOPE_ITEMS.filter(
      (v) => !q || v.label.includes(q) || v.id.includes(q),
    ).map((v) => ({
      key: `s-${v.id}`,
      icon: <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />,
      label: `去：${v.label}`,
      run: () => setScope(v.id),
    }));

    const projs = projects
      .filter((p) => !p.archived && (!q || p.name.includes(q)))
      .slice(0, 6)
      .map((p) => ({
        key: `p-${p.id}`,
        icon: (
          <span className="h-3.5 w-3.5 text-center text-[10px] leading-3.5 text-muted-foreground">#</span>
        ),
        label: `项目：${p.name}`,
        run: () => setScope(`project:${p.id}`),
      }));

    const taskItems = tasks
      .filter((t) => t.phase !== "trash" && (!q || t.title.includes(q)))
      .slice(0, 6)
      .map((t) => ({
        key: `t-${t.id}`,
        icon: (
          <span className="h-3.5 w-3.5 text-center text-[10px] leading-3.5 text-muted-foreground">✓</span>
        ),
        label: `任务：${t.title}`,
        run: () => openTask(t.id),
      }));

    const actions: Item[] = [
      {
        key: "a-capture",
        icon: <Search className="h-3.5 w-3.5 text-muted-foreground" />,
        label: "快速捕获（Q）",
        run: () => {
          setOpen(false);
          setTimeout(() => document.getElementById("capture-input")?.focus(), 0);
        },
      },
      {
        key: "a-agent",
        icon: <Bot className="h-3.5 w-3.5 text-muted-foreground" />,
        label: "打开马力",
        run: () => setAgentOpen(true),
      },
      {
        key: "a-theme",
        icon: <Palette className="h-3.5 w-3.5 text-muted-foreground" />,
        label: `主题：${THEME_LABELS[theme]} → ${THEME_LABELS[nextTheme(theme)]}`,
        run: () => setTheme(nextTheme(theme)),
      },
    ].filter((a) => !q || a.label.includes(q));

    return [...scopes, ...projs, ...taskItems, ...actions];
  }, [q, projects, tasks, setScope, openTask, setAgentOpen, setTheme, theme, setOpen]);

  useEffect(() => {
    setIdx((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  if (!open) return null;

  function run(item: Item) {
    setOpen(false);
    item.run();
  }

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
      <div className="absolute left-1/2 top-[15%] w-full max-w-md -translate-x-1/2 overflow-hidden rounded-lg border bg-popover shadow-lg">
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(i + 1, items.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (items[idx]) run(items[idx]);
              }
            }}
            placeholder="跳转视图 / 项目 / 任务，或执行动作…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">没有匹配项</p>
          ) : (
            items.map((item, i) => (
              <button
                key={item.key}
                onClick={() => run(item)}
                onMouseEnter={() => setIdx(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  i === idx ? "bg-primary/10 text-primary" : ""
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
