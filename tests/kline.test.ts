import { describe, expect, it } from "vitest";
import { parseOhlcRows } from "../src/lib/kline/csv";
import { createBinanceProvider, createOkxProvider, fetchWithFallback, toBinanceSymbol, toOkxInstId } from "../src/lib/kline/providers";
import type { FetchLike } from "../src/lib/kline/types";
import { alignToCandle, computeWindow, detectInterval, formatBeijing, mergeCandles, pickInterval, resample, toEpochMs, tradeMarkers } from "../src/lib/kline/window";
import { matchFifo } from "../src/lib/fifo";
import type { Fill } from "../src/lib/types";

const MIN = 60_000;

describe("时间与视窗", () => {
  it("北京时间转换", () => {
    expect(toEpochMs("2026-11-04", "08:00:00")).toBe(Date.UTC(2026, 10, 4, 0, 0, 0));
    expect(formatBeijing(Date.UTC(2026, 10, 4, 0, 5))).toBe("2026-11-04 08:05");
    expect(formatBeijing(Date.UTC(2026, 10, 4, 0, 5), "1d")).toBe("2026-11-04");
  });
  it("默认周期", () => {
    expect(pickInterval(10 * MIN)).toBe("1m");
    expect(pickInterval(5 * 60 * MIN)).toBe("5m");
    expect(pickInterval(3 * 86_400_000)).toBe("1h");
    expect(pickInterval(60 * 86_400_000)).toBe("1d");
  });
  it("视窗覆盖持仓前后，并按周期对齐、限制根数", () => {
    const e = Date.UTC(2026, 10, 4, 1, 0, 30);
    const x = e + 10 * MIN;
    const w = computeWindow(e, x, "1m");
    expect(w.start).toBe(Date.UTC(2026, 10, 4, 0, 0, 0));
    expect(w.end).toBe(Date.UTC(2026, 10, 4, 2, 11, 0));
    const w2 = computeWindow(e, e + 2000 * MIN, "1m", 1000);
    expect((w2.end - w2.start) / MIN).toBeLessThanOrEqual(2002);
    expect(w2.start).toBeLessThanOrEqual(e);
  });
  it("成交时刻定位到 K 线", () => {
    const cs = [0, 1, 2, 3].map((i) => ({ t: i * MIN, o: 1, h: 1, l: 1, c: 1, v: 1 }));
    expect(alignToCandle(cs, 2.5 * MIN, "1m")).toBe(2);
    expect(alignToCandle(cs, 10 * MIN, "1m")).toBe(3);
    expect(alignToCandle(cs, -5 * MIN, "1m")).toBe(0);
    expect(alignToCandle([], 0, "1m")).toBe(-1);
  });
  it("合并与重采样", () => {
    const a = [{ t: 0, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 }];
    const b = [{ t: 0, o: 1, h: 3, l: 0.5, c: 2, v: 2 }, { t: MIN, o: 2, h: 2.5, l: 1, c: 1.2, v: 3 }];
    expect(mergeCandles(a, b)).toHaveLength(2);
    const r = resample(mergeCandles(a, b), "5m");
    expect(r).toEqual([{ t: 0, o: 1, h: 3, l: 0.5, c: 1.2, v: 5 }]);
  });
});

describe("成交点标记", () => {
  it("分批开仓 + 平仓：每个成交一个标记", () => {
    const f = (id: string, side: "buy" | "sell", time: string, q: number, p: number): Fill => ({
      id, date: "2026-11-04", time, code: "BTCUSDT", side, quantity: q, price: p, amount: q * p,
      fees: { commission: 0, stampTax: 0, transferFee: 0, otherFee: 0 }, market: "crypto",
    });
    const fills = [f("b1", "buy", "01:00:00", 1, 100), f("b2", "buy", "01:05:00", 1, 101), f("s1", "sell", "01:30:00", 2, 105)];
    const t = matchFifo(fills).closedTrades[0];
    const m = tradeMarkers(t, fills);
    expect(m.map((x) => [x.fillId, x.role, x.quantity])).toEqual([["b1", "entry", 1], ["b2", "entry", 1], ["s1", "exit", 2]]);
    expect(m[0].ms).toBe(toEpochMs("2026-11-04", "01:00:00"));
  });
});

