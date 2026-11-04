"use client";

import { useEffect, useRef } from "react";
import type { EquityPoint } from "@/lib/stats";

/**
 * 资金曲线（已实现盈亏累计）。ECharts 在浏览器端按需动态导入，并只注册用到的模块，
 * 避免进入首屏 bundle。
 */
export default function EquityChart({ data }: { data: EquityPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let chart: { dispose(): void; resize(): void } | null = null;
    const onResize = () => chart?.resize();

    (async () => {
      const [core, charts, components, renderers] = await Promise.all([
        import("echarts/core"),
        import("echarts/charts"),
        import("echarts/components"),
        import("echarts/renderers"),
      ]);
      if (disposed || !ref.current) return;
      core.use([charts.LineChart, components.GridComponent, components.TooltipComponent, renderers.CanvasRenderer]);
      const inst = core.init(ref.current, "dark", { renderer: "canvas" });
      chart = inst;
      inst.setOption({
        backgroundColor: "transparent",
        grid: { left: 56, right: 16, top: 16, bottom: 32 },
        tooltip: { trigger: "axis", valueFormatter: (v: unknown) => Number(v).toFixed(2) },
        xAxis: { type: "category", data: data.map((d) => d.date), axisLine: { lineStyle: { color: "#334155" } } },
        yAxis: { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } },
        series: [
          {
            name: "累计已实现盈亏",
            type: "line",
            data: data.map((d) => d.cumulativePnl),
            showSymbol: data.length < 40,
            smooth: false,
            lineStyle: { width: 2, color: "#22d3ee" },
            itemStyle: { color: "#22d3ee" },
            areaStyle: {
              color: {
                type: "linear", x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(34,211,238,0.25)" },
                  { offset: 1, color: "rgba(59,130,246,0)" },
                ],
              },
            },
          },
        ],
      });
      window.addEventListener("resize", onResize);
    })();

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      chart?.dispose();
    };
  }, [data]);

  if (data.length === 0) {
    return <div className="flex h-72 items-center justify-center text-sm text-slate-500">暂无已平仓交易</div>;
  }
  return <div ref={ref} className="h-72 w-full" role="img" aria-label="资金曲线" />;
}
