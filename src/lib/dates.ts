/** 日期工具：内部统一使用 YYYY-MM-DD 字符串，按 UTC 计算天数差，避免时区偏移。 */

export function toDayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function addDays(date: string, days: number): string {
  const n = toDayNumber(date) + days;
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

/** 取某个 Date 在指定时区下的 YYYY-MM-DD（默认 Asia/Shanghai，A 股交易日口径） */
export function formatDateInZone(d: Date, timeZone = "Asia/Shanghai"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA 输出即为 YYYY-MM-DD
}
