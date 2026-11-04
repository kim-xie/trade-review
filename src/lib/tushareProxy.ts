/**
 * Tushare 极简透传代理（Next.js route handler 与 Cloudflare Worker 共用）。
 *
 * 为什么需要：api.tushare.pro 不返回 CORS 头（2026-11-04 实测 OPTIONS/POST 都没有 Access-Control-Allow-Origin），
 * 浏览器无法直连；官方示例里的 http://api.tushare.pro 在 https 站点上还会被当作混合内容拦截。
 *
 * 安全约束：
 * - 只转发到 https://api.tushare.pro，只允许白名单 api_name 与参数键；请求体大小受限。
 * - 校验 Origin（白名单 / 同源），拒绝无 Origin 的请求。
 * - 简单的每 IP 每分钟限流（内存计数，单实例有效）。
 * - 不记录、不存储 token：不打印日志，不写任何存储，响应 Cache-Control: no-store。
 */
import { TUSHARE_ALLOWED_APIS, TUSHARE_ENDPOINT } from "./kline/tushare";

export const ALLOWED_PARAM_KEYS = ["ts_code", "start_date", "end_date", "trade_date", "freq", "exchange", "is_open"] as const;
export const MAX_BODY_BYTES = 4096;

export interface ProxyOptions {
  /** 允许的 Origin 列表（如 https://example.com）；为空时只允许与请求同源 */
  allowedOrigins: string[];
  fetchImpl?: typeof fetch;
  limiter?: RateLimiter;
  upstream?: string;
  timeoutMs?: number;
}

export interface ProxyInput {
  method: string;
  url: string;
  origin: string | null;
  ip: string;
  bodyText: () => Promise<string>;
}

export interface ProxyOutput {
  status: number;
  headers: Record<string, string>;
  body: string | null;
}

export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(
    private limit = 60,
    private windowMs = 60_000,
    private now: () => number = Date.now,
  ) {}
  allow(key: string): boolean {
    const t = this.now();
    const e = this.hits.get(key);
    if (!e || t >= e.reset) {
      if (this.hits.size > 10_000) this.hits.clear();
      this.hits.set(key, { n: 1, reset: t + this.windowMs });
      return true;
    }
    e.n += 1;
    return e.n <= this.limit;
  }
}

export function parseAllowedOrigins(v: string | undefined | null): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function isOriginAllowed(origin: string | null, requestUrl: string, allowed: string[]): boolean {
  if (!origin) return false;
  const o = origin.replace(/\/+$/, "");
  if (allowed.includes("*")) return true;
  if (allowed.includes(o)) return true;
  try {
    return new URL(requestUrl).origin === o;
  } catch {
    return false;
  }
}

export type ValidBody = { api_name: string; token: string; params: Record<string, string>; fields: string };

/** 校验并“重建”请求体：只保留白名单字段，任何多余内容都丢弃 */
export function validateBody(raw: unknown): { ok: true; body: ValidBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "请求体必须是 JSON 对象" };
  const r = raw as Record<string, unknown>;
  if (typeof r.api_name !== "string" || !(TUSHARE_ALLOWED_APIS as readonly string[]).includes(r.api_name))
    return { ok: false, error: `api_name 不在白名单（只允许 ${TUSHARE_ALLOWED_APIS.join(", ")}）` };
  if (typeof r.token !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(r.token)) return { ok: false, error: "token 格式不正确" };
  const params: Record<string, string> = {};
  if (r.params !== undefined) {
    if (!r.params || typeof r.params !== "object" || Array.isArray(r.params)) return { ok: false, error: "params 必须是对象" };
    for (const [k, v] of Object.entries(r.params as Record<string, unknown>)) {
      if (!(ALLOWED_PARAM_KEYS as readonly string[]).includes(k)) return { ok: false, error: `不允许的参数 ${k}` };
      if (typeof v !== "string" || v.length > 64) return { ok: false, error: `参数 ${k} 格式不正确` };
      params[k] = v;
    }
  }
  const fields = r.fields === undefined ? "" : r.fields;
  if (typeof fields !== "string" || !/^[a-z0-9_,]{0,256}$/.test(fields)) return { ok: false, error: "fields 格式不正确" };
  return { ok: true, body: { api_name: r.api_name, token: r.token, params, fields } };
}

const json = (status: number, obj: unknown, extra: Record<string, string> = {}): ProxyOutput => ({
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  body: JSON.stringify(obj),
});

export async function handleTushareProxy(input: ProxyInput, opts: ProxyOptions): Promise<ProxyOutput> {
  const allowed = isOriginAllowed(input.origin, input.url, opts.allowedOrigins);
  const cors: Record<string, string> = allowed
    ? { "Access-Control-Allow-Origin": input.origin!, Vary: "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" }
    : { Vary: "Origin" };

  if (input.method === "OPTIONS") return { status: allowed ? 204 : 403, headers: cors, body: null };
  if (input.method !== "POST") return json(405, { error: "只支持 POST" }, { ...cors, Allow: "POST, OPTIONS" });
  if (!allowed) return json(403, { error: "来源（Origin）不在白名单" }, cors);
  if (opts.limiter && !opts.limiter.allow(input.ip || "unknown")) return json(429, { error: "请求太频繁，请稍后再试" }, { ...cors, "Retry-After": "60" });

  const text = await input.bodyText();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json(413, { error: "请求体过大" }, cors);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json(400, { error: "请求体不是合法 JSON" }, cors);
  }
  const v = validateBody(raw);
  if (!v.ok) return json(400, { error: v.error }, cors);

  const f = opts.fetchImpl ?? fetch;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 25_000);
  try {
    const res = await f(opts.upstream ?? TUSHARE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v.body),
      signal: ac.signal,
    });
    const body = await res.text();
    return { status: res.ok ? 200 : 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors }, body: res.ok ? body : JSON.stringify({ error: `Tushare 上游返回 HTTP ${res.status}` }) };
  } catch {
    return json(502, { error: "连接 Tushare 失败或超时" }, cors);
  } finally {
    clearTimeout(timer);
  }
}
