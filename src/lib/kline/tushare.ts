/**
 * Tushare Pro 行情（用户自带 token，BYO token）。
 *
 * 官方文档（2026-11-04 核实）：
 * - HTTP 调用：POST JSON {api_name, token, params, fields}，返回 {code, msg, data:{fields, items}}；
 *   code 0 成功，2002 表示权限问题。https://tushare.pro/document/1?doc_id=130
 * - 日线 daily：未复权，120 积分起可试用（每分钟 50 次），5000 积分每分钟 500 次、每次 6000 条；
 *   vol 单位“手”、amount 单位“千元”。https://tushare.pro/document/2?doc_id=27
 * - 复权因子 adj_factor：2000 积分起。https://tushare.pro/document/2?doc_id=28
 * - 通用行情 pro_bar（含 qfq/hfq）：官方说明“暂时没法用 http 的方式调取”，因此前复权由本模块用
 *   daily + adj_factor 自行计算：前复权价 = 价格 × 当日因子 ÷ 区间末日因子（与 pro_bar 以 end_date 动态复权一致）。
 *   https://tushare.pro/document/2?doc_id=109
 * - 历史分钟 stk_mins：需单独开通“A股历史分钟”权限（与积分无关，个人 2000 元/年），1/5/15/30/60min，
 *   单次最多 8000 行，每分钟 500 次，每天 30 万次。trade_time 为该分钟 K 线的结束时间（北京时间）。
 *   https://tushare.pro/document/2?doc_id=370 、https://tushare.pro/document/1?doc_id=290
 * - 交易日历 trade_cal：2000 积分。https://tushare.pro/document/2?doc_id=26
 * - ETF 日线 fund_daily：至少 5000 积分（vol 手）。https://tushare.pro/document/2?doc_id=127
 *
 * 浏览器不能直连 api.tushare.pro（无 CORS 头），所以请求都发到透传代理（见 src/lib/tushareProxy.ts）。
 */
import type { Candle, Interval, KlineProvider, KlineRequest } from "./types";
import { INTERVAL_MS } from "./types";
import { resample, toEpochMs } from "./window";

export const TUSHARE_ENDPOINT = "https://api.tushare.pro";
export const TUSHARE_ALLOWED_APIS = ["daily", "fund_daily", "adj_factor", "stk_mins", "trade_cal"] as const;
export type TushareApi = (typeof TUSHARE_ALLOWED_APIS)[number];

// ---------------- 代码转换 ----------------

/**
 * 6 位证券代码 → Tushare ts_code。
 * 上交所 .SH：60xxxx 主板、688/689 科创板、900 B 股；深交所 .SZ：000-004 主板、300/301 创业板、200 B 股；
 * 北交所 .BJ：920xxx（新代码段）及 43/83/87/88 开头的老代码。已带后缀（600000.SH、sh600000、SZ000001）的直接规范化。
 * 场内基金（ETF/LOF）：上交所 50/51/52/56/58 开头 .SH，深交所 15/16 开头 .SZ（日线走 fund_daily）。
 * 无法判断（如指数/债券）返回 null。
 */
export function toTsCode(code: string): string | null {
  const s = code.trim().toUpperCase();
  let m = /^(\d{6})\.(SH|SZ|BJ)$/.exec(s);
  if (m) return `${m[1]}.${m[2]}`;
  m = /^(SH|SZ|BJ)\.?(\d{6})$/.exec(s);
  if (m) return `${m[2]}.${m[1]}`;
  m = /^(\d{6})\.SS$/.exec(s);
  if (m) return `${m[1]}.SH`;
  if (!/^\d{1,6}$/.test(s)) return null;
  const c = s.padStart(6, "0");
  if (/^(60[0-35]|68[89]|900)/.test(c)) return `${c}.SH`;
  if (/^(00[0-4]|30[01]|200)/.test(c)) return `${c}.SZ`;
  if (/^(920|43|83|87|88)/.test(c)) return `${c}.BJ`;
  if (/^(5[0-2]|5[68])/.test(c)) return `${c}.SH`;
  if (/^1[56]/.test(c)) return `${c}.SZ`;
  return null;
}

