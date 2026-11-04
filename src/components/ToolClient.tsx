"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { matchFifo } from "@/lib/fifo";
import { applyFreeTierWindow, FREE_TIER_NOTICE } from "@/lib/freeTier";
import { computeStats, buildEquityCurve } from "@/lib/stats";
import { freeLicenseProvider } from "@/lib/license";
import { DISCLAIMER } from "@/lib/site";
import { formatDateInZone } from "@/lib/dates";
import PnlCalendar from "./PnlCalendar";
import TradesTable from "./TradesTable";
import JournalStatsPanel from "./JournalStatsPanel";
import ReviewDrawer from "./ReviewDrawer";
import SettingsPanel from "./SettingsPanel";
import type { JournalLib, LibActions } from "./JournalPanel";
import { BUILTIN_EMOTIONS, BUILTIN_TAGS, type Journal } from "@/lib/journal";
import type { ClosedTrade } from "@/lib/types";
import type { Fill } from "@/lib/types";
import type { ParsedFile } from "@/lib/import/parseFile";
import {
  autoMap,
  detectPreset,
  FIELD_LABELS,
  FIELD_ORDER,
  getPreset,
  PRESETS,
  type FieldKey,
  type Mapping,
} from "@/lib/import/presets";
import { missingRequired, normalizeRows } from "@/lib/import/normalize";

const EquityChart = dynamic(() => import("./EquityChart"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-lg bg-white/[0.02]" />,
});

const SAMPLE_URL = "/samples/sample-generic.csv";
const SAMPLE_CRYPTO_URL = "/samples/sample-crypto.csv";
type Tab = "overview" | "trades" | "calendar" | "settings";
const TABS: [Tab, string][] = [
  ["overview", "总览 OVERVIEW"],
  ["trades", "交易列表 TRADES"],
  ["calendar", "盈亏日历 CALENDAR"],
  ["settings", "设置 SETTINGS"],
];
const card = "rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur";

interface PendingImport {
  fileName: string;
  parsed: ParsedFile;
  presetId: string;
  mapping: Mapping;
  isSample: boolean;
}

