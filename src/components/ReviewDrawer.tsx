"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmtDateTime, fmtMoney, fmtPrice, currencyUnit, pnlClass } from "@/lib/format";
import { emptyJournal, type Journal } from "@/lib/journal";
import { INTERVALS, type Candle, type Interval } from "@/lib/kline/types";
import { computeWindow, detectInterval, pickInterval, toEpochMs, tradeMarkers, otherMarkers } from "@/lib/kline/window";
import { DISCLAIMER } from "@/lib/site";
import type { ClosedTrade, Fill } from "@/lib/types";
import JournalPanel, { type JournalLib, type LibActions } from "./JournalPanel";
import type { PriceLine } from "./KlineChart";
import type { KlineSource } from "@/lib/kline/service";
import { loadChartSettings, type ColorScheme } from "@/lib/chartSettings";

const KlineChart = dynamic(() => import("./KlineChart"), {
  ssr: false,
  loading: () => <div className="h-full min-h-[320px] animate-pulse rounded-lg bg-white/[0.02]" />,
});

type Status = { kind: "idle" | "loading" | "ok" | "empty" | "error"; message?: string; source?: string; fromCache?: boolean; notice?: string };
const SOURCE_LABEL: Record<string, string> = { binance: "Binance", okx: "OKX", csv: "本地 CSV", tushare: "Tushare（你的账号）" };

