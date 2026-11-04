export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export const INTERVAL_MS: Record<Interval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

/** 一根 K 线（t 为开盘时间，毫秒时间戳 UTC） */
export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface KlineRequest {
  symbol: string;
  interval: Interval;
  /** 起止时间（毫秒，含） */
  start: number;
  end: number;
  signal?: AbortSignal;
}

export interface KlineFetchResult {
  candles: Candle[];
  /** 实际返回的周期（数据源降级时与请求不同，如分钟无权限→日线） */
  interval?: Interval;
  /** 给用户看的提示 */
  notice?: string;
}

/**
 * 可插拔的 K 线数据源。新增数据源（如其他量化服务）只需实现 fetchCandles（或 fetchDetailed），
 * 加密源放进 service.ts 的 ONLINE_PROVIDERS，A 股源参考 createTushareProvider。
 */
export interface KlineProvider {
  id: string;
  label: string;
  /** 是否适用于该品种（用于默认选择） */
  supports(symbol: string, market?: string): boolean;
  fetchCandles(req: KlineRequest): Promise<Candle[]>;
  /** 可选：带降级信息的获取 */
  fetchDetailed?(req: KlineRequest): Promise<KlineFetchResult>;
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
