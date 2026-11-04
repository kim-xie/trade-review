/**
 * K 线数据源。
 *
 * 加密（无需 API Key，浏览器直连，均返回 CORS 头，2026-11-04 实测）：
 * - Binance Spot REST `GET /api/v3/klines`（文档 https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md ，
 *   每次最多 1000 根）。优先使用官方“仅行情”域名 data-api.binance.vision（返回 CORS *）；主域 api.binance.com 作为备用（部分地区返回 451 且无 CORS 头）
 *   （https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md）。
 * - OKX `GET /api/v5/market/history-candles`（https://www.okx.com/docs-v5/en/#public-data-rest-api-get-candlesticks-history ，
 *   每次最多 100 根，返回按时间倒序，用 after 向前翻页）。
 *
 * A 股：不默认接入任何未授权的行情接口，只提供“用户导入 OHLC CSV”（见 csv.ts）。
 */
import type { Candle, FetchLike, Interval, KlineProvider, KlineRequest } from "./types";
import { INTERVAL_MS } from "./types";

const defaultFetch: FetchLike = (url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>;

/** 交易对标准化：BTC/USDT、btc-usdt → BTCUSDT */
export function toBinanceSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/[-/_\s]/g, "");
}

const QUOTES = ["USDT", "USDC", "FDUSD", "BUSD", "BTC", "ETH", "USD"];
/** BTCUSDT → BTC-USDT */
export function toOkxInstId(symbol: string): string {
  const s = toBinanceSymbol(symbol);
  for (const q of QUOTES) if (s.endsWith(q) && s.length > q.length) return `${s.slice(0, -q.length)}-${q}`;
  return s;
}

export const isCryptoSymbol = (symbol: string) => /^[A-Z0-9]{2,}(USDT|USDC|FDUSD|BUSD|BTC|ETH|USD)$/.test(toBinanceSymbol(symbol));

export function createBinanceProvider(opts: { baseUrls?: string[]; fetch?: FetchLike } = {}): KlineProvider {
  const bases = opts.baseUrls ?? ["https://data-api.binance.vision", "https://api.binance.com"];
  const f = opts.fetch ?? defaultFetch;
  return {
    id: "binance",
    label: "Binance 公开行情",
    supports: (symbol, market) => market === "crypto" || isCryptoSymbol(symbol),
    async fetchCandles(req: KlineRequest): Promise<Candle[]> {
      let lastErr: unknown;
      for (const base of bases) {
        try {
          return await pageBinance(base, req, f);
        } catch (e) {
          if ((e as Error)?.name === "AbortError") throw e;
          lastErr = e;
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error("Binance 请求失败");
    },
  };
}

async function pageBinance(base: string, req: KlineRequest, f: FetchLike): Promise<Candle[]> {
  const out: Candle[] = [];
  let cursor = req.start;
  for (let i = 0; i < 20 && cursor <= req.end; i++) {
    const url = `${base}/api/v3/klines?symbol=${toBinanceSymbol(req.symbol)}&interval=${req.interval}&startTime=${cursor}&endTime=${req.end}&limit=1000`;
    const res = await f(url, { signal: req.signal });
    if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
    const rows = (await res.json()) as unknown[][];
    if (!Array.isArray(rows)) throw new Error("Binance 返回格式异常");
    for (const r of rows) out.push({ t: Number(r[0]), o: +r[1]!, h: +r[2]!, l: +r[3]!, c: +r[4]!, v: +r[5]! });
    if (rows.length < 1000) break;
    cursor = Number(rows[rows.length - 1][0]) + INTERVAL_MS[req.interval];
  }
  return out;
}

const OKX_BAR: Record<Interval, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D" };

export function createOkxProvider(opts: { baseUrl?: string; fetch?: FetchLike } = {}): KlineProvider {
  const base = opts.baseUrl ?? "https://www.okx.com";
  const f = opts.fetch ?? defaultFetch;
  return {
    id: "okx",
    label: "OKX 公开行情",
    supports: (symbol, market) => market === "crypto" || isCryptoSymbol(symbol),
    async fetchCandles(req: KlineRequest): Promise<Candle[]> {
      const out: Candle[] = [];
      // after：返回早于该时间戳的数据；从 end 往前翻页
      let after = req.end + 1;
      for (let i = 0; i < 60; i++) {
        const url = `${base}/api/v5/market/history-candles?instId=${toOkxInstId(req.symbol)}&bar=${OKX_BAR[req.interval]}&after=${after}&limit=100`;
        const res = await f(url, { signal: req.signal });
        if (!res.ok) throw new Error(`OKX HTTP ${res.status}`);
        const body = (await res.json()) as { code: string; msg?: string; data: string[][] };
        if (body.code !== "0") throw new Error(`OKX: ${body.msg || body.code}`);
        if (!body.data.length) break;
        for (const r of body.data) {
          const t = Number(r[0]);
          if (t >= req.start && t <= req.end) out.push({ t, o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] });
        }
        const oldest = Number(body.data[body.data.length - 1][0]);
        if (oldest <= req.start) break;
        after = oldest;
      }
      return out.sort((a, b) => a.t - b.t);
    },
  };
}

/** 依次尝试多个数据源，返回第一个成功且非空的结果 */
export async function fetchWithFallback(providers: KlineProvider[], req: KlineRequest): Promise<{ provider: KlineProvider; candles: Candle[] }> {
  const errors: string[] = [];
  for (const p of providers) {
    try {
      const candles = await p.fetchCandles(req);
      if (candles.length) return { provider: p, candles };
      errors.push(`${p.label}: 无数据`);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      errors.push(`${p.label}: ${(e as Error)?.message ?? e}`);
    }
  }
  throw new Error(errors.join("；") || "没有可用的数据源");
}
