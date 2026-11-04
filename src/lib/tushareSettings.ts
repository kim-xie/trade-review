/**
 * A 股 K 线数据源设置（只存在本机浏览器 localStorage，可一键清除）。
 * token 属于用户自己的 Tushare 账号；本工具不提供 token、不提供行情数据。
 */
export type CnKlineSource = "auto" | "tushare" | "csv";
export type AdjMode = "none" | "qfq";

export interface TushareSettings {
  token: string;
  /** 代理地址；留空 = 使用站点默认 */
  proxyUrl: string;
  adj: AdjMode;
  cnSource: CnKlineSource;
}

const KEY = "trade-review.tushare.v1";

/** 站点默认代理：NEXT_PUBLIC_TUSHARE_PROXY_URL；否则非静态构建用同源 /api/tushare；静态构建为空（需配置） */
export const DEFAULT_TUSHARE_PROXY_URL =
  process.env.NEXT_PUBLIC_TUSHARE_PROXY_URL || (process.env.NEXT_PUBLIC_STATIC_EXPORT === "1" ? "" : "/api/tushare");

export const DEFAULT_SETTINGS: TushareSettings = { token: "", proxyUrl: "", adj: "none", cnSource: "auto" };

export function loadTushareSettings(): TushareSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<TushareSettings>;
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveTushareSettings(s: TushareSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** 一键清除（token 与所有 Tushare 设置） */
export function clearTushareSettings(): void {
  localStorage.removeItem(KEY);
}

export const effectiveProxyUrl = (s: TushareSettings) => s.proxyUrl.trim() || DEFAULT_TUSHARE_PROXY_URL;

/** A 股“自动”：有 token 用 Tushare，否则本地 CSV */
export function resolveCnSource(s: Pick<TushareSettings, "token" | "cnSource">): "tushare" | "csv" {
  if (s.cnSource === "auto") return s.token.trim() ? "tushare" : "csv";
  return s.cnSource;
}
