import { describe, expect, it } from "vitest";
import { formatRelativeDate } from "./dateFormat";

const now = new Date(2025, 0, 8); // 2025-01-08（周三）

describe("formatRelativeDate", () => {
  it("今天/明天/后天/昨天", () => {
    expect(formatRelativeDate("2025-01-08", now)).toBe("今天");
    expect(formatRelativeDate("2025-01-09", now)).toBe("明天");
    expect(formatRelativeDate("2025-01-10", now)).toBe("后天");
    expect(formatRelativeDate("2025-01-07", now)).toBe("昨天");
  });

  it("逾期 N 天", () => {
    expect(formatRelativeDate("2025-01-05", now)).toBe("逾期 3 天");
    expect(formatRelativeDate("2024-12-08", now)).toBe("逾期 31 天");
  });

  it("7 天内显示周几", () => {
    expect(formatRelativeDate("2025-01-11", now)).toBe("周六");
    expect(formatRelativeDate("2025-01-14", now)).toBe("周二");
  });

  it("下周显示下周X", () => {
    expect(formatRelativeDate("2025-01-15", now)).toBe("下周三");
    expect(formatRelativeDate("2025-01-19", now)).toBe("下周日");
  });

  it("更远显示月日", () => {
    expect(formatRelativeDate("2025-03-01", now)).toBe("3月1日");
  });
});
