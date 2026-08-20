"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

export interface SearchSelectOption {
  value: string;
  label: string;
}

/** chip + popover 搜索选择器（替代原生 select，支持搜索与键盘） */
export function SearchSelect({
  value,
  options,
  onSelect,
  placeholder,
  allowClear = true,
}: {
  value: string | null;
  options: SearchSelectOption[];
  onSelect: (v: string | null) => void;
  placeholder: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const filtered = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex w-full cursor-pointer items-center justify-between gap-1 rounded-md border bg-background px-2 py-1.5 text-sm"
      >
        <span className="truncate">
          {selected ? (
            selected.label
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        {selected && allowClear ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onSelect(null);
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </div>

      {open ? (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && !e.nativeEvent.isComposing && filtered[0]) {
                onSelect(filtered[0].value);
                setOpen(false);
                setQ("");
              }
            }}
            placeholder="搜索…"
            className="w-full border-b bg-transparent px-2 py-1.5 text-sm outline-none"
          />
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.slice(0, 20).map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onSelect(o.value);
                  setOpen(false);
                  setQ("");
                }}
                className={`block w-full truncate px-2 py-1 text-left text-sm hover:bg-muted ${
                  o.value === value ? "text-primary" : ""
                }`}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">无匹配</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
