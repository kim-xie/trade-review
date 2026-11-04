"use client";

import { useEffect, useRef, useState } from "react";
import { candleColors, type ColorScheme } from "@/lib/chartSettings";
import { fmtNum, fmtPrice } from "@/lib/format";
import { formatChartTime, toChartMarkers, toChartTime } from "@/lib/kline/lwc";
import type { Candle, Interval } from "@/lib/kline/types";
import type { TradeMarker } from "@/lib/kline/window";

export interface PriceLine {
  price: number;
  label: string;
  color: string;
}

const BUY = "#22d3ee";
const SELL = "#f59e0b";

interface Hover {
  time: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  fills: string[];
}

/**
 * K 线复盘图（TradingView Lightweight Charts v5，Apache-2.0）。
 * 蜡烛 + 成交量（独立 pane），createSeriesMarkers 标出买卖点，createPriceLine 标出开/平仓价与止损/目标，
 * 持仓区间用透明柱状序列铺底。图表上保留 TradingView 归属 logo（attributionLogo），满足其 NOTICE/链接要求。
 */
export default function KlineChart({
  candles,
  interval,
  markers,
  lines,
  holding,
  colorScheme = "red-up",
}: {
  candles: Candle[];
  interval: Interval;
  markers: TradeMarker[];
  lines: PriceLine[];
  holding?: { start: number; end: number };
  colorScheme?: ColorScheme;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const lwc = await import("lightweight-charts");
      if (disposed || !ref.current) return;
      const { up, down } = candleColors(colorScheme);
      const daily = interval === "1d";

      const chart = lwc.createChart(ref.current, {
        autoSize: true,
        layout: {
          background: { type: lwc.ColorType.Solid, color: "transparent" },
          textColor: "#94a3b8",
          fontSize: 11,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "PingFang SC", "Microsoft YaHei", monospace',
          attributionLogo: true,
          panes: { separatorColor: "rgba(255,255,255,0.08)", separatorHoverColor: "rgba(34,211,238,0.2)" },
        },
        grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.05)" } },
        crosshair: { mode: lwc.CrosshairMode.Normal },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
        timeScale: { borderColor: "rgba(255,255,255,0.1)", timeVisible: !daily, secondsVisible: false, rightOffset: 4 },
        localization: {
          locale: "zh-CN",
          timeFormatter: (t: number) => formatChartTime(t, daily),
        },
      });

      // 持仓区间铺底：独立隐藏价格轴上的常数面积图（固定 0~1 区间 → 铺满整个高度）
      const hold = chart.addSeries(lwc.AreaSeries, {
        priceScaleId: "hold",
        lineColor: "rgba(34,211,238,0)",
        lineWidth: 1,
        topColor: "rgba(34,211,238,0.08)",
        bottomColor: "rgba(34,211,238,0.08)",
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 1 } }),
      });
      chart.priceScale("hold").applyOptions({ visible: false, scaleMargins: { top: 0, bottom: 0 } });

      const candleSeries = chart.addSeries(lwc.CandlestickSeries, {
        upColor: up,
        downColor: down,
        borderUpColor: up,
        borderDownColor: down,
        wickUpColor: up,
        wickDownColor: down,
        priceLineVisible: false,
        priceFormat: { type: "custom", formatter: (p: number) => fmtPrice(p), minMove: 0.001 },
      });
      const vol = chart.addSeries(
        lwc.HistogramSeries,
        { priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false },
        1,
      );
      const panes = chart.panes();
      if (panes[1]) panes[1].setHeight(Math.max(60, Math.round((ref.current.clientHeight || 400) * 0.2)));

      type T = import("lightweight-charts").UTCTimestamp;
      candleSeries.setData(candles.map((c) => ({ time: toChartTime(c.t) as T, open: c.o, high: c.h, low: c.l, close: c.c })));
      vol.setData(candles.map((c) => ({ time: toChartTime(c.t) as T, value: c.v, color: (c.c >= c.o ? up : down) + "88" })));
      if (holding) {
        const step = candles.length > 1 ? candles[1].t - candles[0].t : 86_400_000;
        hold.setData(candles.filter((c) => c.t + step > holding.start && c.t <= holding.end).map((c) => ({ time: toChartTime(c.t) as T, value: 1 })));
      }

      const cm = toChartMarkers(candles, markers, interval, { buy: BUY, sell: SELL, otherAlpha: "66" });
      lwc.createSeriesMarkers(candleSeries, cm.map((m) => ({ ...m, time: m.time as T })));

      for (const l of lines) {
        if (!Number.isFinite(l.price) || l.price <= 0) continue;
        candleSeries.createPriceLine({
          price: l.price,
          color: l.color,
          lineWidth: 1,
          lineStyle: lwc.LineStyle.Dashed,
          axisLabelVisible: true,
          title: l.label,
        });
      }

      // 默认显示：持仓区间居中，前后留出上下文
      if (candles.length) chart.timeScale().fitContent();

      // 十字线悬浮信息
      const byTime = new Map<number, string[]>();
      for (const m of markers) {
        const mk = cm.find((x) => x.id === m.fillId);
        if (!mk) continue;
        const txt = `${m.side === "buy" ? "买入" : "卖出"}${m.role === "entry" ? "开仓" : m.role === "exit" ? "平仓" : "（其他）"} ${fmtPrice(m.price)} × ${+m.quantity.toFixed(8)}`;
        byTime.set(mk.time, [...(byTime.get(mk.time) ?? []), txt]);
      }
      chart.subscribeCrosshairMove((p) => {
        const d = p.time ? (p.seriesData.get(candleSeries) as { open: number; high: number; low: number; close: number } | undefined) : undefined;
        if (!d || p.time == null) return setHover(null);
        const v = p.seriesData.get(vol) as { value: number } | undefined;
        setHover({ time: formatChartTime(p.time as number, daily), o: d.open, h: d.high, l: d.low, c: d.close, v: v?.value ?? 0, fills: byTime.get(p.time as number) ?? [] });
      });

      cleanup = () => chart.remove();
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [candles, interval, markers, lines, holding, colorScheme]);

  const { up, down } = candleColors(colorScheme);
  return (
    <div className="relative h-full min-h-[320px] w-full">
      <div ref={ref} className="absolute inset-0" role="img" aria-label="K 线复盘图" />
      {hover && (
        <div className="pointer-events-none absolute left-2 top-1 z-10 rounded bg-slate-950/80 px-2 py-1 font-mono text-[10px] leading-relaxed text-slate-300">
          <span className="text-slate-500">{hover.time}</span>{" "}
          开 {fmtPrice(hover.o)} 高 {fmtPrice(hover.h)} 低 {fmtPrice(hover.l)} 收{" "}
          <span style={{ color: hover.c >= hover.o ? up : down }}>{fmtPrice(hover.c)}</span> 量 {fmtNum(hover.v, 0)}
          {hover.fills.map((f) => (
            <div key={f} className="text-cyan-200">{f}</div>
          ))}
        </div>
      )}
    </div>
  );
}
