"use client";

import { useMemo, useState } from "react";
import {
  buildMonthMatrix,
  buildYearArchive,
  buildYearBreakdown,
  shiftMonth,
  type LockState,
  type PeriodStats,
  type WeekStart,
} from "@/lib/calendar";
import { PRICING } from "@/lib/config";
import type { ClosedTrade } from "@/lib/types";

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const yuan = (n: number) => {
  const s = Math.abs(n).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}¥${s}`;
};
const pnlText = (n: number) => (n > 0 ? "pnl-up" : n < 0 ? "pnl-down" : "text-slate-300");
const rate = (s: PeriodStats) => `${(s.winRate * 100).toFixed(0)}%`;

/** 盈亏底色：红盈绿亏，按本月最大绝对值调节透明度 */
function tint(pnl: number, maxAbs: number): React.CSSProperties | undefined {
  if (!pnl || !maxAbs) return undefined;
  const a = 0.06 + 0.22 * Math.min(1, Math.abs(pnl) / maxAbs);
  const rgb = pnl > 0 ? "248,113,113" : "52,211,153";
  return { backgroundColor: `rgba(${rgb},${a.toFixed(3)})`, borderColor: `rgba(${rgb},0.35)` };
}

const lockedStyle: React.CSSProperties = {
  backgroundImage: "repeating-linear-gradient(135deg, rgba(148,163,184,0.06) 0 6px, transparent 6px 12px)",
};

function Tag({ children, tone = "cyan" }: { children: React.ReactNode; tone?: "cyan" | "amber" | "slate" }) {
  const cls =
    tone === "cyan"
      ? "border-cyan-400/40 text-cyan-300"
      : tone === "amber"
        ? "border-amber-400/40 text-amber-300"
        : "border-white/15 text-slate-500";
  return <span className={`rounded border px-1.5 py-px font-mono text-[10px] tracking-wider ${cls}`}>{children}</span>;
}

function SectionTitle({ code, title, extra }: { code: string; title: string; extra?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <h3 className="font-mono text-sm tracking-wider text-slate-200">
        <span className="text-cyan-400">&gt;</span> {code}
      </h3>
      <span className="text-xs text-slate-500">[{title}]</span>
      {extra}
    </div>
  );
}

function LockedBody({ compact }: { compact?: boolean }) {
  return (
    <div className="mt-1 text-[11px] text-slate-500">
      <span aria-hidden>🔒</span> {compact ? "LOCKED" : "买断解锁"}
    </div>
  );
}

export default function PnlCalendar({
  trades,
  allYears,
  cutoffDate,
  today,
  initialDate,
  weekStartsOn = 0,
}: {
  /** 已按免费窗口截取的已平仓交易 */
  trades: ClosedTrade[];
  /** 全部数据涉及的年份（只用于列出年份，不展示锁定区间的数值） */
  allYears: number[];
  cutoffDate: string | null;
  today: string;
  /** 初始显示的日期（YYYY-MM-DD） */
  initialDate: string;
  weekStartsOn?: WeekStart;
}) {
  const [ym, setYm] = useState(() => ({ year: Number(initialDate.slice(0, 4)), month: Number(initialDate.slice(5, 7)) }));

  const matrix = useMemo(
    () => buildMonthMatrix(ym.year, ym.month, trades, { weekStartsOn, today, cutoffDate }),
    [ym, trades, weekStartsOn, today, cutoffDate],
  );
  const breakdown = useMemo(() => buildYearBreakdown(ym.year, trades, { today, cutoffDate }), [ym.year, trades, today, cutoffDate]);
  const archive = useMemo(
    () => buildYearArchive(trades, { extraYears: [...allYears, Number(today.slice(0, 4)), ym.year], cutoffDate }),
    [trades, allYears, today, ym.year, cutoffDate],
  );
  const maxAbs = Math.max(0, ...matrix.weeks.flatMap((w) => w.days.map((d) => Math.abs(d.stats?.pnl ?? 0))));
  const isCurrentMonth = `${ym.year}-${String(ym.month).padStart(2, "0")}` === today.slice(0, 7);
  const go = (delta: number) => setYm(shiftMonth(ym.year, ym.month, delta));
  const card = "rounded-lg border border-white/10 bg-white/[0.02]";

  const lockTag = (l: LockState) =>
    l === "full" ? <Tag tone="slate">LOCKED</Tag> : l === "partial" ? <Tag tone="amber">PARTIAL</Tag> : null;

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="rounded-xl border border-cyan-400/20 bg-white/[0.03] p-5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500">
          <Tag>SYS.CALENDAR :: ACTIVE</Tag>
          <span>MATRIX: DAILY_PNL_LEDGER</span>
          <span>TZ: Asia/Shanghai</span>
          <span>WEEK_START: {WEEKDAY_LABELS[weekStartsOn]}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">
              <span className="text-gradient font-mono tracking-wider">PROFIT_CALENDAR</span>
              <span className="ml-2 text-sm text-slate-400">盈亏日历 · 按平仓日统计已实现盈亏</span>
            </h2>
            <p className="num mt-1 text-xs text-slate-500">
              {ym.year}年{ym.month}月 · 本月 <span className={pnlText(matrix.stats.pnl)}>{yuan(matrix.stats.pnl)}</span> · {matrix.stats.count} 笔 · 胜率 {rate(matrix.stats)}
            </p>
          </div>
          <nav aria-label="月份切换" className="flex items-center gap-1 font-mono text-xs">
            <button onClick={() => go(-1)} className="rounded border border-white/15 px-3 py-1.5 hover:bg-white/5">[ ‹ 上月 ]</button>
            <button
              onClick={() => setYm({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })}
              className={`rounded border px-3 py-1.5 ${isCurrentMonth ? "border-cyan-400/60 text-cyan-300" : "border-white/15 hover:bg-white/5"}`}
            >
              {ym.year}年{ym.month}月
            </button>
            <button onClick={() => go(1)} className="rounded border border-white/15 px-3 py-1.5 hover:bg-white/5">[ 下月 › ]</button>
          </nav>
        </div>
      </div>

      {cutoffDate && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-4 py-2 text-xs text-amber-200">
          <span aria-hidden>🔒</span> 免费版只展示 <span className="num">{cutoffDate}</span> 之后的数据，更早的日期已锁定。买断（¥{PRICING.lifetimePrice}）解锁全部历史。
        </p>
      )}

      {/* 月度执行矩阵 */}
      <section aria-label="月度执行矩阵" className="rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
        <SectionTitle code="MONTHLY_EXECUTION_MATRIX" title={`${ym.year}年${ym.month}月`} />
        <div className="-mx-4 overflow-x-auto px-4 pb-1">
          <div className="grid min-w-[760px] grid-cols-8 gap-1.5">
            {matrix.weekdays.map((d) => (
              <div key={d} className="rounded border border-white/10 py-1.5 text-center text-xs text-slate-400">{WEEKDAY_LABELS[d]}</div>
            ))}
            <div className="rounded border border-white/10 py-1.5 text-center text-xs text-slate-300">周汇总</div>

            {matrix.weeks.map((w) => (
              <WeekRowCells key={w.start} week={w} maxAbs={maxAbs} card={card} lockTag={lockTag} />
            ))}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 md:hidden">← 左右滑动查看整周 →</p>
      </section>

      {/* 月度绩效分解 */}
      <section aria-label="月度绩效分解" className="rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
        <SectionTitle code="MONTHLY_PERFORMANCE_BREAKDOWN" title={`${ym.year}年度月份统计`} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {[breakdown.months.slice(0, 6), breakdown.months.slice(6)].map((half, hi) => (
            <HalfRow
              key={hi}
              cards={half}
              selected={ym.month}
              onPick={(m) => setYm({ year: ym.year, month: m })}
              summary={hi === 0 ? breakdown.firstHalf : breakdown.secondHalf}
              summaryLock={hi === 0 ? breakdown.firstHalfLock : breakdown.secondHalfLock}
              summaryLabel={hi === 0 ? "1-6月 [上半年]" : "7-12月 [下半年]"}
              card={card}
              lockTag={lockTag}
            />
          ))}
        </div>
      </section>

      {/* 年度归档 */}
      <section aria-label="年度归档" className="rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
        <SectionTitle code="YEARLY_ARCHIVE_DATA" title="年度历史汇总" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {archive.map((y) => {
            const active = y.year === ym.year;
            return (
              <button
                key={y.year}
                onClick={() => setYm({ year: y.year, month: y.year === ym.year ? ym.month : 12 })}
                className={`${card} p-3 text-left hover:border-cyan-400/40 ${active ? "!border-cyan-400/60" : ""}`}
                style={y.lock === "full" ? lockedStyle : tint(y.stats.pnl, Math.abs(y.stats.pnl) * 2)}
              >
                <div className="flex items-center justify-between">
                  <span className="num text-sm">{y.year}年</span>
                  <span className="flex gap-1">{active && <Tag>ACTIVE</Tag>}{lockTag(y.lock)}</span>
                </div>
                {y.lock === "full" ? (
                  <LockedBody />
                ) : y.stats.count ? (
                  <>
                    <div className={`num mt-1 text-base font-semibold ${pnlText(y.stats.pnl)}`}>{yuan(y.stats.pnl)}</div>
                    <div className="num text-[11px] text-slate-400">{y.stats.count}笔 | 胜率 {rate(y.stats)}</div>
                  </>
                ) : (
                  <div className="mt-1 font-mono text-[11px] text-slate-600">NO_DATA</div>
                )}
              </button>
            );
          })}
        </div>
      </section>
      <p className="text-[11px] text-slate-500">日历只统计已平仓交易的已实现盈亏（按平仓日、北京时间归属），不含持仓浮动盈亏。</p>
    </div>
  );
}

function WeekRowCells({
  week,
  maxAbs,
  card,
  lockTag,
}: {
  week: ReturnType<typeof buildMonthMatrix>["weeks"][number];
  maxAbs: number;
  card: string;
  lockTag: (l: LockState) => React.ReactNode;
}) {
  const md = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;
  return (
    <>
      {week.days.map((d) =>
        !d.inMonth ? (
          <div key={d.date} aria-hidden className="min-h-[76px] rounded-lg border border-transparent" />
        ) : (
          <div
            key={d.date}
            className={`${card} min-h-[76px] p-2 ${d.isToday ? "!border-cyan-400/70 ring-1 ring-cyan-400/30" : ""} ${!d.stats && !d.locked ? "opacity-60" : ""}`}
            style={d.locked ? lockedStyle : d.stats ? tint(d.stats.pnl, maxAbs) : undefined}
          >
            <div className="flex items-center justify-between">
              <span className={`num text-xs ${d.isToday ? "text-cyan-300" : "text-slate-400"}`}>{String(d.day).padStart(2, "0")}</span>
              {d.isToday && <Tag>TODAY</Tag>}
            </div>
            {d.locked ? (
              <LockedBody compact />
            ) : d.stats ? (
              <>
                <div className={`num mt-1 text-sm font-semibold ${pnlText(d.stats.pnl)}`}>{yuan(d.stats.pnl)}</div>
                <div className="num text-[10px] text-slate-400">{d.stats.count}笔 | 胜率 {rate(d.stats)}</div>
              </>
            ) : null}
          </div>
        ),
      )}
      <div
        className={`${card} min-h-[76px] p-2 text-center`}
        style={week.lock === "full" ? lockedStyle : week.stats.count ? tint(week.stats.pnl, Math.abs(week.stats.pnl) * 1.5) : undefined}
      >
        <div className="num flex items-center justify-center gap-1 text-[11px] text-slate-400">
          {md(week.start)}-{md(week.end)} {lockTag(week.lock)}
        </div>
        {week.lock === "full" ? (
          <LockedBody compact />
        ) : week.stats.count ? (
          <>
            <div className={`num mt-1 text-sm font-semibold ${pnlText(week.stats.pnl)}`}>{yuan(week.stats.pnl)}</div>
            <div className="num text-[10px] text-slate-400">{week.stats.count}笔 | 胜率 {rate(week.stats)}</div>
          </>
        ) : (
          <div className="mt-1 font-mono text-[10px] text-slate-600">—</div>
        )}
      </div>
    </>
  );
}

function HalfRow({
  cards,
  selected,
  onPick,
  summary,
  summaryLock,
  summaryLabel,
  card,
  lockTag,
}: {
  cards: ReturnType<typeof buildYearBreakdown>["months"];
  selected: number;
  onPick: (m: number) => void;
  summary: PeriodStats;
  summaryLock: LockState;
  summaryLabel: string;
  card: string;
  lockTag: (l: LockState) => React.ReactNode;
}) {
  const maxAbs = Math.max(0, ...cards.map((c) => Math.abs(c.stats?.pnl ?? 0)));
  return (
    <>
      {cards.map((c) => (
        <button
          key={c.key}
          onClick={() => onPick(c.month)}
          className={`${card} min-h-[72px] p-2.5 text-left hover:border-cyan-400/40 ${c.month === selected ? "!border-cyan-400/60" : ""}`}
          style={c.lock === "full" ? lockedStyle : c.stats ? tint(c.stats.pnl, maxAbs) : undefined}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="num text-xs text-slate-300">{c.month}月</span>
            <span className="flex gap-1">{c.isCurrent && <Tag>CURRENT</Tag>}{lockTag(c.lock)}</span>
          </div>
          {c.lock === "full" ? (
            <LockedBody />
          ) : c.stats ? (
            <>
              <div className={`num mt-1 text-sm font-semibold ${pnlText(c.stats.pnl)}`}>{yuan(c.stats.pnl)}</div>
              <div className="num text-[10px] text-slate-400">{c.stats.count}笔 | 胜率 {rate(c.stats)}</div>
            </>
          ) : (
            <div className="mt-1 font-mono text-[10px] text-slate-600">NO_DATA</div>
          )}
        </button>
      ))}
      <div className={`${card} col-span-2 min-h-[72px] p-2.5 sm:col-span-4 lg:col-span-1`} style={summaryLock === "full" ? lockedStyle : undefined}>
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs text-slate-400">{summaryLabel}</span>
          {lockTag(summaryLock)}
        </div>
        {summaryLock === "full" ? (
          <LockedBody />
        ) : summary.count ? (
          <>
            <div className={`num mt-1 text-sm font-semibold ${pnlText(summary.pnl)}`}>{yuan(summary.pnl)}</div>
            <div className="num text-[10px] text-slate-400">{summary.count}笔 | 胜率 {rate(summary)}</div>
          </>
        ) : (
          <div className="mt-1 font-mono text-[10px] text-slate-600">NO_DATA</div>
        )}
      </div>
    </>
  );
}
