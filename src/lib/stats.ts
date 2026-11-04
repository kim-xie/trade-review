import { round } from "./money";
import type { ClosedTrade } from "./types";

export interface EquityPoint {
  date: string;
  /** 当日已实现盈亏合计 */
  dailyPnl: number;
  /** 累计已实现盈亏 */
  cumulativePnl: number;
  /** 权益 = 初始资金 + 累计已实现盈亏 */
  equity: number;
}

export interface DrawdownResult {
  /** 最大回撤金额（正数） */
  maxDrawdown: number;
  /** 最大回撤比例（相对峰值权益）；未设置初始资金（≤0）时为 null，避免“相对累计盈利”的误导性比例 */
  maxDrawdownPct: number | null;
  peakDate: string | null;
  troughDate: string | null;
}

export interface BasicStats {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** 胜率 = 盈利笔数 / 总笔数（0~1） */
  winRate: number;
  grossProfit: number;
  grossLoss: number; // 正数
  netPnl: number;
  avgWin: number;
  avgLoss: number; // 正数
  /** 盈亏比 = 平均盈利 / 平均亏损；没有亏损时为 null */
  payoffRatio: number | null;
  /** 利润因子 = 总盈利 / 总亏损；没有亏损时为 null */
  profitFactor: number | null;
  totalFees: number;
  avgHoldingDays: number;
  drawdown: DrawdownResult;
}

/** 资金曲线：按平仓日期汇总已实现盈亏（仅统计已平仓部分，不含浮动盈亏）。 */
export function buildEquityCurve(trades: ClosedTrade[], initialCapital = 0): EquityPoint[] {
  const byDate = new Map<string, number>();
  for (const t of trades) byDate.set(t.exitDate, (byDate.get(t.exitDate) ?? 0) + t.pnl);
  const dates = [...byDate.keys()].sort();
  let cum = 0;
  return dates.map((date) => {
    const daily = byDate.get(date)!;
    cum += daily;
    return {
      date,
      dailyPnl: round(daily),
      cumulativePnl: round(cum),
      equity: round(initialCapital + cum),
    };
  });
}

/** 最大回撤：以初始资金作为起点峰值，在资金曲线上计算峰值到谷底的最大跌幅。 */
export function maxDrawdown(curve: EquityPoint[], initialCapital = 0): DrawdownResult {
  let peak = initialCapital;
  let peakDate: string | null = null;
  let best: DrawdownResult = { maxDrawdown: 0, maxDrawdownPct: null, peakDate: null, troughDate: null };
  for (const p of curve) {
    if (p.equity > peak) {
      peak = p.equity;
      peakDate = p.date;
    }
    const dd = peak - p.equity;
    if (dd > best.maxDrawdown) {
      best = {
        maxDrawdown: round(dd),
        maxDrawdownPct: initialCapital > 0 && peak > 0 ? round(dd / peak, 6) : null,
        peakDate,
        troughDate: p.date,
      };
    }
  }
  return best;
}

export function computeStats(trades: ClosedTrade[], initialCapital = 0): BasicStats {
  const winsArr = trades.filter((t) => t.pnl > 0);
  const lossArr = trades.filter((t) => t.pnl < 0);
  const grossProfit = winsArr.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = -lossArr.reduce((s, t) => s + t.pnl, 0);
  const avgWin = winsArr.length ? grossProfit / winsArr.length : 0;
  const avgLoss = lossArr.length ? grossLoss / lossArr.length : 0;
  const curve = buildEquityCurve(trades, initialCapital);
  const totalQty = trades.reduce((s, t) => s + t.quantity, 0);
  return {
    totalTrades: trades.length,
    wins: winsArr.length,
    losses: lossArr.length,
    breakeven: trades.length - winsArr.length - lossArr.length,
    winRate: trades.length ? round(winsArr.length / trades.length, 6) : 0,
    grossProfit: round(grossProfit),
    grossLoss: round(grossLoss),
    netPnl: round(grossProfit - grossLoss),
    avgWin: round(avgWin),
    avgLoss: round(avgLoss),
    payoffRatio: avgLoss > 0 ? round(avgWin / avgLoss, 4) : null,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 4) : null,
    totalFees: round(trades.reduce((s, t) => s + t.totalFees, 0)),
    avgHoldingDays: totalQty ? round(trades.reduce((s, t) => s + t.holdingDays * t.quantity, 0) / totalQty, 2) : 0,
    drawdown: maxDrawdown(curve, initialCapital),
  };
}
