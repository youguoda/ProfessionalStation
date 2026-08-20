import { describe, expect, it } from "vitest";
import { nextDueDate, repeatLabel } from "./repeat";

describe("repeat：重复规则计算", () => {
  it("每天 +1 天", () => {
    expect(nextDueDate("daily", "2025-01-15")).toBe("2025-01-16");
  });

  it("每周 +7 天", () => {
    expect(nextDueDate("weekly", "2025-01-15")).toBe("2025-01-22");
  });

  it("每月 +1 月", () => {
    expect(nextDueDate("monthly", "2025-01-15")).toBe("2025-02-15");
  });

  it("每月钳制月末（1月31 → 2月28）", () => {
    expect(nextDueDate("monthly", "2025-01-31")).toBe("2025-02-28");
  });

  it("每 N 天", () => {
    expect(nextDueDate("every:3:days", "2025-01-15")).toBe("2025-01-18");
  });

  it("null 规则返回 null", () => {
    expect(nextDueDate(null, "2025-01-15")).toBeNull();
  });
});

describe("repeat：标签", () => {
  it("已知规则显示中文标签", () => {
    expect(repeatLabel("daily")).toBe("每天");
    expect(repeatLabel(null)).toBe("不重复");
  });
});