describe("OHLC CSV", () => {
  it("解析中英文表头、多种时间格式", () => {
    const r = parseOhlcRows([
      ["日期", "开盘", "最高", "最低", "收盘", "成交量"],
      ["20261102", "10", "11", "9.5", "10.5", "1000"],
      ["2026-11-03", "10.5", "10.8", "10", "10.2", "800"],
      ["bad", "x", "", "", "", ""],
    ]);
    expect(r.candles).toHaveLength(2);
    expect(r.candles[0]).toEqual({ t: toEpochMs("2026-11-02"), o: 10, h: 11, l: 9.5, c: 10.5, v: 1000 });
    expect(r.errors).toBe(1);
    const r2 = parseOhlcRows([["time", "open", "high", "low", "close"], ["1793700000000", "1", "2", "0.5", "1.5"], ["2026-11-04 09:31", "1", "1", "1", "1"]]);
    expect(r2.candles.map((c) => c.t)).toEqual([1793700000000, toEpochMs("2026-11-04", "09:31:00")].sort((a, b) => a - b));
    expect(() => parseOhlcRows([["a", "b"], ["1", "2"]])).toThrow();
  });
});

describe("K 线数据源（模拟网络）", () => {
  it("符号转换", () => {
    expect(toBinanceSymbol("btc/usdt")).toBe("BTCUSDT");
    expect(toOkxInstId("BTCUSDT")).toBe("BTC-USDT");
    expect(toOkxInstId("ETHBTC")).toBe("ETH-BTC");
  });
  it("Binance：data-api 失败时切到 api.binance.com，并分页", async () => {
    const urls: string[] = [];
    const fetch: FetchLike = async (url) => {
      urls.push(url);
      if (url.startsWith("https://data-api.binance.vision")) return { ok: false, status: 451, json: async () => ({}) };
      const start = Number(new URL(url).searchParams.get("startTime"));
      const end = Number(new URL(url).searchParams.get("endTime"));
      const n = Math.min(1000, Math.floor((end - start) / MIN) + 1);
      return { ok: true, status: 200, json: async () => Array.from({ length: n }, (_, i) => [start + i * MIN, "1", "2", "0.5", "1.5", "10"]) };
    };
    const p = createBinanceProvider({ fetch });
    const cs = await p.fetchCandles({ symbol: "BTCUSDT", interval: "1m", start: 0, end: 1500 * MIN });
    expect(cs).toHaveLength(1501);
    expect(cs[1000].t).toBe(1000 * MIN);
    expect(urls[0]).toContain("data-api.binance.vision");
    expect(urls.filter((u) => u.startsWith("https://api.binance.com"))).toHaveLength(2);
  });
  it("OKX：倒序分页并裁剪到区间", async () => {
    const fetch: FetchLike = async (url) => {
      const after = Number(new URL(url).searchParams.get("after"));
      const top = (Math.ceil(after / MIN) - 1) * MIN;
      const data = Array.from({ length: 100 }, (_, i) => top - i * MIN)
        .filter((t) => t >= -200 * MIN)
        .map((t) => [String(t), "1", "2", "0.5", "1.5", "3"]);
      return { ok: true, status: 200, json: async () => ({ code: "0", data }) };
    };
    const cs = await createOkxProvider({ fetch }).fetchCandles({ symbol: "BTCUSDT", interval: "1m", start: 0, end: 150 * MIN });
    expect(cs).toHaveLength(151);
    expect(cs[0].t).toBe(0);
    expect(cs.at(-1)!.t).toBe(150 * MIN);
  });
  it("fetchWithFallback：第一个失败时用第二个", async () => {
    const bad = { id: "a", label: "A", supports: () => true, fetchCandles: async () => { throw new Error("x"); } };
    const good = { id: "b", label: "B", supports: () => true, fetchCandles: async () => [{ t: 0, o: 1, h: 1, l: 1, c: 1, v: 1 }] };
    const r = await fetchWithFallback([bad, good], { symbol: "X", interval: "1m", start: 0, end: 1 });
    expect(r.provider.id).toBe("b");
    await expect(fetchWithFallback([bad], { symbol: "X", interval: "1m", start: 0, end: 1 })).rejects.toThrow("A: x");
  });
});

