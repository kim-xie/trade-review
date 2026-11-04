"use client";

import { useMemo, useState } from "react";
import { currencyUnit, fmtDateTime, fmtMoney, fmtNum, fmtPrice, pnlClass } from "@/lib/format";
import type { Journal } from "@/lib/journal";
import { filterTrades, sortTrades, type SortKey, type TradeFilter } from "@/lib/tradeList";
import type { ClosedTrade } from "@/lib/types";
import type { JournalLib } from "./JournalPanel";

const sel = "rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-200";

export default function TradesTable({
  trades,
  journals,
  lib,
  onReview,
  hiddenCount,
}: {
  trades: ClosedTrade[];
  journals: Record<string, Journal>;
  lib: JournalLib;
  onReview: (t: ClosedTrade) => void;
  hiddenCount: number;
}) {
  const [filter, setFilter] = useState<TradeFilter>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "entry", dir: "desc" });
  const rows = useMemo(() => sortTrades(filterTrades(trades, journals, filter), sort.key, sort.dir, journals), [trades, journals, filter, sort]);
  const tagMap = useMemo(() => new Map(lib.tags.map((t) => [t.id, t])), [lib.tags]);
  const stratMap = useMemo(() => new Map(lib.strategies.map((s) => [s.id, s])), [lib.strategies]);
  const set = (p: Partial<TradeFilter>) => setFilter((f) => ({ ...f, ...p }));
  const active = Object.values(filter).some((v) => v !== undefined && v !== "");

  const Th = ({ k, children, className = "" }: { k?: SortKey; children: React.ReactNode; className?: string }) => (
    <th scope="col" className={`whitespace-nowrap px-3 py-2.5 font-normal ${className}`} aria-sort={k && sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
      {k ? (
        <button
          className={`inline-flex items-center gap-1 hover:text-slate-200 ${sort.key === k ? "text-cyan-300" : ""}`}
          onClick={() => setSort((s) => ({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" }))}
        >
          {children}
          <span className="text-[9px]">{sort.key === k ? (sort.dir === "desc" ? "▼" : "▲") : "↕"}</span>
        </button>
      ) : (
        children
      )}
    </th>
  );

  return (
    <section aria-labelledby="trades" className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-4">
        <h2 id="trades" className="mr-2 font-mono text-sm tracking-wider text-slate-200">
          <span className="text-cyan-400">&gt;</span> TRADE_LEDGER <span className="ml-1 text-xs text-slate-500">[交易列表 · {rows.length}/{trades.length}]</span>
        </h2>
        <input value={filter.code ?? ""} onChange={(e) => set({ code: e.target.value || undefined })} placeholder="代码/名称" className={`${sel} w-28`} aria-label="按代码筛选" />
        <select value={filter.tagId ?? ""} onChange={(e) => set({ tagId: e.target.value || undefined })} className={sel} aria-label="按标签筛选">
          <option value="">全部标签</option>
          {lib.tags.map((t) => <option key={t.id} value={t.id}>{t.kind === "mistake" ? "⚠ " : ""}{t.name}</option>)}
        </select>
        <select value={filter.strategyId ?? ""} onChange={(e) => set({ strategyId: e.target.value || undefined })} className={sel} aria-label="按策略筛选">
          <option value="">全部策略</option>
          {lib.strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filter.emotionId ?? ""} onChange={(e) => set({ emotionId: e.target.value || undefined })} className={sel} aria-label="按情绪筛选">
          <option value="">全部情绪</option>
          {lib.emotions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select
          value={filter.ratingUnset ? "none" : filter.minRating ?? ""}
          onChange={(e) => (e.target.value === "none" ? set({ ratingUnset: true, minRating: undefined }) : set({ ratingUnset: undefined, minRating: Number(e.target.value) || undefined }))}
          className={sel}
          aria-label="按评分筛选"
        >
          <option value="">全部评分</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>≥ {n} 星</option>)}
          <option value="none">未评分</option>
        </select>
        <select value={filter.result ?? ""} onChange={(e) => set({ result: (e.target.value || undefined) as TradeFilter["result"] })} className={sel} aria-label="按盈亏筛选">
          <option value="">盈亏不限</option>
          <option value="win">盈利</option>
          <option value="loss">亏损</option>
          <option value="flat">持平</option>
        </select>
        <select value={filter.direction ?? ""} onChange={(e) => set({ direction: (e.target.value || undefined) as TradeFilter["direction"] })} className={sel} aria-label="按方向筛选">
          <option value="">多空不限</option>
          <option value="long">做多</option>
          <option value="short">做空</option>
        </select>
        {active && <button onClick={() => setFilter({})} className="text-xs text-slate-400 hover:text-slate-200">清除筛选</button>}
        {hiddenCount > 0 && <span className="ml-auto text-[11px] text-amber-300/80">🔒 免费版已隐藏 {hiddenCount} 笔窗口外交易</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-white/[0.02] text-left text-xs text-slate-400">
            <tr className="border-b border-white/10">
              <Th k="entry">开仓时间</Th>
              <Th k="code">品种</Th>
              <Th className="text-right">开仓价</Th>
              <Th k="entryAmount" className="text-right">开仓金额</Th>
              <Th>方向</Th>
              <Th>入场原因</Th>
              <Th className="text-right">平仓价</Th>
              <Th className="text-right">价差</Th>
              <Th k="exit">平仓时间</Th>
              <Th k="pnl" className="text-right">盈亏</Th>
              <Th k="rating">复盘</Th>
              <Th className="text-center">动作</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-10 text-center text-slate-500">{trades.length ? "没有符合筛选条件的交易" : "暂无已平仓交易，先导入成交记录"}</td></tr>
            )}
            {rows.map((t) => {
              const j = journals[t.id];
              const strat = j?.strategyId ? stratMap.get(j.strategyId) : undefined;
              const unit = currencyUnit(t.market);
              const spread = t.exitPrice - t.avgEntryPrice;
              const reason = [strat?.name, j?.entryReason].filter(Boolean);
              return (
                <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.025]">
                  <td className="num whitespace-nowrap px-3 py-2.5 text-slate-300"><DateTimeCell date={t.entryDate} time={t.entryTime} /></td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="num text-slate-200">{t.code}</span>
                    {t.name && t.name !== t.code && <span className="ml-1 text-xs text-slate-500">{t.name}</span>}
                  </td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-right font-semibold text-slate-100">{fmtPrice(t.avgEntryPrice)}</td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-right text-slate-300">{fmtMoney(t.entryAmount, unit)}</td>
                  <td className="px-3 py-2.5">
                    {t.direction === "long" ? (
                      <span className="rounded border border-red-400/30 bg-red-400/10 px-1.5 py-px font-mono text-[10px] text-red-300">▲ BUY</span>
                    ) : (
                      <span className="rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-px font-mono text-[10px] text-emerald-300">▼ SELL</span>
                    )}
                  </td>
                  <td className="max-w-[260px] px-3 py-2.5">
                    {reason.length ? (
                      <div className="truncate text-xs text-slate-300" title={reason.join("：")}>
                        <span className="text-cyan-400">•</span> {strat && <span className="text-slate-100">{strat.name}</span>}
                        {strat && j?.entryReason ? "：" : ""}
                        {j?.entryReason}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                    {!!j?.tagIds?.length && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {j.tagIds.map((id) => tagMap.get(id)).filter(Boolean).map((tag) => (
                          <span key={tag!.id} className="rounded-full border px-1.5 text-[10px]" style={{ borderColor: `${tag!.color}66`, color: tag!.color }}>{tag!.name}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-right text-slate-200">{fmtPrice(t.exitPrice)}</td>
                  <td className={`num whitespace-nowrap px-3 py-2.5 text-right ${spread > 0 ? "pnl-up" : spread < 0 ? "pnl-down" : "text-slate-400"}`}>
                    {spread > 0 ? "+" : ""}{fmtPrice(spread, t.exitPrice)}
                  </td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-slate-400"><DateTimeCell date={t.exitDate} time={t.exitTime} /></td>
                  <td className={`num whitespace-nowrap px-3 py-2.5 text-right font-semibold ${pnlClass(t.pnl)}`}>
                    {fmtMoney(t.pnl, unit, true)}
                    <div className="text-[10px] font-normal opacity-70">{t.returnPct > 0 ? "+" : ""}{fmtNum(t.returnPct * 100)}%</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                    {j?.rating ? <span className="text-amber-300">{"★".repeat(j.rating)}<span className="text-slate-700">{"★".repeat(5 - j.rating)}</span></span> : <span className="text-slate-600">未复盘</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => onReview(t)}
                      className="whitespace-nowrap rounded border border-cyan-400/50 bg-cyan-400/5 px-2.5 py-1 font-mono text-xs text-cyan-300 hover:bg-cyan-400/15"
                    >
                      [ K线复盘 ]
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DateTimeCell({ date, time }: { date: string; time?: string }) {
  const d = fmtDateTime(date);
  if (!time) return <>{d}</>;
  return (
    <span className="leading-tight">
      <span className="block">{d}</span>
      <span className="block text-[11px] text-slate-500">{time}</span>
    </span>
  );
}
