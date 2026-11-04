import { describe, expect, it } from "vitest";
import { matchFifo } from "../src/lib/fifo";
import { fill } from "./helpers";

describe("matchFifo", () => {
  it("一买一卖：计算盈亏、持仓天数、手续费", () => {
    const r = matchFifo([
      fill({ id: "b1", date: "2026-01-05", side: "buy", quantity: 1000, price: 10, fees: { commission: 5, transferFee: 0.1 } }),
      fill({ id: "s1", date: "2026-01-15", side: "sell", quantity: 1000, price: 11, fees: { commission: 5, stampTax: 5.5, transferFee: 0.11 } }),
    ]);
    expect(r.closedTrades).toHaveLength(1);
    const t = r.closedTrades[0];
    expect(t.quantity).toBe(1000);
    expect(t.cost).toBe(10000);
    expect(t.proceeds).toBe(11000);
    expect(t.totalFees).toBeCloseTo(15.71, 2);
    expect(t.pnl).toBeCloseTo(1000 - 15.71, 2);
    expect(t.holdingDays).toBe(10);
    expect(t.fees.stampTax).toBe(5.5);
    expect(r.openPositions).toHaveLength(0);
    expect(r.unmatchedSells).toHaveLength(0);
  });

  it("分批买入 + 一次卖出：按 FIFO 跨批次配对，买入费用按比例分摊", () => {
    const r = matchFifo([
      fill({ id: "b1", date: "2026-01-01", side: "buy", quantity: 100, price: 10, fees: { commission: 5 } }),
      fill({ id: "b2", date: "2026-01-03", side: "buy", quantity: 200, price: 12, fees: { commission: 6 } }),
      fill({ id: "s1", date: "2026-01-11", side: "sell", quantity: 200, price: 13, fees: { commission: 4 } }),
    ]);
    const t = r.closedTrades[0];
    expect(t.legs).toHaveLength(2);
    expect(t.legs[0]).toMatchObject({ buyFillId: "b1", quantity: 100, holdingDays: 10 });
    expect(t.legs[1]).toMatchObject({ buyFillId: "b2", quantity: 100, holdingDays: 8 });
    // 买入费用：b1 全部 5 + b2 的一半 3；卖出费用 4
    expect(t.totalFees).toBeCloseTo(12, 6);
    expect(t.cost).toBe(100 * 10 + 100 * 12);
    expect(t.pnl).toBeCloseTo(2600 - 2200 - 12, 6);
    expect(t.avgEntryPrice).toBe(11);
    expect(t.holdingDays).toBe(9); // (10*100 + 8*100)/200
    expect(t.maxHoldingDays).toBe(10);
    // 剩余 b2 的 100 股及其一半费用
    expect(r.openPositions).toHaveLength(1);
    const p = r.openPositions[0];
    expect(p.quantity).toBe(100);
    expect(p.lots[0]).toMatchObject({ buyFillId: "b2", quantity: 100, originalQuantity: 200, cost: 1200 });
    expect(p.lots[0].fees.commission).toBeCloseTo(3, 6);
    expect(p.costBasis).toBeCloseTo(1203, 6);
  });

  it("一次买入 + 分批卖出（部分平仓）：每次卖出单独成笔，买入费用逐次分摊且总和不丢失", () => {
    const r = matchFifo([
      fill({ id: "b1", date: "2026-02-01", side: "buy", quantity: 300, price: 10, fees: { commission: 9, transferFee: 0.3 } }),
      fill({ id: "s1", date: "2026-02-02", side: "sell", quantity: 100, price: 11, fees: { commission: 5 } }),
      fill({ id: "s2", date: "2026-02-03", side: "sell", quantity: 100, price: 9, fees: { commission: 5 } }),
      fill({ id: "s3", date: "2026-02-04", side: "sell", quantity: 100, price: 10, fees: { commission: 5 } }),
    ]);
    expect(r.closedTrades.map((t) => t.id)).toEqual(["s1", "s2", "s3"]);
    const buyComm = r.closedTrades.reduce((s, t) => s + t.legs[0].buyFees.commission, 0);
    expect(buyComm).toBeCloseTo(9, 6);
    const buyTransfer = r.closedTrades.reduce((s, t) => s + t.legs[0].buyFees.transferFee, 0);
    expect(buyTransfer).toBeCloseTo(0.3, 6);
    expect(r.closedTrades[0].pnl).toBeCloseTo(100 - 3 - 0.1 - 5, 6);
    expect(r.closedTrades[1].pnl).toBeCloseTo(-100 - 3.1 - 5, 6);
    expect(r.openPositions).toHaveLength(0);
    // 同一持仓周期
    expect(new Set(r.closedTrades.map((t) => t.cycleId)).size).toBe(1);
  });

  it("清仓后再建仓：持仓周期编号递增", () => {
    const r = matchFifo([
      fill({ date: "2026-03-01", side: "buy", quantity: 100, price: 10 }),
      fill({ date: "2026-03-02", side: "sell", quantity: 100, price: 10 }),
      fill({ date: "2026-03-05", side: "buy", quantity: 100, price: 10 }),
      fill({ date: "2026-03-06", side: "sell", quantity: 100, price: 10 }),
    ]);
    expect(r.closedTrades.map((t) => t.cycleId)).toEqual(["600000#1", "600000#2"]);
  });

  it("卖出超过持仓：超出部分记为 unmatched，卖出费用只按配对部分计入", () => {
    const r = matchFifo([
      fill({ date: "2026-03-01", side: "buy", quantity: 100, price: 10 }),
      fill({ id: "s1", date: "2026-03-02", side: "sell", quantity: 300, price: 11, fees: { commission: 6 } }),
    ]);
    expect(r.unmatchedSells).toEqual([{ sellFillId: "s1", code: "600000", date: "2026-03-02", quantity: 200 }]);
    expect(r.closedTrades[0].quantity).toBe(100);
    expect(r.closedTrades[0].totalFees).toBeCloseTo(2, 6);
    expect(r.closedTrades[0].pnl).toBeCloseTo(98, 6);
  });

  it("没有任何买入的卖出：不生成交易", () => {
    const r = matchFifo([fill({ date: "2026-03-02", side: "sell", quantity: 100, price: 11 })]);
    expect(r.closedTrades).toHaveLength(0);
    expect(r.unmatchedSells[0].quantity).toBe(100);
  });

  it("多只股票互不影响；输入乱序时按日期时间排序", () => {
    const r = matchFifo([
      fill({ code: "000001", date: "2026-04-03", side: "sell", quantity: 100, price: 12 }),
      fill({ code: "600000", date: "2026-04-02", side: "buy", quantity: 100, price: 8 }),
      fill({ code: "000001", date: "2026-04-01", side: "buy", quantity: 100, price: 10 }),
      fill({ code: "000001", date: "2026-04-01", time: "10:00:00", side: "buy", quantity: 100, price: 11 }),
    ]);
    expect(r.closedTrades).toHaveLength(1);
    expect(r.closedTrades[0].code).toBe("000001");
    expect(r.closedTrades[0].avgEntryPrice).toBe(10);
    expect(r.openPositions.map((p) => [p.code, p.quantity])).toEqual([
      ["000001", 100],
      ["600000", 100],
    ]);
  });

  it("不修改入参", () => {
    const input = [
      fill({ date: "2026-01-01", side: "buy", quantity: 100, price: 10 }),
      fill({ date: "2026-01-02", side: "sell", quantity: 50, price: 10 }),
    ];
    const snapshot = JSON.stringify(input);
    matchFifo(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("matchFifo 做空（先卖后买）", () => {
  const c = (p: Parameters<typeof fill>[0]) => ({ ...fill({ code: "BTCUSDT", ...p }), market: "crypto" as const });

  it("加密：先卖后买，价格下跌为盈利", () => {
    const r = matchFifo([
      c({ id: "s1", date: "2026-11-04", time: "06:05:05", side: "sell", quantity: 0.01, price: 77836.3, fees: { commission: 0.4 } }),
      c({ id: "b1", date: "2026-11-04", time: "06:15:05", side: "buy", quantity: 0.01, price: 77813.68, fees: { commission: 0.4 } }),
    ]);
    expect(r.closedTrades).toHaveLength(1);
    const t = r.closedTrades[0];
    expect(t.direction).toBe("short");
    expect(t.entryTime).toBe("06:05:05");
    expect(t.exitTime).toBe("06:15:05");
    expect(t.avgEntryPrice).toBeCloseTo(77836.3, 4);
    expect(t.entryAmount).toBeCloseTo(778.36, 2);
    expect(t.pnl).toBeCloseTo((77836.3 - 77813.68) * 0.01 - 0.8, 2);
    expect(t.legs[0]).toMatchObject({ entryFillId: "s1", exitFillId: "b1", sellFillId: "s1", buyFillId: "b1" });
    expect(r.unmatchedSells).toHaveLength(0);
  });

  it("分批开空 + 部分平空；剩余空单单列", () => {
    const r = matchFifo([
      c({ date: "2026-11-04", time: "01:00:00", side: "sell", quantity: 2, price: 100, fees: { commission: 2 } }),
      c({ date: "2026-11-04", time: "01:10:00", side: "sell", quantity: 1, price: 110, fees: { commission: 1 } }),
      c({ id: "x", date: "2026-11-04", time: "02:00:00", side: "buy", quantity: 2.5, price: 90, fees: { commission: 2.5 } }),
    ]);
    const t = r.closedTrades[0];
    expect(t.quantity).toBe(2.5);
    // 开仓金额 200 + 55；平仓 225；开仓费 2 + 0.5；平仓费 2.5
    expect(t.entryAmount).toBeCloseTo(255, 6);
    expect(t.pnl).toBeCloseTo(255 - 225 - 2.5 - 2.5, 6);
    expect(r.openPositions[0]).toMatchObject({ direction: "short", quantity: 0.5 });
    expect(r.openPositions[0].lots[0].cost).toBeCloseTo(55, 6);
  });

  it("反手：一笔成交平多后剩余部分开空，费用按比例拆分", () => {
    const r = matchFifo([
      c({ date: "2026-11-04", time: "01:00:00", side: "buy", quantity: 1, price: 100 }),
      c({ id: "flip", date: "2026-11-04", time: "02:00:00", side: "sell", quantity: 3, price: 120, fees: { commission: 3 } }),
      c({ date: "2026-11-04", time: "03:00:00", side: "buy", quantity: 2, price: 110 }),
    ]);
    expect(r.closedTrades.map((t) => t.direction)).toEqual(["long", "short"]);
    expect(r.closedTrades[0].pnl).toBeCloseTo(20 - 1, 6);
    expect(r.closedTrades[1].pnl).toBeCloseTo(240 - 220 - 2, 6);
    expect(r.closedTrades.map((t) => t.cycleId)).toEqual(["BTCUSDT#1", "BTCUSDT#2"]);
    expect(r.openPositions).toHaveLength(0);
  });

  it("A 股（market 未知或 cn）不开空：多余卖出记为 unmatched", () => {
    const r = matchFifo([{ ...fill({ date: "2026-03-02", side: "sell", quantity: 100, price: 11 }), market: "cn" as const }]);
    expect(r.closedTrades).toHaveLength(0);
    expect(r.openPositions).toHaveLength(0);
    expect(r.unmatchedSells[0].quantity).toBe(100);
  });

  it("allowShort 选项可覆盖默认规则", () => {
    const r = matchFifo([fill({ date: "2026-03-02", side: "sell", quantity: 100, price: 11 })], { allowShort: () => true });
    expect(r.openPositions[0].direction).toBe("short");
  });
});