/** 是否场内基金（ETF/LOF），决定用 fund_daily 还是 daily */
export function isFundCode(tsCode: string): boolean {
  return /^(5[0-268]\d{4}\.SH|1[56]\d{4}\.SZ)$/.test(tsCode);
}

// ---------------- 错误处理 ----------------

export type TushareErrorKind = "token" | "permission" | "rate" | "quota" | "params" | "network" | "proxy" | "server" | "unknown";

export class TushareError extends Error {
  constructor(
    public kind: TushareErrorKind,
    message: string,
    public code?: number,
    public raw?: string,
  ) {
    super(message);
    this.name = "TushareError";
  }
}

/** Tushare 返回码/信息 → 友好中文提示。40101 实测用于 token 错误和 JSON 格式错误，所以结合 msg 判断。 */
export function classifyTushareError(code: number | undefined, msg: string | null | undefined, api?: string): TushareError {
  const m = msg ?? "";
  const where = api ? `（接口 ${api}）` : "";
  if (/token/i.test(m) || (code === 40101 && !/json/i.test(m)))
    return new TushareError("token", "Tushare token 无效或未填写，请在“设置”中检查你的 token。", code, m);
  if (/每分钟|每秒|频次|frequency/i.test(m))
    return new TushareError("rate", `Tushare 访问太频繁${where}：你的账号每分钟调用次数已用完，请稍后再试。`, code, m);
  if (/每天|每小时|总量|上限/.test(m))
    return new TushareError("quota", `Tushare 当日调用总量已用完${where}，请明天再试或提升账号等级。`, code, m);
  if (code === 2002 || code === 40203 || /权限|积分|permission/i.test(m)) {
    const hint =
      api === "stk_mins"
        ? "你的 Tushare 账号没有“A股历史分钟”权限（需在 Tushare 权限中心单独开通）。"
        : api === "adj_factor"
          ? "复权因子 adj_factor 需要 2000 积分。"
          : api === "fund_daily"
            ? "ETF 日线 fund_daily 需要至少 5000 积分。"
            : "";
    return new TushareError("permission", `Tushare 账号权限不足${where}。${hint}`, code, m);
  }
  if (/json|参数|param/i.test(m)) return new TushareError("params", `Tushare 请求参数错误${where}：${m}`, code, m);
  return new TushareError("unknown", `Tushare 返回错误${where}：${m || `code ${code}`}`, code, m);
}

export interface TushareTable {
  fields: string[];
  items: unknown[][];
}

/** 解析 Tushare 响应：code≠0 抛 TushareError；成功返回 fields/items */
export function parseTushareResponse(json: unknown, api?: string): TushareTable {
  const j = json as { code?: number; msg?: string | null; data?: { fields?: string[]; items?: unknown[][] } | null; error?: string };
  if (!j || typeof j !== "object") throw new TushareError("server", "Tushare 返回了无法识别的数据");
  if (j.error && j.code === undefined) throw new TushareError("proxy", `代理拒绝请求：${j.error}`);
  if (j.code !== 0) throw classifyTushareError(j.code, j.msg, api);
  return { fields: j.data?.fields ?? [], items: j.data?.items ?? [] };
}

/** fields + items → 对象数组 */
export function tableToRows(t: TushareTable): Record<string, unknown>[] {
  return t.items.map((row) => Object.fromEntries(t.fields.map((f, i) => [f, row[i]])));
}

// ---------------- 行情解析 ----------------

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
const ymdToIso = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

/** daily → 日 K（t = 北京时间当日 00:00；vol 手 → 股） */
export function dailyToCandles(t: TushareTable): Candle[] {
  return tableToRows(t)
    .map((r) => ({
      t: toEpochMs(ymdToIso(String(r.trade_date))),
      o: num(r.open),
      h: num(r.high),
      l: num(r.low),
      c: num(r.close),
      v: num(r.vol) * 100,
    }))
    .filter((c) => Number.isFinite(c.t) && Number.isFinite(c.c))
    .sort((a, b) => a.t - b.t);
}