export default function ReviewDrawer({
  trade,
  fills,
  journal,
  lib,
  actions,
  onSaved,
  onClose,
}: {
  trade: ClosedTrade;
  fills: Fill[];
  journal: Journal | undefined;
  lib: JournalLib;
  actions: LibActions;
  onSaved: (j: Journal) => void;
  onClose: () => void;
}) {
  const crypto = trade.market === "crypto";
  const unit = currencyUnit(trade.market);
  const fallbackTime = crypto ? "00:00:00" : "15:00:00";
  const entryMs = toEpochMs(trade.entryDate, trade.entryTime, 8, crypto ? "00:00:00" : "09:30:00");
  const exitMs = toEpochMs(trade.exitDate, trade.exitTime, 8, fallbackTime);
  const hasTime = !!(trade.entryTime && trade.exitTime);

  const [interval, setIntervalState] = useState<Interval>(() => (crypto && hasTime ? pickInterval(exitMs - entryMs) : "1d"));
  const [source, setSource] = useState<KlineSource>("auto");
  const [chartInterval, setChartInterval] = useState<Interval>(interval);
  const [adjust, setAdjust] = useState<{ fn?: (ms: number, p: number) => number }>({});
  const [colorScheme, setColorScheme] = useState<ColorScheme>("red-up");
  useEffect(() => setColorScheme(loadChartSettings().colorScheme), []);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [reload, setReload] = useState(0);

  // ---------- 复盘草稿 + 自动保存 ----------
  const [draft, setDraft] = useState<Journal>(() => journal ?? emptyJournal(trade.id));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(async () => {
      const { saveJournal } = await import("@/lib/db");
      await saveJournal(draft);
      onSaved(draft);
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
    }, 400);
    return () => clearTimeout(t);
  }, [draft, onSaved]);
  const onChange = (j: Journal) => {
    dirty.current = true;
    setDraft(j);
  };

  // ---------- K 线 ----------
  const win = useMemo(() => computeWindow(entryMs, exitMs, interval), [entryMs, exitMs, interval]);
  useEffect(() => {
    const ac = new AbortController();
    setStatus({ kind: "loading" });
    (async () => {
      try {
        const { loadCandles } = await import("@/lib/kline/service");
        const ts = await import("@/lib/tushareSettings");
        const settings = ts.loadTushareSettings();
        // A 股“自动”：有 token 用 Tushare，否则本地 CSV；加密“自动”：Binance → OKX
        const effective: KlineSource = crypto ? source : source === "auto" ? ts.resolveCnSource(settings) : source;
        const r = await loadCandles({
          symbol: trade.code,
          interval,
          start: win.start,
          end: win.end,
          source: effective,
          signal: ac.signal,
          tushare: { token: settings.token, proxyUrl: ts.effectiveProxyUrl(settings), adj: settings.adj },
        });
        if (ac.signal.aborted) return;
        setCandles(r.candles);
        setChartInterval(r.interval ?? interval);
        setAdjust({ fn: r.adjust });
        const notice = [r.notice, r.adjust ? "已前复权（买卖点与价位线已换算到同一口径）" : ""].filter(Boolean).join(" ");
        setStatus(r.candles.length ? { kind: "ok", source: r.source, fromCache: r.fromCache, notice } : { kind: effective === "csv" ? "empty" : "error", source: r.source, message: effective === "csv" ? undefined : "该区间没有返回 K 线（可能停牌、代码不支持或日期超出范围）", notice });
      } catch (e) {
        if (ac.signal.aborted) return;
        setCandles([]);
        setStatus({ kind: "error", message: (e as Error)?.message ?? String(e), source: (e as Error)?.name === "TushareError" ? "tushare" : undefined });
      }
    })();
    return () => ac.abort();
  }, [trade.code, interval, win.start, win.end, source, reload]);

  const markers = useMemo(() => {
    const own = tradeMarkers(trade, fills);
    const all = [...otherMarkers(trade, fills, own), ...own];
    return adjust.fn ? all.map((m) => ({ ...m, price: adjust.fn!(m.ms, m.price) })) : all;
  }, [trade, fills, adjust]);
  const lines = useMemo<PriceLine[]>(() => {
    // 前复权时：开仓价按开仓日、平仓/止损/目标按平仓日换算（止损/目标为近似）
    const a = adjust.fn ?? ((_ms: number, p: number) => p);
    const l: PriceLine[] = [
      { price: a(entryMs, trade.avgEntryPrice), label: "开仓", color: "#22d3ee" },
      { price: a(exitMs, trade.exitPrice), label: "平仓", color: "#f59e0b" },
    ];
    if (draft.stopLoss) l.push({ price: a(entryMs, draft.stopLoss), label: "止损", color: "#f43f5e" });
    if (draft.takeProfit) l.push({ price: a(entryMs, draft.takeProfit), label: "目标", color: "#a3e635" });
    return l;
  }, [trade.avgEntryPrice, trade.exitPrice, draft.stopLoss, draft.takeProfit, adjust, entryMs, exitMs]);
  const holding = useMemo(() => ({ start: entryMs, end: exitMs }), [entryMs, exitMs]);

  // ESC 关闭；锁定背景滚动
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const onCsv = async (file: File) => {
    try {
      setStatus({ kind: "loading" });
      const Papa = (await import("papaparse")).default;
      const { decodeText } = await import("@/lib/import/decode");
      const { text } = decodeText(new Uint8Array(await file.arrayBuffer()));
      const rows = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" }).data;
      const { parseOhlcRows } = await import("@/lib/kline/csv");
      const { candles: parsed, errors } = parseOhlcRows(rows);
      if (!parsed.length) throw new Error("文件里没有可识别的 K 线");
      const iv = detectInterval(parsed);
      const { importCsvCandles } = await import("@/lib/kline/service");
      await importCsvCandles(trade.code, iv, parsed);
      setSource("csv");
      setIntervalState(iv);
      setReload((n) => n + 1);
      if (errors) console.warn(`OHLC 导入：跳过 ${errors} 行`);
    } catch (e) {
      setStatus({ kind: "error", message: (e as Error).message });
    }
  };

  const spread = trade.exitPrice - trade.avgEntryPrice;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={`K线复盘 ${trade.code}`}>
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative ml-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden border-l border-cyan-400/20 bg-slate-950 shadow-2xl">
        {/* 头部 */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 px-4 py-3">
          <h2 className="font-mono text-sm tracking-wider">
            <span className="text-cyan-400">&gt;</span> KLINE_REVIEW <span className="ml-2 text-slate-100">{trade.name ?? trade.code}</span>
            <span className="ml-1 text-slate-500">{trade.code}</span>
          </h2>
          <span className={`rounded px-1.5 py-px font-mono text-[10px] ${trade.direction === "long" ? "bg-red-400/15 text-red-300" : "bg-emerald-400/15 text-emerald-300"}`}>
            {trade.direction === "long" ? "▲ BUY 做多" : "▼ SELL 做空"}
          </span>
          <span className="num text-xs text-slate-400">
            {fmtDateTime(trade.entryDate, trade.entryTime)} → {fmtDateTime(trade.exitDate, trade.exitTime)}
          </span>
          <span className="num text-xs text-slate-400">
            {fmtPrice(trade.avgEntryPrice)} → {fmtPrice(trade.exitPrice)}（{spread >= 0 ? "+" : ""}{fmtPrice(spread, trade.exitPrice)}）
          </span>
          <span className={`num text-sm font-semibold ${pnlClass(trade.pnl)}`}>{fmtMoney(trade.pnl, unit, true)}</span>
          <button onClick={onClose} className="ml-auto rounded border border-white/15 px-3 py-1 font-mono text-xs hover:bg-white/5" aria-label="关闭">[ 关闭 ESC ]</button>
        </header>

        <div data-scroll-body className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[1fr_380px] lg:overflow-hidden">
          {/* 左：K 线 */}
          <section className="flex min-h-[460px] shrink-0 flex-col border-b border-white/10 p-3 lg:min-h-0 lg:border-b-0 lg:border-r">
            <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-xs">
              <div className="flex overflow-hidden rounded border border-white/10" role="group" aria-label="周期">
                {INTERVALS.map((iv) => (
                  <button
                    key={iv}
                    onClick={() => setIntervalState(iv)}
                    className={`px-2.5 py-1 ${iv === interval ? "bg-cyan-400/15 text-cyan-300" : "text-slate-400 hover:bg-white/5"}`}
                    aria-pressed={iv === interval}
                  >
                    {iv}
                  </button>
                ))}
              </div>
              <select value={source} onChange={(e) => setSource(e.target.value as KlineSource)} className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-slate-300" aria-label="数据源">
                {crypto ? (
                  <>
                    <option value="auto">自动（Binance → OKX）</option>
                    <option value="binance">Binance</option>
                    <option value="okx">OKX</option>
                  </>
                ) : (
                  <>
                    <option value="auto">自动（有 token 用 Tushare，否则本地 CSV）</option>
                    <option value="tushare">Tushare（你的 token）</option>
                  </>
                )}
                <option value="csv">本地导入 OHLC</option>
              </select>
              <label className="cursor-pointer rounded border border-white/10 px-2 py-1 text-slate-400 hover:bg-white/5">
                导入 OHLC CSV
                <input type="file" accept=".csv,.txt,.tsv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsv(f); e.target.value = ""; }} />
              </label>
              <span className="text-[10px] text-slate-500">
                {status.kind === "loading" && "加载中…"}
                {status.kind === "ok" && `数据源：${SOURCE_LABEL[status.source ?? ""] ?? status.source}${status.fromCache ? "（本地缓存）" : ""} · ${candles.length} 根${chartInterval !== interval ? ` · 实际周期 ${chartInterval}` : ""}`}
              </span>
              {status.notice && <span className="w-full text-[11px] text-amber-300/90" role="status">{status.notice}</span>}
            </div>
            <div className="relative min-h-[360px] flex-1 rounded-lg border border-white/10 bg-white/[0.02]">
              {status.kind === "ok" ? (
                <KlineChart candles={candles} interval={chartInterval} markers={markers} lines={lines} holding={holding} colorScheme={colorScheme} />
              ) : status.kind === "loading" || status.kind === "idle" ? (
                <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-slate-500">LOADING_KLINES…</div>
              ) : (
                <EmptyState crypto={crypto} error={status.kind === "error" ? status.message : undefined} hasTime={hasTime} triedTushare={status.source === "tushare"} />
              )}
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span><span className="text-cyan-300">▲B</span> 买入成交</span>
              <span><span className="text-amber-300">▼S</span> 卖出成交</span>
              <span>淡色小写 b/s = 同品种其他成交（不属于本笔）</span>
              <span>虚线：开仓均价 · 平仓价 · 止损/目标（填写后显示）</span>
              <span>{colorScheme === "red-up" ? "红涨绿跌" : "绿涨红跌"}（可在“设置”切换）· 北京时间</span>
              <span>
                图表：
                <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="text-slate-400 underline-offset-2 hover:underline">
                  TradingView Lightweight Charts™
                </a>
              </span>
            </p>
          </section>

          {/* 右：复盘面板 */}
          <aside className="shrink-0 p-4 lg:min-h-0 lg:overflow-y-auto">
            <JournalPanel value={draft} onChange={onChange} lib={lib} actions={actions} savedAt={savedAt} />
            <p className="mt-6 text-[11px] text-slate-600">{DISCLAIMER}</p>
          </aside>
        </div>
      </div>
    </div>
  , document.body);
}

