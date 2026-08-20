"use client";

import { useToast } from "@/store/useToast";

const TONE_STYLES: Record<string, string> = {
  info: "border bg-background",
  success: "border-success bg-background",
  error: "border-destructive/50 bg-background",
};

export function ToastViewport() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[70] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex w-auto items-center gap-3 rounded-lg px-4 py-2.5 text-sm shadow-lg ${TONE_STYLES[t.tone ?? "info"]}`}
          role="status"
        >
          <span className={t.tone === "error" ? "text-destructive" : t.tone === "success" ? "text-success" : ""}>
            {t.tone === "error" ? "⚠" : t.tone === "success" ? "✓" : "ℹ"}
          </span>
          <span className="min-w-0">
            <span className="font-medium">{t.title}</span>
            {t.desc ? <span className="ml-1 text-muted-foreground">{t.desc}</span> : null}
          </span>
          {t.action ? (
            <button
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
              className="shrink-0 rounded border px-2 py-0.5 text-xs font-medium text-primary hover:bg-muted"
            >
              {t.action.label}
            </button>
          ) : null}
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
