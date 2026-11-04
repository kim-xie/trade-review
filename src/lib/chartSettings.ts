/** 图表显示设置（本机 localStorage） */
export type ColorScheme = "red-up" | "green-up";

export interface ChartSettings {
  /** red-up：红涨绿跌（A 股习惯，默认）；green-up：绿涨红跌（国际/加密习惯） */
  colorScheme: ColorScheme;
}

const KEY = "trade-review.chart.v1";
export const DEFAULT_CHART_SETTINGS: ChartSettings = { colorScheme: "red-up" };

export function loadChartSettings(): ChartSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_CHART_SETTINGS };
  try {
    return { ...DEFAULT_CHART_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<ChartSettings>) };
  } catch {
    return { ...DEFAULT_CHART_SETTINGS };
  }
}

export function saveChartSettings(s: ChartSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

const RED = "#f87171";
const GREEN = "#34d399";
export const candleColors = (s: ColorScheme) => (s === "green-up" ? { up: GREEN, down: RED } : { up: RED, down: GREEN });
