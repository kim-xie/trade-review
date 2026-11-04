import { FREE_TIER } from "./config";
import { addDays, formatDateInZone } from "./dates";

export interface FreeTierOptions<T> {
  /** 窗口天数，默认 FREE_TIER.windowDays（30） */
  windowDays?: number;
  /** 基准：today（默认）或 latestTrade（数据中最新日期） */
  basis?: "today" | "latestTrade";
  /** 取记录日期（YYYY-MM-DD）。默认取 exitDate，其次 date */
  getDate?: (item: T) => string;
  /** 计算“今天”时使用的时区，默认 Asia/Shanghai */
  timeZone?: string;
}

export interface FreeTierResult<T> {
  items: T[];
  /** 是否发生了截断（有记录被隐藏） */
  limited: boolean;
  /** 免费版可见的最早日期（含）；付费版为 null */
  cutoffDate: string | null;
  /** 基准日期 */
  anchorDate: string | null;
  hiddenCount: number;
}

function defaultGetDate(item: unknown): string {
  const o = item as { exitDate?: string; date?: string };
  return o.exitDate ?? o.date ?? "";
}

/**
 * 免费版时间窗口：只保留最近 windowDays 天（含基准当天，共 windowDays 个自然日）的记录。
 * 例如基准 2026-11-04、windowDays=30 → 保留 2026-10-06 ~ 2026-11-04。
 * 付费（isPro=true）时原样返回。纯函数。
 *
 * 对已平仓交易默认按平仓日期（exitDate）判断，这样买入早于窗口、卖出在窗口内的交易仍能正确计算盈亏。
 */
export function applyFreeTierWindow<T>(
  items: T[],
  now: Date,
  isPro: boolean,
  options: FreeTierOptions<T> = {},
): FreeTierResult<T> {
  if (isPro) return { items: [...items], limited: false, cutoffDate: null, anchorDate: null, hiddenCount: 0 };
  const windowDays = options.windowDays ?? FREE_TIER.windowDays;
  const basis = options.basis ?? FREE_TIER.basis;
  const getDate = options.getDate ?? (defaultGetDate as (item: T) => string);

  let anchor = formatDateInZone(now, options.timeZone);
  if (basis === "latestTrade") {
    const latest = items.map(getDate).filter(Boolean).sort().at(-1);
    if (latest) anchor = latest;
  }
  const cutoff = addDays(anchor, -(windowDays - 1));
  const kept = items.filter((it) => {
    const d = getDate(it);
    return d >= cutoff && d <= anchor;
  });
  return {
    items: kept,
    limited: kept.length < items.length,
    cutoffDate: cutoff,
    anchorDate: anchor,
    hiddenCount: items.length - kept.length,
  };
}

export const FREE_TIER_NOTICE = `免费版仅分析最近 ${FREE_TIER.windowDays} 天，买断解锁全部历史`;
