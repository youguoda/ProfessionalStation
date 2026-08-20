import { describe, expect, it } from "vitest";
import { isoDate, parseNaturalDate } from "./naturalDate";

const now = new Date(2025, 0, 8); // 2025-01-08（周三）

function p(input: string) {
  return parseNaturalDate(input, now);
}

function dateOf(input: string) {
  const r = p(input);
  return r.date ? isoDate(r.date) : null;
}

describe("naturalDate：中文相对日期", () => {
  it("今天/明天/后天/大后天", () => {
    expect(dateOf("今天 开会")).toBe("2025-01-08");
    expect(dateOf("明天 开会")).toBe("2025-01-09");
    expect(dateOf("后天 开会")).toBe("2025-01-10");
    expect(dateOf("大后天 开会")).toBe("2025-01-11");
  });

  it("昨天/前天", () => {
    expect(dateOf("昨天 开会")).toBe("2025-01-07");
    expect(dateOf("前天 开会")).toBe("2025-01-06");
  });

  it("N天后", () => {
    expect(dateOf("3天后 交报告")).toBe("2025-01-11");
    expect(dateOf("1天之后 交报告")).toBe("2025-01-09");
  });

  it("剩余文本去掉日期 token", () => {
    expect(p("明天 去超市").remainder).toBe("去超市");
  });
});

describe("naturalDate：周几 / 下周", () => {
  it("周一 → 下一个周一", () => {
    expect(dateOf("周一 复盘")).toBe("2025-01-13");
    expect(p("周一 复盘").remainder).toBe("复盘");
  });

  it("周五 → 最近的周五", () => {
    expect(dateOf("周五 周报")).toBe("2025-01-10");
  });

  it("今天就是周三时，「周三」指向下一个周三", () => {
    expect(dateOf("周三 复盘")).toBe("2025-01-15");
  });

  it("下周三 → 下周三（修复后）", () => {
    expect(dateOf("下周三 会议")).toBe("2025-01-15");
    expect(p("下周三 会议").remainder).toBe("会议");
  });

  it("仅「下周」→ 下周一", () => {
    expect(dateOf("下周 计划")).toBe("2025-01-13");
    expect(p("下周 计划").remainder).toBe("计划");
  });
});

describe("naturalDate：时间", () => {
  it("下午3点", () => {
    expect(p("下午3点 开会").time).toBe("15:00");
  });

  it("上午9点半", () => {
    expect(p("上午9点半 复盘").time).toBe("09:30");
  });

  it("中午12点", () => {
    expect(p("中午12点 午饭").time).toBe("12:00");
  });

  it("晚上8点", () => {
    expect(p("晚上8点 运动").time).toBe("20:00");
  });

  it("15:30", () => {
    expect(p("15:30 站会").time).toBe("15:30");
  });

  it("3pm / 12am", () => {
    expect(p("call 3pm").time).toBe("15:00");
    expect(p("call 12am").time).toBe("00:00");
  });
});

describe("naturalDate：日期 + 时间组合", () => {
  it("明天 下午3点 开会", () => {
    const r = p("明天 下午3点 开会");
    expect(r.date && isoDate(r.date)).toBe("2025-01-09");
    expect(r.time).toBe("15:00");
    expect(r.remainder).toBe("开会");
  });
});

describe("naturalDate：英文", () => {
  it("today/tomorrow/yesterday", () => {
    expect(dateOf("pay bill tomorrow")).toBe("2025-01-09");
    expect(dateOf("pay bill today")).toBe("2025-01-08");
    expect(dateOf("pay bill yesterday")).toBe("2025-01-07");
  });

  it("in N days / Nd", () => {
    expect(dateOf("submit in 2 days")).toBe("2025-01-10");
    expect(dateOf("submit 2d")).toBe("2025-01-10");
  });
});

describe("naturalDate：显式 ISO 日期", () => {
  it("2025-01-20", () => {
    const r = p("2025-01-20 发布");
    expect(r.date && isoDate(r.date)).toBe("2025-01-20");
    expect(r.remainder).toBe("发布");
  });
});

describe("naturalDate：无日期时不阻塞", () => {
  it("返回 matched=false，标题原样保留", () => {
    const r = p("写一篇博客");
    expect(r.matched).toBe(false);
    expect(r.date).toBeNull();
    expect(r.time).toBeNull();
    expect(r.remainder).toBe("写一篇博客");
  });
});
