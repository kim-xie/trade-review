/** 复盘统计联动：按标签 / 策略 / 情绪 / 评分分组（纯函数）。 */
import type { Emotion, Journal, Strategy, Tag } from "./journal";
import { round } from "./money";
import type { ClosedTrade } from "./types";

export interface GroupStats {
  key: string;
  label: string;
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  pnl: number;
  /** 平均盈利 / 平均亏损；无亏损时为 null */
  payoffRatio: number | null;
  avgPnl: number;
  /** 该组亏损交易的亏损合计（负数或 0） */
  lossSum: number;
  color?: string;
}

type T = Pick<ClosedTrade, "id" | "pnl">;

export function groupStats(key: string, label: string, trades: T[], color?: string): GroupStats {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const gp = wins.reduce((s, t) => s + t.pnl, 0);
  const gl = losses.reduce((s, t) => s + t.pnl, 0);
  const avgWin = wins.length ? gp / wins.length : 0;
  const avgLoss = losses.length ? -gl / losses.length : 0;
  const pnl = gp + gl;
  return {
    key,
    label,
    count: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round(wins.length / trades.length, 6) : 0,
    pnl: round(pnl),
    payoffRatio: avgLoss > 0 ? round(avgWin / avgLoss, 4) : null,
    avgPnl: trades.length ? round(pnl / trades.length) : 0,
    lossSum: round(gl),
    color,
  };
}

const byId = <X extends { id: string }>(arr: X[]) => new Map(arr.map((x) => [x.id, x]));

/** 按标签分组（一笔交易有多个标签时在每个标签下各计一次）；未打标签的归入“未打标签” */
export function statsByTag(trades: T[], journals: Record<string, Journal | undefined>, tags: Tag[]): GroupStats[] {
  const tagMap = byId(tags);
  const groups = new Map<string, T[]>();
  for (const t of trades) {
    const ids = (journals[t.id]?.tagIds ?? []).filter((id) => tagMap.has(id));
    for (const id of ids.length ? ids : ["__none"]) {
      const arr = groups.get(id) ?? [];
      arr.push(t);
      groups.set(id, arr);
    }
  }
  return [...groups.entries()]
    .map(([id, arr]) => (id === "__none" ? groupStats(id, "未打标签", arr) : groupStats(id, tagMap.get(id)!.name, arr, tagMap.get(id)!.color)))
    .sort((a, b) => a.pnl - b.pnl);
}

export function statsByStrategy(trades: T[], journals: Record<string, Journal | undefined>, strategies: Strategy[]): GroupStats[] {
  const m = byId(strategies);
  return groupSingle(trades, (t) => {
    const id = journals[t.id]?.strategyId;
    return id && m.has(id) ? [id, m.get(id)!.name] : ["__none", "未选策略"];
  });
}

export function statsByEmotion(trades: T[], journals: Record<string, Journal | undefined>, emotions: Emotion[]): GroupStats[] {
  const m = byId(emotions);
  return groupSingle(trades, (t) => {
    const id = journals[t.id]?.emotionId;
    return id && m.has(id) ? [id, m.get(id)!.name] : ["__none", "未记录情绪"];
  });
}

export function statsByRating(trades: T[], journals: Record<string, Journal | undefined>): GroupStats[] {
  return groupSingle(trades, (t) => {
    const r = journals[t.id]?.rating;
    return r ? [`r${r}`, `${"★".repeat(r)}${"☆".repeat(5 - r)}`] : ["__none", "未评分"];
  }).sort((a, b) => (a.key === "__none" ? 1 : b.key === "__none" ? -1 : b.key.localeCompare(a.key)));
}

function groupSingle(trades: T[], keyOf: (t: T) => [string, string]): GroupStats[] {
  const groups = new Map<string, { label: string; arr: T[] }>();
  for (const t of trades) {
    const [k, label] = keyOf(t);
    const g = groups.get(k) ?? { label, arr: [] };
    g.arr.push(t);
    groups.set(k, g);
  }
  return [...groups.entries()].map(([k, g]) => groupStats(k, g.label, g.arr)).sort((a, b) => b.count - a.count);
}

export interface MistakeImpact {
  /** 带任一错误标签的交易笔数 */
  count: number;
  /** 这些交易中亏损交易的亏损合计（负数；每笔只计一次） */
  lossSum: number;
  /** 这些交易的净盈亏 */
  netPnl: number;
  /** 占全部亏损的比例（0~1；全部亏损为 0 时为 0） */
  shareOfAllLosses: number;
  byTag: GroupStats[];
}

/** 错误标签造成的亏损 */
export function mistakeImpact(trades: T[], journals: Record<string, Journal | undefined>, tags: Tag[]): MistakeImpact {
  const mistakeIds = new Set(tags.filter((t) => t.kind === "mistake").map((t) => t.id));
  const tagged = trades.filter((t) => (journals[t.id]?.tagIds ?? []).some((id) => mistakeIds.has(id)));
  const lossSum = tagged.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0);
  const allLoss = trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0);
  return {
    count: tagged.length,
    lossSum: round(lossSum),
    netPnl: round(tagged.reduce((s, t) => s + t.pnl, 0)),
    shareOfAllLosses: allLoss < 0 ? round(lossSum / allLoss, 6) : 0,
    byTag: statsByTag(tagged, journals, tags.filter((t) => t.kind === "mistake")).filter((g) => g.key !== "__none"),
  };
}