/** stk_mins → 分钟 K。trade_time 是结束时间，转成开盘时间 t = trade_time − 周期 */
export function minsToCandles(t: TushareTable, freqMs: number): Candle[] {
  return tableToRows(t)
    .map((r) => {
      const [d, tm] = String(r.trade_time).split(" ");
      return { t: toEpochMs(d, tm) - freqMs, o: num(r.open), h: num(r.high), l: num(r.low), c: num(r.close), v: num(r.vol) };
    })
    .filter((c) => Number.isFinite(c.t) && Number.isFinite(c.c))
    .sort((a, b) => a.t - b.t);
}

/** adj_factor → Map<北京日期 YYYY-MM-DD, 因子> */
export function parseAdjFactors(t: TushareTable): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of tableToRows(t)) m.set(ymdToIso(String(r.trade_date)), num(r.adj_factor));
  return m;
}

const beijingDate = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);

/** 取某日的复权因子（当天没有则用之前最近一天的；都没有则用最早一天） */
export function factorAt(factors: Map<string, number>, date: string): number | undefined {
  let best: string | undefined;
  let earliest: string | undefined;
  for (const d of factors.keys()) {
    if (!earliest || d < earliest) earliest = d;
    if (d <= date && (!best || d > best)) best = d;
  }
  const k = best ?? earliest;
  return k ? factors.get(k) : undefined;
}

/**
 * 前复权：价格 × 当日因子 ÷ 基准日因子（基准日 = 区间最后一天）。成交量不调整。
 * 返回调整后的 K 线和一个把“原始成交价”换算成同口径价格的函数（用于买卖点、止损/目标线）。
 */
export function applyQfq(candles: Candle[], factors: Map<string, number>): { candles: Candle[]; adjust: (ms: number, price: number) => number } {
  if (!candles.length || !factors.size) return { candles, adjust: (_ms, p) => p };
  const base = factorAt(factors, beijingDate(candles[candles.length - 1].t));
  if (!base) return { candles, adjust: (_ms, p) => p };
  const ratio = (ms: number) => (factorAt(factors, beijingDate(ms)) ?? base) / base;
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return {
    candles: candles.map((c) => {
      const r = ratio(c.t);
      return r === 1 ? c : { ...c, o: round(c.o * r), h: round(c.h * r), l: round(c.l * r), c: round(c.c * r) };
    }),
    adjust: (ms, p) => round(p * ratio(ms)),
  };
}

// ---------------- 请求 ----------------

export type TushareTransport = (body: { api_name: TushareApi; token: string; params: Record<string, string>; fields: string }, signal?: AbortSignal) => Promise<unknown>;

