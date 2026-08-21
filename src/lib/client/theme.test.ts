import { describe, expect, it } from "vitest";
import { nextTheme, THEME_LABELS } from "./theme";

describe("theme 三态", () => {
  it("nextTheme 循环 system → light → dark → system", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });

  it("标签完整", () => {
    expect(THEME_LABELS).toEqual({ light: "浅色", dark: "深色", system: "跟随系统" });
  });
});
