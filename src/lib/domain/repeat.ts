/**
 * 重复任务规则（纯函数）。
 * 规则编码：
 *   - "daily"         每天
 *   - "weekly"        每周
 *   - "monthly"       每月（按日钳制到月末）
 *   - "every:N:days"  每 N 天
 */

export const REPEAT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "every:3:days", label: "每 3 天" },
  { value: "every:7:days", label: "每 7 天" },
];

export function repeatLabel(rule: string | null): string {
  if (!rule) return "不重复";
  return REPEAT_OPTIONS.find((o) => o.value === rule)?.label ?? rule;
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addMonthsClamped(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return fmt(d);
}

/** 计算下一次截止日期（from 为 ISO date YYYY-MM-DD） */
export function nextDueDate(rule: string | null, from: string): string | null {
  if (!rule) return null;
  const d = new Date(from + "T12:00:00");
  switch (rule) {
    case "daily":
      d.setDate(d.getDate() + 1);
      return fmt(d);
    case "weekly":
      d.setDate(d.getDate() + 7);
      return fmt(d);
    case "monthly":
      return addMonthsClamped(from, 1);
    default: {
      const m = rule.match(/^every:(\d+):days$/);
      if (m) {
        d.setDate(d.getDate() + Number(m[1]));
        return fmt(d);
      }
      return null;
    }
  }
}
