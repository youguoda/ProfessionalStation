/**
 * 自然语言日期/时间解析（极速捕获的核心）。
 *
 * 支持中英文常见表达，返回：
 *   - matched: 是否命中日期/时间
 *   - date: 解析出的日期（若命中），否则 null
 *   - time: 解析出的时间（HH:mm，若命中），否则 null
 *   - remainder: 去掉日期/时间 token 后的剩余文本（用于作为任务标题）
 */

export interface NaturalDateResult {
  matched: boolean;
  date: Date | null;
  time: string | null;
  remainder: string;
}

const WEEKDAYS: Record<string, number> = {
  // 中文
  周日: 0, 星期天: 0, 星期日: 0, 礼拜天: 0,
  周一: 1, 星期一: 1, 礼拜一: 1,
  周二: 2, 星期二: 2, 礼拜二: 2,
  周三: 3, 星期三: 3, 礼拜三: 3,
  周四: 4, 星期四: 4, 礼拜四: 4,
  周五: 5, 星期五: 5, 礼拜五: 5,
  周六: 6, 星期六: 6, 礼拜六: 6,
  // 英文
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function nextWeekday(target: number, from: Date): Date {
  const d = addDays(from, 1);
  while (d.getDay() !== target) d.setDate(d.getDate() + 1);
  return d;
}

/** 解析 HH:mm 或 H:mm，兼容「下午3点」「3pm」「15:00」 */
function parseTimeToken(token: string): string | null {
  const t = token.trim().toLowerCase();
  // 15:00 / 15:30
  const hhmm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = parseInt(hhmm[1], 10);
    const m = parseInt(hhmm[2], 10);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  // 3pm / 3 pm / 4am
  const ampm = t.match(/^(\d{1,2})\s*(am|pm)$/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const isPm = ampm[2] === "pm";
    if (h < 1 || h > 12) return null;
    if (isPm && h !== 12) h += 12;
    if (!isPm && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:00`;
  }
  // 下午3点 / 上午9点半 / 中午12点 / 晚上8点
  const cn = t.match(/^(凌晨|早上|上午|中午|下午|晚上|傍晚)?(\d{1,2})点(半|一刻|三刻)?$/);
  if (cn) {
    const period = cn[1] ?? "";
    let h = parseInt(cn[2], 10);
    let m = 0;
    if (cn[3] === "半") m = 30;
    if (cn[3] === "一刻") m = 15;
    if (cn[3] === "三刻") m = 45;
    if (h < 0 || h > 23) return null;
    if (period === "下午" || period === "晚上" || period === "傍晚") {
      if (h !== 12) h += 12;
    } else if (period === "中午" && h < 11) {
      h += 12;
    } else if (period === "凌晨" && h === 12) {
      h = 0;
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return null;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseNaturalDate(input: string, now: Date = new Date()): NaturalDateResult {
  const base = { matched: false, date: null as Date | null, time: null as string | null, remainder: input };

  let text = input.trim();
  if (!text) return base;

  // 1) 显式 ISO 日期（YYYY-MM-DD，可选时间）
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}:\d{2}))?/);
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    const time = isoMatch[4] ?? null;
    text = text.replace(isoMatch[0], "").trim();
    return { matched: true, date: startOfDay(d), time, remainder: text };
  }

  let date: Date | null = null;
  let time: string | null = null;

  const today = startOfDay(now);

  // 2) 相对天数
  const relMap: Array<[RegExp, (d: Date, m?: RegExpMatchArray) => Date]> = [
    [/大后天/, (d) => addDays(d, 3)],
    [/后天/, (d) => addDays(d, 2)],
    [/明天/, (d) => addDays(d, 1)],
    [/今天|今日/, (d) => d],
    [/昨天/, (d) => addDays(d, -1)],
    [/前天/, (d) => addDays(d, -2)],
    [/tomorrow/, (d) => addDays(d, 1)],
    [/today/, (d) => d],
    [/yesterday/, (d) => addDays(d, -1)],
    [/(\d+)\s*天(?:后|之后)/, (d, m) => addDays(d, Number(m![1]))],
    [/in\s+(\d+)\s*days?/, (d, m) => addDays(d, Number(m![1]))],
    [/(\d+)d/, (d, m) => addDays(d, Number(m![1]))],
  ];

  for (const [re, fn] of relMap) {
    const m = text.match(re);
    if (m) {
      date = fn(today, m);
      text = text.replace(m[0], "").trim();
      break;
    }
  }

  // 3) 下周/下星期几（「下周三」= 下 + 周三）
  if (!date) {
    const mNext = text.match(/^下(周[一二三四五六日]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|周|星期|礼拜)/);
    if (mNext) {
      const token = mNext[1];
      text = text.replace(mNext[0], "").trim();
      const day = today.getDay();
      const daysToNextMonday = day === 1 ? 7 : ((8 - day) % 7);
      const nextMonday = addDays(today, daysToNextMonday);
      const target = WEEKDAYS[token];
      date = target !== undefined ? addDays(nextMonday, (target + 6) % 7) : nextMonday;
    }
  }

  if (!date) {
    // 周几（本周或未来最近的那个周几）
    const wd = text.match(/^(周一|周二|周三|周四|周五|周六|周日|星期[一二三四五六日天]|礼拜[一二三四五六日天]|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (wd) {
      const key = wd[1].toLowerCase();
      const target = WEEKDAYS[key] ?? WEEKDAYS[wd[1]];
      if (target !== undefined) {
        date = nextWeekday(target, today);
        text = text.replace(wd[0], "").trim();
      }
    }
  }

  // 4) 时间 token（可独立出现，或跟在日期后）
  const timeRe = /(?:^|\s)(凌晨\s*\d{1,2}\s*点(?:半|一刻|三刻)?|早上\s*\d{1,2}\s*点(?:半|一刻|三刻)?|上午\s*\d{1,2}\s*点(?:半|一刻|三刻)?|中午\s*\d{1,2}\s*点(?:半|一刻|三刻)?|下午\s*\d{1,2}\s*点(?:半|一刻|三刻)?|晚上\s*\d{1,2}\s*点(?:半|一刻|三刻)?|傍晚\s*\d{1,2}\s*点(?:半|一刻|三刻)?|\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))/i;
  const tm = text.match(timeRe);
  if (tm) {
    const parsed = parseTimeToken(tm[1]);
    if (parsed) {
      time = parsed;
      text = text.replace(tm[0], " ").replace(/\s+/g, " ").trim();
    }
  }

  const matched = date !== null || time !== null;
  return {
    matched,
    date,
    time,
    remainder: text.trim(),
  };
}

export { isoDate };
