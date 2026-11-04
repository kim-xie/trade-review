/** 用户导入的 OHLC CSV（A 股等无授权在线数据源时的通用兜底）。纯函数。 */
import type { Candle } from "./types";
import { toEpochMs } from "./window";

const ALIASES: Record<"time" | "date" | "open" | "high" | "low" | "close" | "volume", string[]> = {
  time: ["时间", "datetime", "time", "timestamp", "交易时间"],
  date: ["日期", "date", "交易日期", "trade_date"],
  open: ["开盘", "开盘价", "open", "o"],
  high: ["最高", "最高价", "high", "h"],
  low: ["最低", "最低价", "low", "l"],
  close: ["收盘", "收盘价", "close", "c"],
  volume: ["成交量", "volume", "vol", "v"],
};

/**
 * 解析 OHLC 表格（第一行为表头）。时间列支持：毫秒/秒时间戳、"YYYY-MM-DD HH:mm[:ss]"、"YYYYMMDD"（按北京时间）。
 * 也支持“日期 + 时间”两列。日线只有日期时，时间取 00:00（北京时间）。
 */
export function parseOhlcRows(rows: string[][]): { candles: Candle[]; errors: number } {
  if (rows.length < 2) return { candles: [], errors: 0 };
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const idx = (k: keyof typeof ALIASES) => header.findIndex((h) => ALIASES[k].includes(h));
  const iT = idx("time");
  const iD = idx("date");
  const iO = idx("open"), iH = idx("high"), iL = idx("low"), iC = idx("close"), iV = idx("volume");
  if ((iT < 0 && iD < 0) || iO < 0 || iH < 0 || iL < 0 || iC < 0) throw new Error("OHLC 表头需要包含 时间/日期、开盘、最高、最低、收盘 列");
  const candles: Candle[] = [];
  let errors = 0;
  for (const r of rows.slice(1)) {
    const t = parseTime(iD >= 0 ? r[iD] : undefined, iT >= 0 ? r[iT] : undefined);
    const o = Number(r[iO]), h = Number(r[iH]), l = Number(r[iL]), c = Number(r[iC]);
    if (t == null || ![o, h, l, c].every(Number.isFinite)) {
      if (r.some((x) => String(x).trim())) errors++;
      continue;
    }
    candles.push({ t, o, h, l, c, v: iV >= 0 ? Number(r[iV]) || 0 : 0 });
  }
  candles.sort((a, b) => a.t - b.t);
  return { candles, errors };
}

function parseTime(date?: string, time?: string): number | null {
  const ts = String(time ?? "").trim();
  if (/^\d{13}$/.test(ts)) return Number(ts);
  if (/^\d{10}$/.test(ts)) return Number(ts) * 1000;
  const combined = `${String(date ?? "").trim()} ${ts}`.trim();
  const m = combined.match(/^(\d{4})[-/]?(\d{1,2})[-/]?(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const d = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return toEpochMs(d, m[4] ? `${m[4]}:${m[5]}:${m[6] ?? "00"}` : undefined);
}
