import { describe, expect, it } from "vitest";
import {
  applyQfq,
  classifyTushareError,
  dailyToCandles,
  factorAt,
  fetchTushareCandles,
  minsToCandles,
  parseAdjFactors,
  parseTushareResponse,
  toTsCode,
  isFundCode,
  TushareError,
  type TushareTransport,
} from "../src/lib/kline/tushare";
import { toEpochMs } from "../src/lib/kline/window";
import { handleTushareProxy, isOriginAllowed, parseAllowedOrigins, RateLimiter, validateBody } from "../src/lib/tushareProxy";
import { resolveCnSource } from "../src/lib/tushareSettings";

const TOKEN = "abcdef1234567890";

describe("toTsCode", () => {
  it.each([
    ["600000", "600000.SH"],
    ["601318", "601318.SH"],
    ["603288", "603288.SH"],
    ["605499", "605499.SH"],
    ["688981", "688981.SH"],
    ["689009", "689009.SH"],
    ["900901", "900901.SH"],
    ["000001", "000001.SZ"],
    ["1", "000001.SZ"],
    ["002594", "002594.SZ"],
    ["003816", "003816.SZ"],
    ["300750", "300750.SZ"],
    ["301269", "301269.SZ"],
    ["200002", "200002.SZ"],
    ["830799", "830799.BJ"],
    ["871981", "871981.BJ"],
    ["430047", "430047.BJ"],
    ["920001", "920001.BJ"],
    ["600000.sh", "600000.SH"],
    ["SZ000001", "000001.SZ"],
    ["sh.600000", "600000.SH"],
    ["600000.SS", "600000.SH"],
    ["510300", "510300.SH"],
    ["588000", "588000.SH"],
    ["159915", "159915.SZ"],
  ])("%s → %s", (code, ts) => expect(toTsCode(code)).toBe(ts));
  it("无法识别的代码返回 null", () => {
    expect(toTsCode("BTCUSDT")).toBeNull();
    expect(toTsCode("")).toBeNull();
  });
});

describe("响应解析", () => {
  const daily = {
    code: 0,
    msg: "",
    data: {
      fields: ["trade_date", "open", "high", "low", "close", "vol"],
      items: [
        ["20261030", 10.2, 10.5, 10.1, 10.4, 1234.5],
        ["20261029", 10.0, 10.3, 9.9, 10.2, 1000],
      ],
    },
  };
  it("daily fields/items → 日 K（升序，北京 00:00，手→股）", () => {
    const c = dailyToCandles(parseTushareResponse(daily, "daily"));
    expect(c).toHaveLength(2);
    expect(c[0]).toEqual({ t: toEpochMs("2026-10-29"), o: 10, h: 10.3, l: 9.9, c: 10.2, v: 100000 });
    expect(c[1].v).toBeCloseTo(123450);
  });
  it("stk_mins trade_time 为结束时间 → t = 开盘时间", () => {
    const t = { fields: ["trade_time", "open", "high", "low", "close", "vol"], items: [["2026-10-30 09:31:00", 7, 7.1, 6.9, 7.05, 1000], ["2026-10-30 09:32:00", 7.05, 7.1, 7, 7.08, 800]] };
    const c = minsToCandles(t, 60_000);
    expect(c[0].t).toBe(toEpochMs("2026-10-30", "09:30:00"));
    expect(c[1].c).toBe(7.08);
  });
  it("字段顺序不同也能解析", () => {
    const c = dailyToCandles({ fields: ["close", "trade_date", "vol", "open", "low", "high"], items: [[5, "20261030", 1, 4, 3.5, 6]] });
    expect(c[0]).toMatchObject({ o: 4, h: 6, l: 3.5, c: 5, v: 100 });
  });
});