function EmptyState({ crypto, error, hasTime, triedTushare }: { crypto: boolean; error?: string; hasTime: boolean; triedTushare?: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="font-mono text-xs tracking-wider text-slate-500">NO_KLINE_DATA</div>
      {error && <p className="max-w-md text-xs text-rose-300/80">加载失败：{error}</p>}
      {crypto ? (
        <p className="max-w-md text-sm text-slate-400">没能从 Binance / OKX 获取这段时间的 K 线（网络受限或交易对不存在）。可以切换数据源重试，或导入你自己的 OHLC CSV。</p>
      ) : (
        <p className="max-w-md text-sm text-slate-400">
          {triedTushare
            ? "Tushare 没有返回可用的 K 线。可以检查“设置”里的 token 与权限，或导入你自己的 OHLC CSV。"
            : "A 股 K 线有两种方式：① 在工具页“设置”标签填写你自己的 Tushare token（数据由你的账号提供）；② 从行情软件导出该股票的 K 线，点上方“导入 OHLC CSV”。"}
        </p>
      )}
      <p className="max-w-md text-[11px] text-slate-500">
        CSV 表头示例：<code className="rounded bg-white/5 px-1">日期,时间,开盘,最高,最低,收盘,成交量</code>（或 time,open,high,low,close,volume；时间为北京时间）。导入后会自动识别周期并缓存在本地。
        {!hasTime && " 这笔交易没有成交时间，K 线按日线显示。"}
      </p>
    </div>
  );
}
