/**
 * 盈亏日历聚合（纯函数）。
 *
 * - 归属日期：按平仓日 exitDate（券商交割单中的成交日期，即北京时间交易日，YYYY-MM-DD）。
 *   若只有时间戳，请先用 dates.formatDateInZone(d, "Asia/Shanghai") 转成北京时间日期。
 * - 周起始日可配置：0 = 周日（默认，与参考图一致），1 = 周一 …
 * - 免费版锁定：传入 cutoffDate（免费窗口最早可见日期），早于它的日期标记为锁定；
 *   调用方应传入已经过 applyFreeTierWindow 截取的交易，保证锁定区间没有任何数值。
 */
import { addDays, toDayNumber } from "./dates";
import { round } from "./money";
import type { ClosedTrade } from "./types";

export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PeriodStats {
  pnl: number;
  count: number;
  wins: number;
  losses: number;
  /** 胜率 0~1；count 为 0 时为 0 */
  winRate: number;
  fees: number;
}

export type LockState = "none" | "partial" | "full";

type TradeLike = Pick<ClosedTrade, "exitDate" | "pnl" | "totalFees">;

export const EMPTY_STATS: PeriodStats = { pnl: 0, count: 0, wins: 0, losses: 0, winRate: 0, fees: 0 };

function finalize(s: { pnl: number; count: number; wins: number; losses: number; fees: number }): PeriodStats {
  return {
    pnl: round(s.pnl),
    count: s.count,
    wins: s.wins,
    losses: s.losses,
    winRate: s.count ? round(s.wins / s.count, 6) : 0,
    fees: round(s.fees),
  };
}

/** 把一组交易汇总为一个 PeriodStats */
export function summarize(trades: TradeLike[]): PeriodStats {
  const acc = { pnl: 0, count: 0, wins: 0, losses: 0, fees: 0 };
  for (const t of trades) {
    acc.pnl += t.pnl;
    acc.count += 1;
    if (t.pnl > 0) acc.wins += 1;
    else if (t.pnl < 0) acc.losses += 1;
    acc.fees += t.totalFees ?? 0;
  }
  return finalize(acc);
}

/** 合并多个 PeriodStats（不重新取整前的精度损失可忽略：各项已是分） */
export function mergeStats(list: PeriodStats[]): PeriodStats {
  const acc = { pnl: 0, count: 0, wins: 0, losses: 0, fees: 0 };
  for (const s of list) {
    acc.pnl += s.pnl;
    acc.count += s.count;
    acc.wins += s.wins;
    acc.losses += s.losses;
    acc.fees += s.fees;
  }
  return finalize(acc);
}

function groupBy(trades: TradeLike[], key: (t: TradeLike) => string): Record<string, PeriodStats> {
  const groups = new Map<string, TradeLike[]>();
  for (const t of trades) {
    const k = key(t);
    const arr = groups.get(k);
    if (arr) arr.push(t);
    else groups.set(k, [t]);
  }
  const out: Record<string, PeriodStats> = {};
  for (const k of [...groups.keys()].sort()) out[k] = summarize(groups.get(k)!);
  return out;
}

/** 星期几：0=周日 … 6=周六（按日期字符串计算，与时区无关） */
export function dayOfWeek(date: string): number {
  // 1970-01-01 是周四
  return (((toDayNumber(date) + 4) % 7) + 7) % 7;
}

