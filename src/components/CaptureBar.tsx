"use client";

import { useEffect, useRef, useState } from "react";
import { parseNaturalDate, isoDate } from "@/lib/parsing/naturalDate";
import { splitCapture } from "@/lib/parsing/capture";
import { isoDay } from "@/lib/engine/selectors";
import { useStore } from "@/store/useStore";

export function CaptureBar() {
  const addTask = useStore((s) => s.addTask);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const lines = splitCapture(value);
  const first = lines[0] ?? "";
  const parsed = parseNaturalDate(first);
  const preview =
    lines.length === 1 && (parsed.date || parsed.time)
      ? `${parsed.date ? isoDate(parsed.date) : ""} ${parsed.time ? parsed.time : ""}`.trim()
      : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function submit() {
    if (busy) return;
    const list = splitCapture(value);
    if (list.length === 0) return;
    setBusy(true);
    try {
      for (const line of list) {
        const p = parseNaturalDate(line);
        const title = p.remainder || line;
        const today = isoDay(new Date());
        const dueDate = p.date ? isoDate(p.date) : null;
        const scheduledAt = p.time
          ? `${p.date ? isoDate(p.date) : today}T${p.time}:00`
          : null;
        await addTask({ title, dueDate, scheduledAt });
      }
      setValue("");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const rows = Math.min(6, Math.max(1, value.split("\n").length));

  return (
    <div className="border-b bg-background/80 backdrop-blur px-6 py-4">
      <div className="max-w-3xl mx-auto relative">
        <textarea
          id="capture-input"
          ref={inputRef}
          value={value}
          rows={rows}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="捕获一个念头…（试试「明天 下午3点 开会」；多行粘贴可批量捕获）  Ctrl+K 聚焦"
          className="w-full resize-none rounded-lg border bg-background px-4 py-3 pr-28 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {preview ? (
          <span className="absolute right-[4.75rem] top-4 text-xs text-muted-foreground">
            📅 {preview}
          </span>
        ) : null}
        <button
          onClick={submit}
          disabled={lines.length === 0 || busy}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
        >
          {lines.length > 1 ? `批量捕获 ×${lines.length}` : "捕获"}
        </button>
      </div>
    </div>
  );
}
