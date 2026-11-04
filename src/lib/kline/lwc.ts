/**
 * Lightweight Charts 数据换算（纯函数，可测试）。
 * Lightweight Charts 把 UTCTimestamp 按 UTC 显示，这里把时间整体 +8 小时，使坐标轴与十字线直接显示北京时间
 * （官方文档“Working with time zones”推荐的做法）。
 */
import type { Candle, Interval } from "./types";
import { alignToCandle, type TradeMarker } from "./window";

export const BEIJING_OFFSET_S = 8 * 3600;

/** 毫秒 UTC → 图表时间（秒，已平移到北京时间） */
export const toChartTime = (ms: number) => Math.floor(ms / 1000) + BEIJING_OFFSET_S;

/** 图表时间 → "YYYY-MM-DD HH:mm"（日线只到日期） */
export function formatChartTime(sec: number, daily: boolean): string {
  const iso = new Date(sec * 1000).toISOString();
  return daily ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export interface ChartMarker {
  time: number;
  position: "atPriceBottom" | "atPriceTop";
  price: number;
  shape: "arrowUp" | "arrowDown";
  color: string;
  text: string;
  size: number;
  id: string;
}

/** 成交点 → markers：落到所在 K 线时间上；超出已加载区间的不画；按时间排序（库要求有序） */
export function toChartMarkers(candles: Candle[], markers: TradeMarker[], interval: Interval, colors: { buy: string; sell: string; otherAlpha: string }): ChartMarker[] {
  if (!candles.length) return [];
  const first = candles[0].t;
  const step = candles.length > 1 ? candles[1].t - candles[0].t : 0;
  const last = candles[candles.length - 1].t + Math.max(step, 60_000) * 2;
  return markers
    .filter((m) => m.ms >= first - Math.max(step, 60_000) && m.ms <= last)
    .map((m) => {
      const idx = alignToCandle(candles, m.ms, interval);
      const buy = m.side === "buy";
      const other = m.role === "other";
      const base = buy ? colors.buy : colors.sell;
      return {
        time: toChartTime(candles[idx].t),
        position: buy ? ("atPriceBottom" as const) : ("atPriceTop" as const),
        price: m.price,
        shape: buy ? ("arrowUp" as const) : ("arrowDown" as const),
        color: other ? base + colors.otherAlpha : base,
        text: other ? (buy ? "b" : "s") : buy ? "B" : "S",
        size: other ? 1 : 2,
        id: m.fillId,
      };
    })
    .sort((a, b) => a.time - b.time);
}