describe("错误码处理", () => {
  it("40101 token 错误（实测返回格式）", () => {
    const real = { request_id: "", code: 40101, data: null, msg: "您的token不对，请确认。", detail: "" };
    expect(() => parseTushareResponse(real)).toThrowError(/token 无效/);
    try {
      parseTushareResponse(real);
    } catch (e) {
      expect((e as TushareError).kind).toBe("token");
    }
  });
  it("40101 + JSON 格式错误 → params；未上传 token → token", () => {
    expect(classifyTushareError(40101, "不是合格的json格式，EOF").kind).toBe("params");
    expect(classifyTushareError(40101, "您上传Token！").kind).toBe("token");
  });
  it("权限不足（2002 / 40203 / 文案）", () => {
    expect(classifyTushareError(2002, "没有权限").kind).toBe("permission");
    expect(classifyTushareError(40203, "抱歉，您没有接口访问权限").kind).toBe("permission");
    expect(classifyTushareError(40203, "抱歉，您没有接口访问权限", "stk_mins").message).toMatch(/A股历史分钟/);
  });
  it("限频与日总量", () => {
    expect(classifyTushareError(40203, "抱歉，您每分钟最多访问该接口50次，详情访问：https://tushare.pro/document/1?doc_id=108。").kind).toBe("rate");
    expect(classifyTushareError(40203, "抱歉，您每天最多访问该接口8000次").kind).toBe("quota");
  });
  it("代理拒绝", () => {
    expect(() => parseTushareResponse({ error: "来源（Origin）不在白名单" })).toThrowError(/代理拒绝/);
  });
});

describe("前复权", () => {
  const candles = [
    { t: toEpochMs("2026-10-28"), o: 20, h: 21, l: 19, c: 20, v: 1 },
    { t: toEpochMs("2026-10-29"), o: 10, h: 10.5, l: 9.5, c: 10, v: 1 },
    { t: toEpochMs("2026-10-30"), o: 10, h: 11, l: 9, c: 10, v: 1 },
  ];
  // 10-29 除权（10 送 10），因子翻倍
  const factors = parseAdjFactors({ fields: ["trade_date", "adj_factor"], items: [["20261028", 1], ["20261029", 2], ["20261030", 2]] });
  it("价格 × 当日因子 ÷ 末日因子", () => {
    const q = applyQfq(candles, factors);
    expect(q.candles[0]).toMatchObject({ o: 10, h: 10.5, l: 9.5, c: 10 });
    expect(q.candles[2]).toEqual(candles[2]);
    expect(q.adjust(toEpochMs("2026-10-28", "10:00:00"), 20.4)).toBe(10.2);
    expect(q.adjust(toEpochMs("2026-10-30", "10:00:00"), 10.4)).toBe(10.4);
  });
  it("缺失日期用之前最近的因子；无因子不调整", () => {
    expect(factorAt(factors, "2026-10-31")).toBe(2);
    expect(factorAt(factors, "2026-10-01")).toBe(1);
    expect(applyQfq(candles, new Map()).candles).toBe(candles);
  });
});

