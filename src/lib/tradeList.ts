/** 交易列表的筛选与排序（纯函数）。 */
import type { Journal } from "./journal";
import type { ClosedTrade, Direction } from "./types";

export interface TradeFilter {
  tagId?: string;
  strategyId?: string;
  emotionId?: string;
  /** 最低评分；0 = “未评分” */
  minRating?: number;
  ratingUnset?: boolean;
  result?: "win" | "loss" | "flat";
  direction?: Direction;
  code?: string;
}

export type SortKey = "entry" | "exit" | "pnl" | "returnPct" | "entryAmount" | "code" | "rating" | "holding";

export function entryKey(t: ClosedTrade): string {
  return `${t.entryDate} ${t.entryTime ?? ""}`;
}
export function exitKey(t: ClosedTrade): string {
  return `${t.exitDate} ${t.exitTime ?? ""}`;
}

export function filterTrades(trades: ClosedTrade[], journals: Record<string, Journal | undefined>, f: TradeFilter): ClosedTrade[] {
  return trades.filter((t) => {
    const j = journals[t.id];
    if (f.tagId && !(j?.tagIds ?? []).includes(f.tagId)) return false;
    if (f.strategyId && j?.strategyId !== f.strategyId) return false;
    if (f.emotionId && j?.emotionId !== f.emotionId) return false;
    if (f.ratingUnset && j?.rating) return false;
    if (f.minRating && (j?.rating ?? 0) < f.minRating) return false;
    if (f.result === "win" && !(t.pnl > 0)) return false;
    if (f.result === "loss" && !(t.pnl < 0)) return false;
    if (f.result === "flat" && t.pnl !== 0) return false;
    if (f.direction && t.direction !== f.direction) return false;
    if (f.code && !`${t.code} ${t.name ?? ""}`.toLowerCase().includes(f.code.toLowerCase())) return false;
    return true;
  });
}

export function sortTrades(
  trades: ClosedTrade[],
  key: SortKey,
  dir: "asc" | "desc",
  journals: Record<string, Journal | undefined> = {},
): ClosedTrade[] {
  const val = (t: ClosedTrade): string | number => {
    switch (key) {
      case "entry":
        return entryKey(t);
      case "exit":
        return exitKey(t);
      case "pnl":
        return t.pnl;
      case "returnPct":
        return t.returnPct;
      case "entryAmount":
        return t.entryAmount;
      case "code":
        return t.code;
      case "rating":
        return journals[t.id]?.rating ?? 0;
      case "holding":
        return t.holdingDays;
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return trades
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const va = val(a.t);
      const vb = val(b.t);
      if (va < vb) return -sign;
      if (va > vb) return sign;
      return a.i - b.i;
    })
    .map((x) => x.t);
}
