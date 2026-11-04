/** K 线视窗、周期选择、成交点定位（纯函数）。 */
import type { ClosedTrade, Fill } from "../types";
import { INTERVAL_MS, INTERVALS, type Candle, type Interval } from "./types";

/** 北京时间日期 + 时间 → 毫秒时间戳。没有时间时：A 股按 15:00 收盘，其他按 00:00 */
export function toEpochMs(date: string, time?: string, utcOffsetHours = 8, fallbackTime = "00:00:00"): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm, ss] = (time || fallbackTime).split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm || 0, ss || 0) - utcOffsetHours * 3_600_000;
}

/** 毫秒时间戳 → 北京时间 "YYYY-MM-DD HH:mm"（日线只到日期） */
export function formatBeijing(ms: number, interval: Interval = "1m"): string {
  const d = new Date(ms + 8 * 3_600_000).toISOString();
  return interval === "1d" ? d.slice(0, 10) : `${d.slice(0, 10)} ${d.slice(11, 16)}`;
}

/** 选默认周期：持仓跨度约占 30~300 根 K 线的最小周期 */
export function pickInterval(spanMs: number): Interval {
  for (const iv of INTERVALS) if (spanMs / INTERVAL_MS[iv] <= 120) return iv;
  return "1d";
}

/**
 * 默认视窗：覆盖持仓前后各一段（持仓跨度的 1 倍，至少 60 根 K 线），总根数上限 maxBars。
 * 返回的起止时间按周期对齐。
 */
export function computeWindow(entryMs: number, exitMs: number, interval: Interval, maxBars = 1000): { start: number; end: number } {
  const step = INTERVAL_MS[interval];
  const span = Math.max(0, exitMs - entryMs);
  let pad = Math.max(span, 60 * step);
  const total = span + 2 * pad;
  if (total / step > maxBars) pad = Math.max(0, (maxBars * step - span) / 2);
  const start = Math.floor((entryMs - pad) / step) * step;
  const end = Math.ceil((exitMs + pad) / step) * step;
  return { start, end };
}

/** 找到包含某时刻的 K 线下标（t ≤ ms < t+step）；不在范围内时返回最近的一根，空数组返回 -1 */
export function alignToCandle(candles: Candle[], ms: number, interval: Interval): number {
  if (!candles.length) return -1;
  const step = INTERVAL_MS[interval];
  let lo = 0;
  let hi = candles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = candles[mid];
    if (ms < c.t) hi = mid - 1;
    else if (ms >= c.t + step) lo = mid + 1;
    else return mid;
  }
  const a = Math.max(0, Math.min(candles.length - 1, hi));
  const b = Math.max(0, Math.min(candles.length - 1, lo));
  return Math.abs(candles[a].t - ms) <= Math.abs(candles[b].t - ms) ? a : b;
}

export interface TradeMarker {
  fillId: string;
  side: "buy" | "sell";
  /** entry/exit = 本笔交易的成交；other = 同品种的其他成交（淡色显示，便于看整个操作过程） */
  role: "entry" | "exit" | "other";
  ms: number;
  price: number;
  quantity: number;
}

/** 由一笔已平仓交易生成成交点标记（开仓批次 + 平仓成交，去重） */
export function tradeMarkers(trade: ClosedTrade, fills: Fill[]): TradeMarker[] {
  const byId = new Map(fills.map((f) => [f.id, f]));
  const cnClose = trade.market === "cn" || !trade.market ? "15:00:00" : "00:00:00";
  const out = new Map<string, TradeMarker>();
  for (const leg of trade.legs) {
    const entry = byId.get(leg.entryFillId);
    const exit = byId.get(leg.exitFillId);
    if (entry && !out.has(`e-${entry.id}`))
      out.set(`e-${entry.id}`, { fillId: entry.id, side: entry.side, role: "entry", ms: toEpochMs(entry.date, entry.time, 8, cnClose), price: entry.price, quantity: leg.quantity });
    else if (entry) out.get(`e-${entry.id}`)!.quantity += leg.quantity;
    if (exit && !out.has(`x-${exit.id}`))
      out.set(`x-${exit.id}`, { fillId: exit.id, side: exit.side, role: "exit", ms: toEpochMs(exit.date, exit.time, 8, cnClose), price: exit.price, quantity: 0 });
    if (exit) out.get(`x-${exit.id}`)!.quantity += leg.quantity;
  }
  return [...out.values()].sort((a, b) => a.ms - b.ms);
}

/** 合并 K 线（按 t 去重，后者覆盖前者），按时间升序 */
export function mergeCandles(a: Candle[], b: Candle[]): Candle[] {
  const m = new Map<number, Candle>();
  for (const c of a) m.set(c.t, c);
  for (const c of b) m.set(c.t, c);
  return [...m.values()].sort((x, y) => x.t - y.t);
}

/** 把小周期 K 线聚合为大周期（用于用户导入的 1m CSV 切换到 5m/1h 等）。按北京时间对齐日线。 */
export function resample(candles: Candle[], interval: Interval): Candle[] {
  const step = INTERVAL_MS[interval];
  const offset = interval === "1d" ? 8 * 3_600_000 : interval === "4h" ? 0 : 0;
  const out: Candle[] = [];
  for (const c of candles) {
    const bucket = Math.floor((c.t + offset) / step) * step - offset;
    const last = out[out.length - 1];
    if (last && last.t === bucket) {
      last.h = Math.max(last.h, c.h);
      last.l = Math.min(last.l, c.l);
      last.c = c.c;
      last.v += c.v;
    } else out.push({ t: bucket, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v });
  }
  return out;
}

/** 根据相邻 K 线的时间间隔（中位数）推断周期，用于导入 OHLC CSV */
export function detectInterval(candles: Candle[]): Interval {
  if (candles.length < 2) return "1d";
  const diffs = candles.slice(1).map((c, i) => c.t - candles[i].t).filter((d) => d > 0).sort((a, b) => a - b);
  const med = diffs[Math.floor(diffs.length / 2)] ?? 86_400_000;
  let best: Interval = "1d";
  let bestErr = Infinity;
  for (const iv of INTERVALS) {
    const err = Math.abs(Math.log(med / INTERVAL_MS[iv]));
    if (err < bestErr) {
      bestErr = err;
      best = iv;
    }
  }
  return best;
}

/** 同品种、但不属于本笔交易的其他成交，标记为 other */
export function otherMarkers(trade: ClosedTrade, fills: Fill[], own: TradeMarker[]): TradeMarker[] {
  const ownIds = new Set(own.map((m) => m.fillId));
  const cnClose = trade.market === "cn" || !trade.market ? "15:00:00" : "00:00:00";
  return fills
    .filter((f) => f.code === trade.code && !ownIds.has(f.id))
    .map((f) => ({ fillId: f.id, side: f.side, role: "other" as const, ms: toEpochMs(f.date, f.time, 8, cnClose), price: f.price, quantity: f.quantity }))
    .sort((a, b) => a.ms - b.ms);
}
