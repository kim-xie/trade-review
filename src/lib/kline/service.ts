/** 浏览器端 K 线获取：先读 IndexedDB 缓存，未覆盖时请求数据源并写回缓存。 */
import { readCachedCandles, seriesKey, writeCachedCandles } from "../db";
import { createBinanceProvider, createOkxProvider, fetchWithFallback } from "./providers";
import { INTERVAL_MS, type Candle, type Interval, type KlineProvider } from "./types";
import { mergeCandles, resample } from "./window";
import { applyQfq, isFundCode, toTsCode, createProxyTransport, createTushareProvider, fetchAdjFactors, TushareError, type TushareTransport } from "./tushare";

export const ONLINE_PROVIDERS: KlineProvider[] = [createBinanceProvider(), createOkxProvider()];

export type KlineSource = "auto" | "binance" | "okx" | "csv" | "tushare";

export interface LoadResult {
  candles: Candle[];
  source: string;
  fromCache: boolean;
  /** 实际周期（与请求不同时，图表按这个周期画） */
  interval?: Interval;
  notice?: string;
  /** 价格口径换算（前复权时把原始成交价换算到复权口径），无则为原价 */
  adjust?: (ms: number, price: number) => number;
}

export interface TushareOptions {
  token: string;
  proxyUrl: string;
  adj: "none" | "qfq";
  transport?: TushareTransport;
}

/**
 * 加载 K 线。
 * - csv：只读用户导入的缓存（source=csv，任意周期导入后可重采样到更大周期）
 * - auto/binance/okx：在线数据源（auto = Binance → OKX 依次回退）
 */
export async function loadCandles(opts: {
  symbol: string;
  interval: Interval;
  start: number;
  end: number;
  source: KlineSource;
  signal?: AbortSignal;
  tushare?: TushareOptions;
}): Promise<LoadResult> {
  const { symbol, interval, start, end, source } = opts;
  if (source === "csv") return loadCsv(symbol, interval, start, end);
  if (source === "tushare") return loadTushare(symbol, interval, start, end, opts.tushare, opts.signal);

  const providers = source === "auto" ? ONLINE_PROVIDERS : ONLINE_PROVIDERS.filter((p) => p.id === source);
  for (const p of providers) {
    const cached = await readCachedCandles(seriesKey(p.id, symbol, interval), start, end);
    if (cached.covered && cached.candles.length) return { candles: cached.candles, source: p.id, fromCache: true };
  }
  const { provider, candles } = await fetchWithFallback(providers, { symbol, interval, start, end, signal: opts.signal });
  // 包含未收盘 K 线时不登记覆盖范围
  const complete = end + INTERVAL_MS[interval] < Date.now();
  await writeCachedCandles(seriesKey(provider.id, symbol, interval), candles, complete ? { start, end } : null);
  return { candles, source: provider.id, fromCache: false };
}

const CSV_BASES: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

async function loadCsv(symbol: string, interval: Interval, start: number, end: number): Promise<LoadResult> {
  // 先找同周期，再找更小周期的导入数据并重采样
  for (const base of CSV_BASES.slice(0, CSV_BASES.indexOf(interval) + 1).reverse()) {
    const { candles } = await readCachedCandles(seriesKey("csv", symbol, base), start, end);
    if (candles.length) return { candles: base === interval ? candles : resample(candles, interval), source: "csv", fromCache: true };
  }
  return { candles: [], source: "csv", fromCache: true };
}

export async function importCsvCandles(symbol: string, interval: Interval, candles: Candle[]): Promise<void> {
  const series = seriesKey("csv", symbol, interval);
  const existing = await readCachedCandles(series, -Infinity, Infinity);
  const merged = mergeCandles(existing.candles, candles);
  await writeCachedCandles(series, merged, merged.length ? { start: merged[0].t, end: merged[merged.length - 1].t } : null);
}

/** 已知没有分钟权限的 token（本次会话内不再重复请求 stk_mins） */
const noMinuteTokens = new Set<string>();

async function loadTushare(
  symbol: string,
  interval: Interval,
  start: number,
  end: number,
  ts: TushareOptions | undefined,
  signal?: AbortSignal,
): Promise<LoadResult> {
  if (!ts?.token.trim()) throw new TushareError("token", "还没有填写 Tushare token：请到“设置”标签填写你自己的 token，或改用本地 CSV。");
  if (!ts.proxyUrl) throw new TushareError("proxy", "没有可用的 Tushare 代理地址（静态部署需配置 NEXT_PUBLIC_TUSHARE_PROXY_URL，或在“设置”中填写）。");
  const transport = ts.transport ?? createProxyTransport(ts.proxyUrl);
  const token = ts.token.trim();

  let want = interval;
  let notice: string | undefined;
  if (want !== "1d" && noMinuteTokens.has(token)) {
    want = "1d";
    notice = "你的 Tushare 账号无分钟权限，已显示日线。";
  }

  let candles: Candle[];
  let actual: Interval = want;
  let fromCache = false;
  const cached = await readCachedCandles(seriesKey("tushare", symbol, want), start, end);
  if (cached.covered && cached.candles.length) {
    candles = cached.candles;
    fromCache = true;
  } else {
    const r = await createTushareProvider({ token, transport }).fetchDetailed!({ symbol, interval: want, start, end, signal });
    candles = r.candles;
    actual = r.interval ?? want;
    if (r.notice) {
      notice = r.notice;
      noMinuteTokens.add(token);
    }
    // 当天收盘数据 15~17 点入库，最近 1 天内的区间不登记为“已覆盖”
    const complete = end + 86_400_000 < Date.now();
    await writeCachedCandles(seriesKey("tushare", symbol, actual), candles, complete && candles.length ? { start, end } : null);
  }

  let adjust: LoadResult["adjust"];
  if (ts.adj === "qfq" && candles.length && isFundCode(toTsCode(symbol) ?? "")) {
    notice = [notice, "ETF/基金暂不支持前复权，已显示不复权价格。"].filter(Boolean).join(" ");
  } else if (ts.adj === "qfq" && candles.length) {
    try {
      const factors = await fetchAdjFactors(transport, token, symbol, start, end, signal);
      const q = applyQfq(candles, factors);
      candles = q.candles;
      adjust = q.adjust;
    } catch (e) {
      if (e instanceof TushareError && e.kind === "permission") notice = [notice, "复权因子需要 2000 积分，已显示不复权价格。"].filter(Boolean).join(" ");
      else throw e;
    }
  }
  return { candles, source: "tushare", fromCache, interval: actual, notice, adjust };
}
