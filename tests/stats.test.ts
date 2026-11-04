import { describe, expect, it } from "vitest";
import { buildEquityCurve, computeStats, maxDrawdown } from "../src/lib/stats";
import type { ClosedTrade } from "../src/lib/types";

function t(exitDate: string, pnl: number, fees = 1, quantity = 100, holdingDays = 2): ClosedTrade {
  return {
    id: `${exitDate}-${pnl}`, code: "600000", direction: "long", cycleId: "600000#1", entryDate: exitDate, exitDate, entryAmount: 1000, exitAmount: 1000,
    quantity, avgEntryPrice: 10, exitPrice: 10, cost: 1000, proceeds: 1000,
    fees: { commission: fees, stampTax: 0, transferFee: 0, otherFee: 0 }, totalFees: fees,
    pnl, returnPct: pnl / 1000, holdingDays, maxHoldingDays: holdingDays, legs: [],
  };
}

describe("统计", () => {
  const trades = [t("2026-01-01", 100), t("2026-01-02", -50), t("2026-01-02", -30), t("2026-01-05", 200), t("2026-01-06", 0)];

  it("胜率、盈亏比、利润因子", () => {
    const s = computeStats(trades);
    expect(s.totalTrades).toBe(5);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(2);
    expect(s.breakeven).toBe(1);
    expect(s.winRate).toBeCloseTo(0.4, 6);
    expect(s.avgWin).toBe(150);
    expect(s.avgLoss).toBe(40);
    expect(s.payoffRatio).toBeCloseTo(3.75, 6);
    expect(s.profitFactor).toBeCloseTo(300 / 80, 4);
    expect(s.netPnl).toBe(220);
    expect(s.totalFees).toBe(5);
  });

  it("资金曲线按日期汇总", () => {
    const c = buildEquityCurve(trades, 10000);
    expect(c.map((p) => p.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06"]);
    expect(c.map((p) => p.dailyPnl)).toEqual([100, -80, 200, 0]);
    expect(c.map((p) => p.equity)).toEqual([10100, 10020, 10220, 10220]);
  });

  it("最大回撤：金额与比例", () => {
    const c = buildEquityCurve(trades, 10000);
    const dd = maxDrawdown(c, 10000);
    expect(dd.maxDrawdown).toBe(80);
    expect(dd.maxDrawdownPct).toBeCloseTo(80 / 10100, 6);
    expect(dd.peakDate).toBe("2026-01-01");
    expect(dd.troughDate).toBe("2026-01-02");
  });

  it("起步即亏损：以初始资金为峰值", () => {
    const c = buildEquityCurve([t("2026-01-01", -100), t("2026-01-02", 30), t("2026-01-03", -50)], 1000);
    const dd = maxDrawdown(c, 1000);
    expect(dd.maxDrawdown).toBe(120);
    expect(dd.maxDrawdownPct).toBeCloseTo(0.12, 6);
    expect(dd.peakDate).toBeNull();
  });

  it("初始资金为 0 时回撤比例为 null", () => {
    const dd = maxDrawdown(buildEquityCurve([t("2026-01-01", 100), t("2026-01-02", -60)]));
    expect(dd.maxDrawdown).toBe(60);
    expect(dd.maxDrawdownPct).toBeNull();
    const dd2 = maxDrawdown(buildEquityCurve([t("2026-01-01", -60)]));
    expect(dd2.maxDrawdownPct).toBeNull();
  });

  it("没有亏损时盈亏比为 null；空数据", () => {
    expect(computeStats([t("2026-01-01", 10)]).payoffRatio).toBeNull();
    const e = computeStats([]);
    expect(e.totalTrades).toBe(0);
    expect(e.winRate).toBe(0);
    expect(e.drawdown.maxDrawdown).toBe(0);
  });
});
