"use client";

import { useEffect, useRef, useState } from "react";
import { parseNaturalDate, isoDate } from "@/lib/parsing/naturalDate";
import { isoDay } from "@/lib/engine/selectors";
import { useStore } from "@/store/useStore";

export function CaptureBar() {
  const addTask = useStore((s) => s.addTask);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = parseNaturalDate(value);
  const preview =
    parsed.date || parsed.time
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
    const raw = value.trim();
    if (!raw || busy) return;
    setBusy(true);
    try {
      const p = parseNaturalDate(raw);
      const title = p.remainder || raw;
      const today = isoDay(new Date());
      const dueDate = p.date ? isoDate(p.date) : null;
      const scheduledAt = p.time
        ? `${p.date ? isoDate(p.date) : today}T${p.time}:00`
        : null;
      await addTask({ title, dueDate, scheduledAt });
      setValue("");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="border-b bg-background/80 backdrop-blur px-6 py-4">
      <div className="max-w-3xl mx-auto relative">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="捕获一个念头…（试试「明天 下午3点 开会」）  Ctrl+K 聚焦"
          className="w-full rounded-lg border bg-background px-4 py-3 pr-24 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {preview ? (
          <span className="absolute right-20 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            📅 {preview}
          </span>
        ) : null}
        <button
          onClick={submit}
          disabled={!value.trim() || busy}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
        >
          捕获
        </button>
      </div>
    </div>
  );
}
