import type { ThemeMode } from "@/lib/domain/types";

/**
 * 主题三态（light / dark / system）：通过给 <html> 加 .dark class 生效。
 */

export const THEME_LABELS: Record<ThemeMode, string> = {
  light: "浅色",
  dark: "深色",
  system: "跟随系统",
};

export const THEME_ORDER: ThemeMode[] = ["system", "light", "dark"];

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const dark = mode === "dark" || (mode === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

export function nextTheme(current: ThemeMode): ThemeMode {
  const idx = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
}
