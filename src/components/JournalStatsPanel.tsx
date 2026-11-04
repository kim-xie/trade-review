"use client";

import { useMemo } from "react";
import { fmtMoney, fmtNum, pnlClass, unitFor } from "@/lib/format";
import type { Journal } from "@/lib/journal";
import { mistakeImpact, statsByEmotion, statsByRating, statsByStrategy, statsByTag, type GroupStats } from "@/lib/journalStats";
import type { ClosedTrade } from "@/lib/types";
import type { JournalLib } from "./JournalPanel";

export default function JournalStatsPanel({ trades, journals, lib }: { trades: ClosedTrade[]; journals: Record<string, Journal>; lib: JournalLib }) {
  const unit = unitFor(trades.map((t) => t.market));
  const data = useMemo(
    () => ({
      mistake: mistakeImpact(trades, journals, lib.tags),
      tag: statsByTag(trades, journals, lib.tags),
      strategy: statsByStrategy(trades, journals, lib.strategies),
      emotion: statsByEmotion(trades, journals, lib.emotions),
      rating: statsByRating(trades, journals),
    }),
    [trades, journals, lib],
  );
  const m = data.mistake;

  return (
    <section aria-labelledby="journal-stats" className="space-y-4">
      <h2 id="journal-stats" className="text-lg font-medium">复盘统计</h2>
      <div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.04] p-5">
        <div className="font-mono text-[11px] tracking-wider text-rose-300/80">MISTAKE_COST · 错误标签造成的亏损</div>
        <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <div className={`num text-2xl font-semibold ${pnlClass(m.lossSum)}`}>{fmtMoney(m.lossSum, unit, true)}</div>
            <div className="text-xs text-slate-400">{m.count} 笔带错误标签 · 净盈亏 <span className={`num ${pnlClass(m.netPnl)}`}>{fmtMoney(m.netPnl, unit, true)}</span></div>
          </div>
          <div>
            <div className="num text-2xl font-semibold text-slate-100">{fmtNum(m.shareOfAllLosses * 100, 1)}%</div>
            <div className="text-xs text-slate-400">占全部亏损</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {m.byTag.map((g) => (
              <span key={g.key} className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: `${g.color}66`, color: g.color }}>
                {g.label} <span className="num">{g.count}笔 {fmtMoney(g.lossSum, unit, true)}</span>
              </span>
            ))}
          </div>
        </div>
        {m.count === 0 && <p className="mt-2 text-xs text-slate-500">在“交易列表 → K线复盘”里给交易打上错误标签后，这里会汇总它们的亏损。</p>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <GroupTable title="按标签" rows={data.tag} unit={unit} />
        <GroupTable title="按策略" rows={data.strategy} unit={unit} />
        <GroupTable title="按入场情绪" rows={data.emotion} unit={unit} />
        <GroupTable title="按执行评分" rows={data.rating} unit={unit} />
      </div>
      {!unit && <p className="text-[11px] text-slate-500">提示：当前数据包含多种结算货币（如 ¥ 与 USDT），合计金额未做换算，仅供参考。</p>}
    </section>
  );
}

function GroupTable({ title, rows, unit }: { title: string; rows: GroupStats[]; unit: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="mb-2 text-sm text-slate-300">{title}</h3>
      <table className="num w-full min-w-[420px] text-xs">
        <thead className="text-left text-slate-500">
          <tr className="border-b border-white/10">
            {["分组", "笔数", "胜率", "盈亏合计", "盈亏比"].map((h) => <th key={h} scope="col" className="px-2 py-1.5 font-normal">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-slate-600">暂无数据</td></tr>}
          {rows.map((g) => (
            <tr key={g.key} className="border-b border-white/5">
              <td className="px-2 py-1.5 font-sans">
                {g.color && <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: g.color }} />}
                <span className={g.key === "__none" ? "text-slate-500" : "text-slate-200"}>{g.label}</span>
              </td>
              <td className="px-2 py-1.5">{g.count}</td>
              <td className="px-2 py-1.5">{fmtNum(g.winRate * 100, 1)}%</td>
              <td className={`px-2 py-1.5 ${pnlClass(g.pnl)}`}>{fmtMoney(g.pnl, unit, true)}</td>
              <td className="px-2 py-1.5">{g.payoffRatio == null ? "—" : fmtNum(g.payoffRatio)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