describe("周期推断", () => {
  it("按中位间隔推断", () => {
    const mk = (step: number, n = 10) => Array.from({ length: n }, (_, i) => ({ t: i * step, o: 1, h: 1, l: 1, c: 1, v: 1 }));
    expect(detectInterval(mk(MIN))).toBe("1m");
    expect(detectInterval(mk(15 * MIN))).toBe("15m");
    // 日线跨周末（间隔 1 天或 3 天），中位数仍为 1 天
    const days = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11].map((d) => ({ t: d * 86_400_000, o: 1, h: 1, l: 1, c: 1, v: 1 }));
    expect(detectInterval(days)).toBe("1d");
  });
});

import { otherMarkers } from "../src/lib/kline/window";
describe("otherMarkers", () => {
  it("只返回同品种且不属于本笔交易的成交", async () => {
    const { matchFifo } = await import("../src/lib/fifo");
    const mk = (id: string, side: "buy" | "sell", time: string, qty: number, code = "BTCUSDT") => ({
      id, date: "2026-11-04", time, code, side, quantity: qty, price: 100, amount: 100 * qty,
      fees: { commission: 0, stampTax: 0, transferFee: 0, otherFee: 0 }, source: "t", market: "crypto" as const,
    });
    const fills = [mk("a", "buy", "08:00:00", 1), mk("b", "buy", "08:05:00", 1), mk("c", "sell", "08:40:00", 1.2), mk("d", "sell", "09:10:00", 0.8), mk("x", "buy", "09:00:00", 1, "ETHUSDT")];
    const r = matchFifo(fills as never);
    const last = r.closedTrades[r.closedTrades.length - 1];
    const own = tradeMarkers(last, fills as never);
    expect(own.map((m) => m.fillId)).toEqual(["b", "d"]);
    expect(otherMarkers(last, fills as never, own).map((m) => m.fillId)).toEqual(["a", "c"]);
  });
});

import { formatChartTime, toChartMarkers, toChartTime } from "../src/lib/kline/lwc";
import { candleColors } from "../src/lib/chartSettings";
describe("Lightweight Charts 换算", () => {
  it("时间平移到北京时间显示", () => {
    const ms = toEpochMs("2026-11-04", "09:31:00");
    expect(formatChartTime(toChartTime(ms), false)).toBe("2026-11-04 09:31");
    expect(formatChartTime(toChartTime(toEpochMs("2026-10-30")), true)).toBe("2026-10-30");
  });
  it("成交点落到所在 K 线、按时间排序、区间外不画、其他成交淡色", () => {
    const t0 = toEpochMs("2026-11-04", "09:00:00");
    const candles = [0, 1, 2, 3].map((i) => ({ t: t0 + i * 300_000, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 }));
    const ms = [
      { fillId: "s", side: "sell" as const, role: "exit" as const, ms: t0 + 610_000, price: 1.8, quantity: 1 },
      { fillId: "b", side: "buy" as const, role: "entry" as const, ms: t0 + 70_000, price: 1.1, quantity: 1 },
      { fillId: "o", side: "buy" as const, role: "other" as const, ms: t0 + 900_000, price: 1.2, quantity: 1 },
      { fillId: "far", side: "buy" as const, role: "other" as const, ms: t0 + 86_400_000, price: 1.2, quantity: 1 },
    ];
    const r = toChartMarkers(candles, ms, "5m", { buy: "#000000", sell: "#ffffff", otherAlpha: "66" });
    expect(r.map((m) => m.id)).toEqual(["b", "s", "o"]);
    expect(r[0]).toMatchObject({ time: toChartTime(t0), position: "atPriceBottom", shape: "arrowUp", text: "B", price: 1.1 });
    expect(r[1]).toMatchObject({ time: toChartTime(t0 + 600_000), position: "atPriceTop", text: "S" });
    expect(r[2]).toMatchObject({ text: "b", color: "#00000066", size: 1 });
  });
  it("涨跌颜色可配置", () => {
    expect(candleColors("red-up").up).toBe("#f87171");
    expect(candleColors("green-up").up).toBe("#34d399");
  });
});
