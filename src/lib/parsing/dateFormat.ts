import { isoDay } from "@/lib/engine/selectors";

/**
 * 日期人性化显示（纯函数）：输入 ISO date，输出今天/明天/后天/周五/下周二/逾期 N 天/月日。
 */

const WEEKDAYS_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(to + "T00:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function formatRelativeDate(dateStr: string, now: Date = new Date()): string {
  const today = isoDay(now);
  const diff = daysBetween(today, dateStr); // dateStr - today（天）
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  if (diff === -1) return "昨天";
  if (diff < -1) return `逾期 ${-diff} 天`;
  if (diff < 7) {
    const d = new Date(dateStr + "T00:00:00Z");
    return WEEKDAYS_CN[d.getUTCDay()];
  }
  if (diff < 14) {
    const d = new Date(dateStr + "T00:00:00Z");
    return `下${WEEKDAYS_CN[d.getUTCDay()]}`;
  }
  const d = new Date(dateStr + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}