describe("fetchTushareCandles（mock transport）", () => {
  const ok = (fields: string[], items: unknown[][]) => ({ code: 0, msg: "", data: { fields, items } });
  it("日线请求格式", async () => {
    const calls: unknown[] = [];
    const t: TushareTransport = async (body) => {
      calls.push(body);
      return ok(["trade_date", "open", "high", "low", "close", "vol"], [["20261030", 1, 2, 0.5, 1.5, 10]]);
    };
    const r = await fetchTushareCandles(t, TOKEN, { code: "600000", interval: "1d", start: toEpochMs("2026-10-01"), end: toEpochMs("2026-10-30", "15:00:00") });
    expect(r.interval).toBe("1d");
    expect(calls[0]).toEqual({ api_name: "daily", token: TOKEN, params: { ts_code: "600000.SH", start_date: "20261001", end_date: "20261030" }, fields: "trade_date,open,high,low,close,vol" });
  });
  it("分钟：freq 映射与时间格式；无权限时降级日线并提示", async () => {
    const calls: { api_name: string; params: Record<string, string> }[] = [];
    const t: TushareTransport = async (body) => {
      calls.push(body);
      if (body.api_name === "stk_mins") return { code: 40203, msg: "抱歉，您没有接口访问权限", data: null };
      return ok(["trade_date", "open", "high", "low", "close", "vol"], [["20261030", 1, 2, 0.5, 1.5, 10]]);
    };
    const r = await fetchTushareCandles(t, TOKEN, { code: "300750", interval: "15m", start: toEpochMs("2026-10-30", "09:30:00"), end: toEpochMs("2026-10-30", "15:00:00") });
    expect(calls[0].params).toMatchObject({ ts_code: "300750.SZ", freq: "15min", start_date: "2026-10-30 09:30:00", end_date: "2026-10-30 15:00:00" });
    expect(r.interval).toBe("1d");
    expect(r.notice).toBe("你的 Tushare 账号无分钟权限，已显示日线。");
    expect(r.candles).toHaveLength(1);
  });
  it("ETF 日线走 fund_daily", async () => {
    const apis: string[] = [];
    const t: TushareTransport = async (body) => {
      apis.push(body.api_name);
      return ok(["trade_date", "open", "high", "low", "close", "vol"], [["20261030", 1, 2, 0.5, 1.5, 10]]);
    };
    await fetchTushareCandles(t, TOKEN, { code: "510300", interval: "1d", start: 0, end: 86_400_000 });
    expect(apis).toEqual(["fund_daily"]);
    expect(isFundCode("510300.SH")).toBe(true);
    expect(isFundCode("600000.SH")).toBe(false);
  });
  it("4h 用 60min 重采样；token 错误直接抛出", async () => {
    const t: TushareTransport = async (body) => {
      expect(body.params.freq).toBe("60min");
      return ok(["trade_time", "open", "high", "low", "close", "vol"], [["2026-10-30 10:30:00", 1, 2, 0.5, 1.5, 10], ["2026-10-30 11:30:00", 1.5, 3, 1, 2, 5]]);
    };
    const r = await fetchTushareCandles(t, TOKEN, { code: "600000", interval: "4h", start: toEpochMs("2026-10-30"), end: toEpochMs("2026-10-31") });
    expect(r.candles).toHaveLength(1);
    expect(r.candles[0]).toMatchObject({ o: 1, h: 3, l: 0.5, c: 2, v: 15 });
    const bad: TushareTransport = async () => ({ code: 40101, msg: "您的token不对，请确认。", data: null });
    await expect(fetchTushareCandles(bad, TOKEN, { code: "600000", interval: "1d", start: 0, end: 1 })).rejects.toMatchObject({ kind: "token" });
  });
});