/** 通过代理地址发送请求（浏览器用） */
export function createProxyTransport(proxyUrl: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): TushareTransport {
  return async (body, signal) => {
    let res: Response;
    try {
      res = await fetchImpl(proxyUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      throw new TushareError("network", `无法连接 Tushare 代理（${proxyUrl}）。请检查网络，或在“设置”中确认代理地址。`);
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new TushareError(res.status === 404 ? "proxy" : "server", res.status === 404 ? `代理地址不存在（HTTP 404：${proxyUrl}）。静态部署需要配置 NEXT_PUBLIC_TUSHARE_PROXY_URL。` : `代理返回异常（HTTP ${res.status}）`);
    }
    if (res.status === 429) throw new TushareError("rate", "代理限流：请求太频繁，请稍后再试。");
    if (res.status === 502 || res.status === 504) throw new TushareError("network", "代理暂时连不上 Tushare（上游超时或不可达），请稍后重试。");
    if (res.status === 403) throw new TushareError("proxy", `代理拒绝请求：${(json as { error?: string })?.error ?? "来源不在白名单"}`);
    return json;
  };
}

const FREQ: Partial<Record<Interval, { freq: string; ms: number }>> = {
  "1m": { freq: "1min", ms: 60_000 },
  "5m": { freq: "5min", ms: 300_000 },
  "15m": { freq: "15min", ms: 900_000 },
  "1h": { freq: "60min", ms: 3_600_000 },
  "4h": { freq: "60min", ms: 3_600_000 }, // stk_mins 没有 4h，取 60min 再重采样
};

const fmtYmd = (ms: number) => beijingDate(ms).replace(/-/g, "");
const fmtDt = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");

export interface TushareFetchResult {
  candles: Candle[];
  /** 实际周期（分钟无权限时降级为 1d） */
  interval: Interval;
  notice?: string;
}

/** 按周期取未复权 K 线；分钟无权限时自动降级为日线并给出提示 */
export async function fetchTushareCandles(
  transport: TushareTransport,
  token: string,
  req: { code: string; interval: Interval; start: number; end: number; signal?: AbortSignal },
): Promise<TushareFetchResult> {
  const tsCode = toTsCode(req.code);
  if (!tsCode) throw new TushareError("params", `无法把代码 ${req.code} 转成 Tushare 代码（目前只支持沪深北 A 股/B 股）`);
  const call = async (api: TushareApi, params: Record<string, string>, fields: string) =>
    parseTushareResponse(await transport({ api_name: api, token, params, fields }, req.signal), api);

  const daily = async () =>
    dailyToCandles(await call(isFundCode(tsCode) ? "fund_daily" : "daily", { ts_code: tsCode, start_date: fmtYmd(req.start), end_date: fmtYmd(req.end) }, "trade_date,open,high,low,close,vol"));

  const f = FREQ[req.interval];
  if (!f) return { candles: await daily(), interval: "1d" };

  try {
    const out: Candle[] = [];
    let end = req.end;
    for (let i = 0; i < 10; i++) {
      const t = await call("stk_mins", { ts_code: tsCode, freq: f.freq, start_date: fmtDt(req.start), end_date: fmtDt(end) }, "trade_time,open,high,low,close,vol");
      const page = minsToCandles(t, f.ms);
      out.push(...page);
      if (t.items.length < 8000 || !page.length) break;
      end = page[0].t + f.ms - 1000; // 单次 8000 行上限：继续向前翻页
    }
    const dedup = [...new Map(out.map((c) => [c.t, c])).values()].sort((a, b) => a.t - b.t);
    return { candles: req.interval === "4h" ? resample(dedup, "4h") : dedup, interval: req.interval };
  } catch (e) {
    if (e instanceof TushareError && e.kind === "permission") {
      return { candles: await daily(), interval: "1d", notice: "你的 Tushare 账号无分钟权限，已显示日线。" };
    }
    throw e;
  }
}

export async function fetchAdjFactors(transport: TushareTransport, token: string, code: string, start: number, end: number, signal?: AbortSignal) {
  const tsCode = toTsCode(code);
  if (!tsCode) return new Map<string, number>();
  const t = parseTushareResponse(
    await transport({ api_name: "adj_factor", token, params: { ts_code: tsCode, start_date: fmtYmd(start), end_date: fmtYmd(end) }, fields: "trade_date,adj_factor" }, signal),
    "adj_factor",
  );
  return parseAdjFactors(t);
}

export const _internal = { fmtYmd, fmtDt, INTERVAL_MS };

/** Tushare 作为可插拔 Provider（凭据由调用方传入，不在模块里保存） */
export function createTushareProvider(opts: { token: string; transport: TushareTransport }): KlineProvider {
  const p: KlineProvider = {
    id: "tushare",
    label: "Tushare（你自己的 token）",
    supports: (symbol, market) => market === "cn" || toTsCode(symbol) !== null,
    async fetchCandles(req: KlineRequest) {
      return (await p.fetchDetailed!(req)).candles;
    },
    fetchDetailed: (req: KlineRequest) =>
      fetchTushareCandles(opts.transport, opts.token, { code: req.symbol, interval: req.interval, start: req.start, end: req.end, signal: req.signal }),
  };
  return p;
}
