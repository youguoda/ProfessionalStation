import { describe, expect, it } from "vitest";
import { isoDate, parseNaturalDate } from "./naturalDate";

const now = new Date(2025, 0, 8); // 2025-01-08（周三）

describe("naturalDate：中文相对日期", () => {
  it("解析「今天」「明天」「后天」「大后天」", () => {
    expect(parseNaturalDate("今天 开会", now).date && isoDate(parseNaturalDate("今天 开会", now).date!)).toBe("2025-01-08");
    expect(parseNaturalDate("明天 开会", now).date && isoDate(parseNaturalDate("明天 开会", now).date!)).toBe("2025-01-09");
    expect(parseNaturalDate("后天 开会", now).date && isoDate(parseNaturalDate("后天 开会", now).date!)).toBe("2025-01-10");
    expect(parseNaturalDate("大后天 开会", now).date && isoDate(parseNaturalDate("大后天 开会", now).date!)).toBe("2025-01-11");
  });

  it("解析「N天后」", () => {
    expect(isoDate(parseNaturalDate("3天后 交报告", now).date!)).toBe("2025-01-11");
  });

  it("剩余文本去掉日期 token", () => {
    const r = parseNaturalDate("明天 去超市", now);
    expect(r.remainder).toBe("去超市");
  });
});

describe("naturalDate：时间", () => {
  it("解析「下午3点」", () => {
    expect(parseNaturalDate("下午3点 开会", now).time).toBe("15:00");
  });

  it("解析「3pm」", () => {
    expect(parseNaturalDate("call 3pm", now).time).toBe("15:00");
  });

  it("解析「15:30」", () => {
    expect(parseNaturalDate("15:30 站会", now).time).toBe("15:30");
  });

  it("解析「上午9点半」", () => {
    expect(parseNaturalDate("上午9点半 复盘", now).time).toBe("09:30");
  });
});

describe("naturalDate：英文", () => {
  it("解析 today/tomorrow", () => {
    expect(isoDate(parseNaturalDate("pay bill tomorrow", now).date!)).toBe("2025-01-09");
    expect(isoDate(parseNaturalDate("pay bill today", now).date!)).toBe("2025-01-08");
  });

  it("解析 in N days", () => {
    expect(isoDate(parseNaturalDate("submit in 2 days", now).date!)).toBe("2025-01-10");
  });
});

describe("naturalDate：无日期时不阻塞", () => {
  it("返回 matched=false，标题原样保留", () => {
    const r = parseNaturalDate("写一篇博客", now);
    expect(r.matched).toBe(false);
    expect(r.remainder).toBe("写一篇博客");
  });
});