const fmt = (n: number, d = 2) => n.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(2)}%`);
const pnlClass = (n: number) => (n > 0 ? "pnl-up" : n < 0 ? "pnl-down" : "text-slate-300");

export default function ToolClient() {
  const [fills, setFills] = useState<Fill[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [initialCapital, setInitialCapital] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");
  const [journals, setJournals] = useState<Record<string, Journal>>({});
  const [lib, setLib] = useState<JournalLib>({ tags: BUILTIN_TAGS, strategies: [], emotions: BUILTIN_EMOTIONS });
  const [reviewing, setReviewing] = useState<ClosedTrade | null>(null);

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      setTab(h === "calendar" || h === "trades" || h === "settings" ? h : "overview");
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const switchTab = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", t === "overview" ? window.location.pathname : `#${t}`);
  };

  const reloadJournal = useCallback(async () => {
    const { loadJournalData } = await import("@/lib/db");
    const d = await loadJournalData();
    setJournals(d.journals);
    setLib({ tags: d.tags, strategies: d.strategies, emotions: d.emotions });
  }, []);
  useEffect(() => {
    reloadJournal().catch((e) => setError(String(e)));
  }, [reloadJournal]);

  const actions = useMemo<LibActions>(() => {
    const wrap = <A extends unknown[]>(fn: (db: typeof import("@/lib/db"), ...a: A) => Promise<void>) =>
      async (...a: A) => {
        const db = await import("@/lib/db");
        await fn(db, ...a);
        await reloadJournal();
      };
    return {
      putTag: wrap((db, t) => db.putTag(t)),
      deleteTag: wrap((db, id) => db.deleteTag(id)),
      putStrategy: wrap((db, s) => db.putStrategy(s)),
      deleteStrategy: wrap((db, id) => db.deleteStrategy(id)),
      putEmotion: wrap((db, e) => db.putEmotion(e)),
      deleteEmotion: wrap((db, id) => db.deleteEmotion(id)),
    };
  }, [reloadJournal]);
  const onJournalSaved = useCallback((j: Journal) => setJournals((m) => ({ ...m, [j.tradeId]: j })), []);

  const reload = useCallback(async () => {
    const { loadFills } = await import("@/lib/db");
    setFills(await loadFills());
    setLoaded(true);
  }, []);

  useEffect(() => {
    reload().catch((e) => setError(String(e)));
    freeLicenseProvider.getStatus().then((s) => setIsPro(s.isPro));
  }, [reload]);

  const startImport = useCallback(async (bytes: Uint8Array, fileName: string, isSample: boolean) => {
    setError(null);
    setMessage(null);
    try {
      const { parseFileBytes } = await import("@/lib/import/parseFile");
      const parsed = await parseFileBytes(bytes);
      const { preset } = detectPreset(parsed.headers);
      setPending({ fileName, parsed, presetId: preset.id, mapping: autoMap(parsed.headers, preset), isSample });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onFile = async (file: File) => {
    await startImport(new Uint8Array(await file.arrayBuffer()), file.name, false);
  };

  const onSample = async (url = SAMPLE_URL) => {
    const res = await fetch(url);
    await startImport(new Uint8Array(await res.arrayBuffer()), `${url.split("/").pop()}（示例数据）`, true);
  };

  const preview = useMemo(() => {
    if (!pending) return null;
    const source = pending.isSample ? "sample" : pending.presetId;
    return normalizeRows(pending.parsed.headers, pending.parsed.rows, pending.mapping, source, getPreset(pending.presetId).defaultMarket);
  }, [pending]);

  const confirmImport = async () => {
    if (!pending || !preview) return;
    const { saveFills, getDb } = await import("@/lib/db");
    if (!pending.isSample) {
      // 导入真实数据时清掉示例数据，避免混在一起
      const db = getDb();
      await db.fills.where("id").startsWith("sample_").delete();
    }
    const added = await saveFills(preview.fills, {
      fileName: pending.fileName,
      presetId: pending.presetId,
      importedAt: new Date().toISOString(),
      rowCount: pending.parsed.rows.length,
      skippedCount: preview.skipped.length,
    });
    setMessage(`导入完成：新增 ${added} 条，重复跳过 ${preview.fills.length - added} 条，非成交/无法识别 ${preview.skipped.length} 条。`);
    setPending(null);
    await reload();
  };

  const clearData = async () => {
    if (!confirm("确定清空本地所有成交记录？此操作不可撤销。")) return;
    const { clearAll } = await import("@/lib/db");
    await clearAll();
    setMessage("已清空本地数据。");
    await reload();
  };

  const analysis = useMemo(() => {
    const fifo = matchFifo(fills);
    const demoOnly = fills.length > 0 && fills.every((f) => f.id.startsWith("sample_"));
    const windowed = applyFreeTierWindow(fifo.closedTrades, new Date(), isPro, {
      basis: demoOnly ? "latestTrade" : undefined,
    });
    const trades = windowed.items;
    return {
      fifo,
      demoOnly,
      windowed,
      trades: [...trades].sort((a, b) => (a.exitDate < b.exitDate ? 1 : -1)),
      windowTrades: trades,
      allYears: [...new Set(fifo.closedTrades.map((t) => Number(t.exitDate.slice(0, 4))))],
      stats: computeStats(trades, initialCapital),
      curve: buildEquityCurve(trades, initialCapital),
    };
  }, [fills, isPro, initialCapital]);

  const today = formatDateInZone(new Date());

  return (
    <div className="mt-8 space-y-8">
      {!isPro && (
        <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/[0.06] px-4 py-3 text-sm text-cyan-200">
          {FREE_TIER_NOTICE}
          {analysis.windowed.cutoffDate && (
            <span className="num ml-2 text-cyan-300/70">
              （当前窗口 {analysis.windowed.cutoffDate} ~ {analysis.windowed.anchorDate}
              {analysis.demoOnly ? "，示例数据以其最新日期为基准" : ""}
              {analysis.windowed.hiddenCount > 0 ? `，已隐藏 ${analysis.windowed.hiddenCount} 笔更早的交易` : ""}）
            </span>
          )}
        </div>
      )}

      {/* 导入 */}
      <section aria-labelledby="import" className={`${card} p-6`}>
        <h2 id="import" className="text-lg font-medium">导入成交记录</h2>
        <p className="mt-1 text-sm text-slate-400">
          支持 CSV / TXT / XLS / XLSX，自动识别 UTF-8 与 GBK 编码、逗号或制表符分隔，以及表头前的说明行。文件只在本机解析。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2 text-sm font-medium text-slate-950 hover:opacity-90">
            选择文件
            <input
              type="file"
              accept=".csv,.txt,.tsv,.xls,.xlsx"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <button onClick={() => onSample(SAMPLE_URL)} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
            载入 A 股示例
          </button>
          <button onClick={() => onSample(SAMPLE_CRYPTO_URL)} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
            载入加密分钟级示例
          </button>
          {fills.length > 0 && (
            <button onClick={clearData} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-400 hover:bg-white/5">
              清空本地数据
            </button>
          )}
          <a href={SAMPLE_URL} download className="text-sm text-slate-400 underline-offset-4 hover:underline">
            下载通用模板（示例数据）
          </a>
        </div>
        {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}
        {message && <p className="mt-4 text-sm text-slate-300">{message}</p>}
      </section>

      {pending && preview && (
        <MappingPanel pending={pending} setPending={setPending} preview={preview} onConfirm={confirmImport} />
      )}

      <div role="tablist" aria-label="视图" className="flex gap-1 border-b border-white/10 font-mono text-sm">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => switchTab(k)}
            className={`-mb-px border-b-2 px-4 py-2 ${tab === k ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "trades" && loaded && (
        <TradesTable
          trades={analysis.windowTrades}
          journals={journals}
          lib={lib}
          onReview={setReviewing}
          hiddenCount={analysis.windowed.hiddenCount}
        />
      )}

      {reviewing && (
        <ReviewDrawer
          key={reviewing.id}
          trade={reviewing}
          fills={fills}
          journal={journals[reviewing.id]}
          lib={lib}
          actions={actions}
          onSaved={onJournalSaved}
          onClose={() => setReviewing(null)}
        />
      )}

      {tab === "settings" && <SettingsPanel />}

      {tab === "calendar" && loaded && (
        <PnlCalendar
          key={analysis.windowed.anchorDate ?? today}
          trades={analysis.windowTrades}
          allYears={analysis.allYears}
          cutoffDate={analysis.windowed.cutoffDate}
          today={today}
          initialDate={analysis.windowed.anchorDate ?? today}
        />
      )}

      {tab === "overview" && (
        <>
      {/* 统计 */}
      <section aria-labelledby="stats" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="stats" className="text-lg font-medium">基础统计</h2>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            初始资金（用于回撤比例）
            <input
              type="number"
              min={0}
              value={initialCapital || ""}
              placeholder="0"
              onChange={(e) => setInitialCapital(Number(e.target.value) || 0)}
              className="num w-32 rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-right text-slate-100"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="已平仓笔数" value={String(analysis.stats.totalTrades)} />
          <Stat label="胜率" value={pct(analysis.stats.winRate)} />
          <Stat label="盈亏比" value={analysis.stats.payoffRatio == null ? "—" : fmt(analysis.stats.payoffRatio)} />
          <Stat label="利润因子" value={analysis.stats.profitFactor == null ? "—" : fmt(analysis.stats.profitFactor)} />
          <Stat label="净盈亏" value={fmt(analysis.stats.netPnl)} cls={pnlClass(analysis.stats.netPnl)} />
          <Stat label="最大回撤" value={fmt(analysis.stats.drawdown.maxDrawdown)} sub={pct(analysis.stats.drawdown.maxDrawdownPct)} />
          <Stat label="总费用" value={fmt(analysis.stats.totalFees)} />
          <Stat label="平均持仓天数" value={fmt(analysis.stats.avgHoldingDays, 1)} />
        </div>
        <div className={`${card} p-4`}>
          <h3 className="mb-2 text-sm text-slate-400">资金曲线（累计已实现盈亏，不含浮动盈亏）</h3>
          {loaded && <EquityChart data={analysis.curve} />}
        </div>
      </section>

      {analysis.fifo.unmatchedSells.length > 0 && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200">
          有 {analysis.fifo.unmatchedSells.length} 笔卖出找不到对应买入（可能买入早于导入区间），这部分未计入盈亏：
          <span className="num ml-1">
            {analysis.fifo.unmatchedSells.slice(0, 5).map((u) => `${u.code} ${u.date} ×${u.quantity}`).join("；")}
            {analysis.fifo.unmatchedSells.length > 5 ? " …" : ""}
          </span>
        </div>
      )}

      <JournalStatsPanel trades={analysis.windowTrades} journals={journals} lib={lib} />

      <section aria-labelledby="open" className={`${card} overflow-x-auto p-4`}>
        <h2 id="open" className="mb-3 text-lg font-medium">未平仓持仓</h2>
        <table className="num w-full min-w-[600px] text-sm">
          <thead className="text-left text-xs text-slate-400">
            <tr className="border-b border-white/10">
              {["代码", "名称", "方向", "持仓数量", "含费成本", "含费均价", "批次"].map((h) => (
                <th key={h} scope="col" className="px-2 py-2 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analysis.fifo.openPositions.length === 0 && (
              <tr><td colSpan={7} className="px-2 py-6 text-center text-slate-500">暂无未平仓持仓</td></tr>
            )}
            {analysis.fifo.openPositions.map((p) => (
              <tr key={p.code} className="border-b border-white/5">
                <td className="px-2 py-2">{p.code}</td>
                <td className="px-2 py-2 font-sans">{p.name ?? ""}</td>
                <td className="px-2 py-2 font-sans text-xs">{p.direction === "long" ? "做多" : "做空"}</td>
                <td className="px-2 py-2">{+p.quantity.toFixed(8)}</td>
                <td className="px-2 py-2">{fmt(p.costBasis)}</td>
                <td className="px-2 py-2">{fmt(p.avgCost, 3)}</td>
                <td className="px-2 py-2 text-xs text-slate-400">
                  {p.lots.map((l) => `${l.date}${l.time ? " " + l.time : ""} ${+l.quantity.toFixed(8)}/${+l.originalQuantity.toFixed(8)}@${l.price}`).join("，")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

        </>
      )}

      <p className="text-xs text-slate-500">{DISCLAIMER} 统计仅基于你导入的历史成交记录，不代表未来表现。</p>
    </div>
  );
}

function Stat({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className={`${card} p-4`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`num mt-1 text-xl font-semibold ${cls ?? "text-slate-100"}`}>{value}</div>
      {sub && <div className="num text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function MappingPanel({
  pending,
  setPending,
  preview,
  onConfirm,
}: {
  pending: PendingImport;
  setPending: (p: PendingImport | null) => void;
  preview: ReturnType<typeof normalizeRows>;
  onConfirm: () => void;
}) {
  const preset = getPreset(pending.presetId);
  const missing = missingRequired(pending.mapping);
  const { headers } = pending.parsed;

  const aliasStatus = (field: FieldKey, header: string | undefined) => {
    if (!header) return null;
    const a = (preset.fields[field] ?? []).find((x) => x.header === header);
    if (!a) return <span className="text-slate-500">手动</span>;
    return a.status === "confirmed" ? (
      <span className="text-cyan-300" title={a.source}>已确认</span>
    ) : (
      <span className="text-amber-300" title={a.note}>待确认</span>
    );
  };

  return (
    <section aria-labelledby="mapping" className={`${card} p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="mapping" className="text-lg font-medium">字段映射：{pending.fileName}</h2>
        <div className="text-xs text-slate-400">
          {pending.parsed.kind === "text"
            ? `文本 · 编码 ${pending.parsed.encoding} · 分隔符 ${pending.parsed.delimiter === "\t" ? "Tab" : pending.parsed.delimiter}`
            : `Excel · 工作表 ${pending.parsed.sheetName}`}
          {` · 表头在第 ${pending.parsed.headerRowIndex + 1} 行 · ${pending.parsed.rows.length} 行数据`}
        </div>
      </div>

      <label className="mt-4 flex items-center gap-3 text-sm">
        券商预设
        <select
          value={pending.presetId}
          onChange={(e) => {
            const p = getPreset(e.target.value);
            setPending({ ...pending, presetId: p.id, mapping: autoMap(headers, p) });
          }}
          className="rounded-md border border-white/10 bg-slate-900 px-2 py-1"
        >
          {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <span className="text-xs text-slate-500">{preset.description}</span>
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FIELD_ORDER.map((field) => (
          <label key={field} className="flex flex-col gap-1 text-xs text-slate-400">
            <span className="flex justify-between">
              {FIELD_LABELS[field]}
              {aliasStatus(field, pending.mapping[field])}
            </span>
            <select
              value={pending.mapping[field] ?? ""}
              onChange={(e) => setPending({ ...pending, mapping: { ...pending.mapping, [field]: e.target.value || undefined } })}
              className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-sm text-slate-100"
            >
              <option value="">（不使用）</option>
              {headers.map((h, i) => <option key={`${h}-${i}`} value={h}>{h || `(第${i + 1}列)`}</option>)}
            </select>
          </label>
        ))}
      </div>

      {missing.length > 0 && (
        <p className="mt-4 text-sm text-rose-400">缺少必填字段：{missing.map((f) => FIELD_LABELS[f]).join("、")}（价格与成交金额至少一个）</p>
      )}

      <div className="mt-6 overflow-x-auto">
        <h3 className="mb-2 text-sm text-slate-400">
          预览：识别 {preview.fills.length} 条成交，跳过 {preview.skipped.length} 条
        </h3>
        <table className="num w-full min-w-[720px] text-xs">
          <thead className="text-left text-slate-500">
            <tr>{["日期", "时间", "代码", "名称", "方向", "数量", "价格", "金额", "费用"].map((h) => <th key={h} className="px-2 py-1 font-normal">{h}</th>)}</tr>
          </thead>
          <tbody>
            {preview.fills.slice(0, 8).map((f) => (
              <tr key={f.id} className="border-t border-white/5">
                <td className="px-2 py-1">{f.date}</td>
                <td className="px-2 py-1">{f.time ?? ""}</td>
                <td className="px-2 py-1">{f.code}</td>
                <td className="px-2 py-1 font-sans">{f.name ?? ""}</td>
                <td className={`px-2 py-1 font-sans ${f.side === "buy" ? "pnl-up" : "pnl-down"}`}>{f.side === "buy" ? "买入" : "卖出"}</td>
                <td className="px-2 py-1">{f.quantity}</td>
                <td className="px-2 py-1">{f.price}</td>
                <td className="px-2 py-1">{f.amount}</td>
                <td className="px-2 py-1">{fmt(f.fees.commission + f.fees.stampTax + f.fees.transferFee + f.fees.otherFee)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {preview.skipped.length > 0 && (
          <details className="mt-3 text-xs text-slate-400">
            <summary className="cursor-pointer">查看跳过的行</summary>
            <ul className="mt-2 space-y-1">
              {preview.skipped.slice(0, 20).map((s) => (
                <li key={s.rowIndex}>第 {s.rowIndex + 1} 行：{s.reason}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <button
          disabled={missing.length > 0 || preview.fills.length === 0}
          onClick={onConfirm}
          className="rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
        >
          确认导入 {preview.fills.length} 条
        </button>
        <button onClick={() => setPending(null)} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
          取消
        </button>
      </div>
    </section>
  );
}
