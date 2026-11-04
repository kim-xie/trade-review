"use client";

import { useEffect, useState } from "react";
import { DEFAULT_CHART_SETTINGS, loadChartSettings, saveChartSettings, type ChartSettings } from "@/lib/chartSettings";
import {
  clearTushareSettings,
  DEFAULT_SETTINGS,
  DEFAULT_TUSHARE_PROXY_URL,
  effectiveProxyUrl,
  loadTushareSettings,
  saveTushareSettings,
  type TushareSettings,
} from "@/lib/tushareSettings";

const card = "rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur";
const input = "w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/60";

export const TUSHARE_COMPLIANCE = "数据由你自己的 Tushare 账号提供，请遵守 Tushare 用户协议；本工具不提供行情数据。";

type TestState = { kind: "idle" | "testing" | "ok" | "error"; message?: string };

export default function SettingsPanel() {
  const [s, setS] = useState<TushareSettings>(DEFAULT_SETTINGS);
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  const [chart, setChart] = useState<ChartSettings>(DEFAULT_CHART_SETTINGS);
  useEffect(() => {
    setS(loadTushareSettings());
    setChart(loadChartSettings());
  }, []);

  const update = (patch: Partial<TushareSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveTushareSettings(next);
    setSaved(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
  };

  const clearAll = async () => {
    if (!confirm("清除本机保存的 Tushare token 与设置，并删除 Tushare K 线缓存？")) return;
    clearTushareSettings();
    const { clearCachedSource } = await import("@/lib/db");
    const n = await clearCachedSource("tushare");
    setS({ ...DEFAULT_SETTINGS });
    setSaved(null);
    setTest({ kind: "ok", message: `已清除 token 与设置，删除 ${n} 根缓存 K 线。` });
  };

  const runTest = async () => {
    setTest({ kind: "testing" });
    try {
      const t = await import("@/lib/kline/tushare");
      const proxy = effectiveProxyUrl(s);
      if (!proxy) throw new t.TushareError("proxy", "没有可用的代理地址：静态部署需要配置 NEXT_PUBLIC_TUSHARE_PROXY_URL，或在下方填写。");
      if (!s.token.trim()) throw new t.TushareError("token", "请先填写 token。");
      const transport = t.createProxyTransport(proxy);
      const end = Date.now();
      const r = await t.fetchTushareCandles(transport, s.token.trim(), { code: "000001", interval: "1d", start: end - 20 * 86_400_000, end });
      const mins = await t
        .fetchTushareCandles(transport, s.token.trim(), { code: "000001", interval: "5m", start: end - 3 * 86_400_000, end })
        .catch(() => null);
      const extra = mins == null ? "分钟数据：测试失败。" : mins.notice ? "分钟数据：无权限（复盘时将显示日线）。" : `分钟数据：可用（${mins.candles.length} 根 5 分钟 K 线）。`;
      setTest({ kind: "ok", message: `连接成功：平安银行（000001.SZ）近 20 天日线 ${r.candles.length} 根。${extra}` });
    } catch (e) {
      setTest({ kind: "error", message: (e as Error).message });
    }
  };

  return (
    <section aria-labelledby="settings-cn" className="space-y-6">
      <div className={`${card} p-6`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="settings-cn" className="font-mono text-sm tracking-wider">
            <span className="text-cyan-400">&gt;</span> CN_KLINE_SOURCE <span className="ml-2 font-sans text-base text-slate-100">A 股 K 线数据源</span>
          </h2>
          {saved && <span className="font-mono text-[11px] text-slate-500">已保存到本机 {saved}</span>}
        </div>
        <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-sm text-amber-200/90">
          {TUSHARE_COMPLIANCE}
          <a className="ml-1 text-cyan-300 underline-offset-2 hover:underline" href="https://tushare.pro/document/1?doc_id=405" target="_blank" rel="noopener noreferrer">
            Tushare 数据服务协议
          </a>
        </p>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">默认数据源</span>
            <select className={input} value={s.cnSource} onChange={(e) => update({ cnSource: e.target.value as TushareSettings["cnSource"] })}>
              <option value="auto">自动：有 token 用 Tushare，否则本地 CSV</option>
              <option value="tushare">Tushare（你自己的 token）</option>
              <option value="csv">只用本地导入的 OHLC CSV</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">复权</span>
            <select className={input} value={s.adj} onChange={(e) => update({ adj: e.target.value as TushareSettings["adj"] })}>
              <option value="none">不复权（与交割单成交价一致，推荐）</option>
              <option value="qfq">前复权（需要 2000 积分的 adj_factor）</option>
            </select>
          </label>
          <div className="text-sm md:col-span-2">
            <label htmlFor="ts-token" className="mb-1 block text-slate-400">
              Tushare token <span className="text-xs text-slate-500">（在 tushare.pro 个人主页 → 接口 TOKEN 获取；只保存在本机浏览器 localStorage）</span>
            </label>
            <div className="flex gap-2">
              <input
                id="ts-token"
                className={`${input} font-mono`}
                type={show ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                placeholder="粘贴你自己的 token"
                value={s.token}
                onChange={(e) => update({ token: e.target.value.trim() })}
              />
              <button type="button" onClick={() => setShow((v) => !v)} className="shrink-0 rounded-lg border border-white/10 px-3 text-xs text-slate-300 hover:bg-white/5">
                {show ? "隐藏" : "显示"}
              </button>
            </div>
          </div>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block text-slate-400">
              代理地址 <span className="text-xs text-slate-500">（留空使用站点默认：{DEFAULT_TUSHARE_PROXY_URL || "未配置"}）</span>
            </span>
            <input className={`${input} font-mono`} placeholder={DEFAULT_TUSHARE_PROXY_URL || "https://tushare-proxy.example.workers.dev"} value={s.proxyUrl} onChange={(e) => update({ proxyUrl: e.target.value.trim() })} />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={runTest} disabled={test.kind === "testing"} className="rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-60">
            {test.kind === "testing" ? "测试中…" : "测试连接"}
          </button>
          <button onClick={clearAll} className="rounded-lg border border-rose-400/30 px-4 py-2 text-sm text-rose-200 hover:bg-rose-400/10">
            一键清除 token 与缓存
          </button>
          {test.message && (
            <span role="status" className={`text-sm ${test.kind === "error" ? "text-rose-300" : "text-emerald-300"}`}>
              {test.message}
            </span>
          )}
        </div>
      </div>

      <div className={`${card} p-6`}>
        <h2 className="font-mono text-sm tracking-wider">
          <span className="text-cyan-400">&gt;</span> CHART <span className="ml-2 font-sans text-base text-slate-100">K 线图表</span>
        </h2>
        <label className="mt-4 block max-w-sm text-sm">
          <span className="mb-1 block text-slate-400">涨跌颜色</span>
          <select
            className={input}
            value={chart.colorScheme}
            onChange={(e) => {
              const next = { ...chart, colorScheme: e.target.value as ChartSettings["colorScheme"] };
              setChart(next);
              saveChartSettings(next);
            }}
          >
            <option value="red-up">红涨绿跌（A 股习惯）</option>
            <option value="green-up">绿涨红跌（国际 / 加密习惯）</option>
          </select>
        </label>
        <p className="mt-3 text-xs text-slate-500">
          K 线复盘图表使用{" "}
          <a className="text-cyan-300 hover:underline" href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a>{" "}
          Lightweight Charts™（Apache-2.0）。TradingView Lightweight Charts™ Copyright (c) 2025 TradingView, Inc. https://www.tradingview.com/
        </p>
      </div>

      <div className={`${card} p-6 text-sm leading-relaxed text-slate-400`}>
        <h3 className="mb-2 text-slate-200">说明</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>我们不提供 Tushare token、不转售行情数据。K 线由你的 Tushare 账号按你的权限获取，仅在你的浏览器里显示和缓存（IndexedDB）。</li>
          <li>
            浏览器无法直接访问 api.tushare.pro（该接口不返回跨域 CORS 头），请求会经过本站的透传代理：只转发白名单接口（daily、fund_daily、adj_factor、stk_mins、trade_cal），不记录、不存储 token。
          </li>
          <li>
            股票日线 daily 需 120 积分起，ETF 日线 fund_daily 需至少 5000 积分；前复权需要 adj_factor（2000 积分）；分钟 K 线 stk_mins 需要在 Tushare 单独开通“A股历史分钟”权限，没有权限时复盘自动改为日线。参见
            <a className="mx-1 text-cyan-300 hover:underline" href="https://tushare.pro/document/1?doc_id=290" target="_blank" rel="noopener noreferrer">积分与频次权限表</a>、
            <a className="mx-1 text-cyan-300 hover:underline" href="https://tushare.pro/document/2?doc_id=370" target="_blank" rel="noopener noreferrer">stk_mins 文档</a>。
          </li>
          <li>不想用 Tushare 时，在 K 线复盘里点“导入 OHLC CSV”导入你从行情软件导出的 K 线即可。</li>
        </ul>
      </div>
    </section>
  );
}