/** 某日期所在周的起始日 */
export function weekStartOf(date: string, weekStartsOn: WeekStart = 0): string {
  const offset = (dayOfWeek(date) - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const monthKey = (year: number, month: number) => `${year}-${pad(month)}`;
export const dateKey = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** 按日汇总：key = YYYY-MM-DD */
export function aggregateByDay(trades: TradeLike[]): Record<string, PeriodStats> {
  return groupBy(trades, (t) => t.exitDate);
}

/** 按周汇总：key = 周起始日 YYYY-MM-DD（跨月的周算作一整周） */
export function aggregateByWeek(trades: TradeLike[], weekStartsOn: WeekStart = 0): Record<string, PeriodStats> {
  return groupBy(trades, (t) => weekStartOf(t.exitDate, weekStartsOn));
}

/** 按月汇总：key = YYYY-MM */
export function aggregateByMonth(trades: TradeLike[]): Record<string, PeriodStats> {
  return groupBy(trades, (t) => t.exitDate.slice(0, 7));
}

/** 按年汇总：key = YYYY */
export function aggregateByYear(trades: TradeLike[]): Record<string, PeriodStats> {
  return groupBy(trades, (t) => t.exitDate.slice(0, 4));
}

/** 区间 [start, end] 相对免费窗口起点 cutoff 的锁定状态；cutoff 为 null（付费）时不锁 */
export function lockStateForRange(start: string, end: string, cutoff: string | null | undefined): LockState {
  if (!cutoff) return "none";
  if (end < cutoff) return "full";
  if (start < cutoff) return "partial";
  return "none";
}

export interface CalendarOptions {
  weekStartsOn?: WeekStart;
  /** 今天（北京时间 YYYY-MM-DD），用于高亮 */
  today?: string;
  /** 免费窗口最早可见日期；早于它的日期锁定 */
  cutoffDate?: string | null;
}

export interface DayCell {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  locked: boolean;
  /** 无交易或锁定时为 null */
  stats: PeriodStats | null;
}

export interface WeekRow {
  /** 本行在本月内的第一天 / 最后一天（周汇总只统计本月内的日期） */
  start: string;
  end: string;
  days: DayCell[];
  stats: PeriodStats;
  lock: LockState;
}

export interface MonthMatrix {
  year: number;
  month: number;
  weekStartsOn: WeekStart;
  /** 表头星期顺序（0=周日） */
  weekdays: number[];
  weeks: WeekRow[];
  stats: PeriodStats;
  lock: LockState;
}

/**
 * 月度执行矩阵：按周排列的日格 + 每行周汇总。
 * 月外的日期（inMonth=false）不显示数值，周汇总也只统计本月内的日期，与参考图一致。
 */
export function buildMonthMatrix(year: number, month: number, trades: TradeLike[], opts: CalendarOptions = {}): MonthMatrix {
  const weekStartsOn = opts.weekStartsOn ?? 0;
  const byDay = aggregateByDay(trades);
  const first = dateKey(year, month, 1);
  const last = dateKey(year, month, daysInMonth(year, month));
  const weeks: WeekRow[] = [];
  let cursor = weekStartOf(first, weekStartsOn);
  while (cursor <= last) {
    const days: DayCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(cursor, i);
      const inMonth = date >= first && date <= last;
      const locked = inMonth && !!opts.cutoffDate && date < opts.cutoffDate;
      days.push({
        date,
        day: Number(date.slice(8, 10)),
        inMonth,
        isToday: date === opts.today,
        locked,
        stats: inMonth && !locked ? byDay[date] ?? null : null,
      });
    }
    const inMonthDays = days.filter((d) => d.inMonth);
    const start = inMonthDays[0].date;
    const end = inMonthDays[inMonthDays.length - 1].date;
    weeks.push({
      start,
      end,
      days,
      stats: mergeStats(inMonthDays.map((d) => d.stats ?? EMPTY_STATS)),
      lock: lockStateForRange(start, end, opts.cutoffDate),
    });
    cursor = addDays(cursor, 7);
  }
  return {
    year,
    month,
    weekStartsOn,
    weekdays: Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7),
    weeks,
    stats: mergeStats(weeks.map((w) => w.stats)),
    lock: lockStateForRange(first, last, opts.cutoffDate),
  };
}

export interface MonthCard {
  month: number;
  key: string;
  /** 无交易（且未锁定）时为 null → NO_DATA */
  stats: PeriodStats | null;
  lock: LockState;
  isCurrent: boolean;
}

export interface YearBreakdown {
  year: number;
  months: MonthCard[];
  firstHalf: PeriodStats;
  secondHalf: PeriodStats;
  firstHalfLock: LockState;
  secondHalfLock: LockState;
  total: PeriodStats;
}

/** 月度绩效分解：所选年份 1–12 月 + 上/下半年汇总 */
export function buildYearBreakdown(year: number, trades: TradeLike[], opts: { today?: string; cutoffDate?: string | null } = {}): YearBreakdown {
  const byMonth = aggregateByMonth(trades);
  const currentKey = opts.today?.slice(0, 7);
  const months: MonthCard[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const key = monthKey(year, m);
    const lock = lockStateForRange(dateKey(year, m, 1), dateKey(year, m, daysInMonth(year, m)), opts.cutoffDate);
    return { month: m, key, stats: lock === "full" ? null : byMonth[key] ?? null, lock, isCurrent: key === currentKey };
  });
  const half = (cards: MonthCard[]) => mergeStats(cards.map((c) => c.stats ?? EMPTY_STATS));
  return {
    year,
    months,
    firstHalf: half(months.slice(0, 6)),
    secondHalf: half(months.slice(6)),
    firstHalfLock: lockStateForRange(`${year}-01-01`, `${year}-06-30`, opts.cutoffDate),
    secondHalfLock: lockStateForRange(`${year}-07-01`, `${year}-12-31`, opts.cutoffDate),
    total: half(months),
  };
}

export interface YearCard {
  year: number;
  stats: PeriodStats;
  lock: LockState;
}

/** 年度归档：有交易的年份 + 额外年份（如今年），倒序 */
export function buildYearArchive(trades: TradeLike[], opts: { extraYears?: number[]; cutoffDate?: string | null } = {}): YearCard[] {
  const byYear = aggregateByYear(trades);
  const years = new Set<number>([...Object.keys(byYear).map(Number), ...(opts.extraYears ?? [])]);
  return [...years]
    .sort((a, b) => b - a)
    .map((y) => ({
      year: y,
      stats: byYear[String(y)] ?? EMPTY_STATS,
      lock: lockStateForRange(`${y}-01-01`, `${y}-12-31`, opts.cutoffDate),
    }));
}

/** 月份加减：shiftMonth(2026, 1, -1) → {year: 2025, month: 12} */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}
