"use client";

import { useState } from "react";

export function InlineAdd({
  placeholder,
  onSubmit,
  label,
}: {
  placeholder: string;
  label: string;
  onSubmit: (value: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  async function submit() {
    const v = value.trim();
    if (!v) return;
    setValue("");
    setOpen(false);
    await onSubmit(v);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
      >
        ＋ {label}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => !value && setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
        if (e.key === "Escape") setOpen(false);
      }}
      className="w-full px-2 py-1.5 text-xs rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}