describe("透传代理", () => {
  const base = { method: "POST", url: "https://site.example/api/tushare", origin: "https://site.example", ip: "1.2.3.4" };
  const body = (o: unknown) => ({ ...base, bodyText: async () => JSON.stringify(o) });
  const good = { api_name: "daily", token: TOKEN, params: { ts_code: "600000.SH", start_date: "20261001" }, fields: "trade_date,open" };

  it("白名单 api_name 与参数键", () => {
    expect(validateBody(good).ok).toBe(true);
    for (const api of ["stock_basic", "pro_bar", "user", "daily_basic", "", undefined]) expect(validateBody({ ...good, api_name: api }).ok).toBe(false);
    expect(validateBody({ ...good, params: { ts_code: "x", limit: "1" } }).ok).toBe(false);
    expect(validateBody({ ...good, token: "bad token!" }).ok).toBe(false);
    expect(validateBody({ ...good, fields: "a;drop" }).ok).toBe(false);
  });
  it("只转发重建后的请求体到 api.tushare.pro，响应 no-store", async () => {
    const seen: { url: string; body: string }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, body: String(init.body) });
      return new Response(JSON.stringify({ code: 0, msg: "", data: { fields: [], items: [] } }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await handleTushareProxy(body({ ...good, extra: "x" }), { allowedOrigins: [], fetchImpl });
    expect(out.status).toBe(200);
    expect(out.headers["Cache-Control"]).toBe("no-store");
    expect(out.headers["Access-Control-Allow-Origin"]).toBe("https://site.example");
    expect(seen[0].url).toBe("https://api.tushare.pro");
    expect(JSON.parse(seen[0].body)).toEqual(good);
  });
  it("拒绝：非白名单接口 400、外来 Origin 403、无 Origin 403、GET 405、超大请求 413", async () => {
    const fetchImpl = (async () => new Response("{}")) as unknown as typeof fetch;
    expect((await handleTushareProxy(body({ ...good, api_name: "stock_basic" }), { allowedOrigins: [], fetchImpl })).status).toBe(400);
    expect((await handleTushareProxy({ ...body(good), origin: "https://evil.example" }, { allowedOrigins: [], fetchImpl })).status).toBe(403);
    expect((await handleTushareProxy({ ...body(good), origin: null }, { allowedOrigins: [], fetchImpl })).status).toBe(403);
    expect((await handleTushareProxy({ ...body(good), method: "GET" }, { allowedOrigins: [], fetchImpl })).status).toBe(405);
    expect((await handleTushareProxy({ ...base, bodyText: async () => "x".repeat(5000) }, { allowedOrigins: [], fetchImpl })).status).toBe(413);
  });
  it("白名单 Origin 与预检", async () => {
    const allowed = parseAllowedOrigins("https://a.example/, http://localhost:3000");
    expect(allowed).toEqual(["https://a.example", "http://localhost:3000"]);
    expect(isOriginAllowed("https://a.example", "https://proxy.workers.dev/", allowed)).toBe(true);
    expect(isOriginAllowed("https://b.example", "https://proxy.workers.dev/", allowed)).toBe(false);
    const pre = await handleTushareProxy({ ...body(good), method: "OPTIONS", origin: "https://a.example", url: "https://proxy.workers.dev/" }, { allowedOrigins: allowed });
    expect(pre.status).toBe(204);
    expect(pre.headers["Access-Control-Allow-Methods"]).toContain("POST");
  });
  it("限流：超过每分钟次数返回 429，窗口过后恢复", async () => {
    let now = 0;
    const limiter = new RateLimiter(2, 60_000, () => now);
    const fetchImpl = (async () => new Response("{}")) as unknown as typeof fetch;
    const run = () => handleTushareProxy(body(good), { allowedOrigins: [], fetchImpl, limiter });
    expect((await run()).status).toBe(200);
    expect((await run()).status).toBe(200);
    expect((await run()).status).toBe(429);
    now = 60_001;
    expect((await run()).status).toBe(200);
  });
});

describe("A 股自动数据源", () => {
  it("有 token 用 Tushare，否则 CSV；手动选择优先", () => {
    expect(resolveCnSource({ token: "", cnSource: "auto" })).toBe("csv");
    expect(resolveCnSource({ token: TOKEN, cnSource: "auto" })).toBe("tushare");
    expect(resolveCnSource({ token: TOKEN, cnSource: "csv" })).toBe("csv");
  });
});

import { createProxyTransport } from "../src/lib/kline/tushare";
describe("代理传输层错误", () => {
  const mk = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const call = (f: typeof fetch) => createProxyTransport("/api/tushare", f)({ api_name: "daily", token: TOKEN, params: {}, fields: "" });
  it("429 → rate，403 → proxy，502 → network，网络错误 → network", async () => {
    await expect(call(mk(429, { error: "x" }))).rejects.toMatchObject({ kind: "rate" });
    await expect(call(mk(403, { error: "来源（Origin）不在白名单" }))).rejects.toMatchObject({ kind: "proxy" });
    await expect(call(mk(502, { error: "连接 Tushare 失败或超时" }))).rejects.toMatchObject({ kind: "network" });
    await expect(call((async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch)).rejects.toMatchObject({ kind: "network" });
  });
});
