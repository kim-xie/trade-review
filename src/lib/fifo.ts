import { daysBetween } from "./dates";
import { addFees, round, roundFees, scaleFees, subFees, totalFees, ZERO_FEES } from "./money";
import type {
  ClosedTrade,
  Direction,
  Fees,
  FifoResult,
  Fill,
  LotMatch,
  OpenLot,
  OpenPosition,
  UnmatchedSell,
} from "./types";

/** 量的比较容差（数量可能是小数，如加密货币） */
const QTY_EPS = 1e-9;

interface WorkingLot {
  fill: Fill;
  direction: Direction;
  /** 该批次开仓时的数量（做空反手时可能小于成交数量） */
  openedQty: number;
  remaining: number;
  /** 剩余部分的开仓金额 */
  remainingCost: number;
  /** 剩余部分尚未分摊的开仓费用 */
  remainingFees: Fees;
}

export interface FifoOptions {
  /**
   * 是否允许该成交开空仓。默认：仅 market 为 crypto / other 时允许；
   * A 股（market=cn 或未知）只做多，多余的卖出记为 unmatchedSells。
   */
  allowShort?: (fill: Fill) => boolean;
}

export const defaultAllowShort = (f: Fill) => f.market === "crypto" || f.market === "other";

/** 稳定排序：日期 → 时间（缺失视为与同日其他记录同时，按原始顺序）→ 原始顺序 */
export function sortFills(fills: Fill[]): Fill[] {
  return fills
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      if (a.f.date !== b.f.date) return a.f.date < b.f.date ? -1 : 1;
      const ta = a.f.time ?? "";
      const tb = b.f.time ?? "";
      if (ta && tb && ta !== tb) return ta < tb ? -1 : 1;
      const sa = a.f.seq ?? a.i;
      const sb = b.f.seq ?? b.i;
      return sa - sb;
    })
    .map((x) => x.f);
}

/**
 * 先进先出（FIFO）配对。纯函数，不修改入参。
 *
 * - 每一次平仓成交生成一笔 ClosedTrade，按 FIFO 依次消耗最早的开仓批次（支持分批开仓、分批平仓、部分平仓）。
 * - 做多：买入开仓、卖出平仓；做空：卖出开仓、买入平仓（需 allowShort）。
 * - 一次成交平掉全部反向持仓后仍有剩余时，剩余部分按比例拆分为新的开仓批次（反手）。
 * - 开仓费用按“配对数量 / 该批次剩余数量”分摊；平仓费用按“配对数量 / 该次成交数量”分摊。
 * - 不允许做空时，卖出超过持仓的部分记入 unmatchedSells，不计算盈亏（对应那部分费用也不计入）。
 * - 未平仓批次单列在 openPositions 中。
 */
export function matchFifo(fills: Fill[], options: FifoOptions = {}): FifoResult {
  const allowShort = options.allowShort ?? defaultAllowShort;
  const sorted = sortFills(fills);
  const lotsByCode = new Map<string, WorkingLot[]>();
  const cycleByCode = new Map<string, number>();
  const nameByCode = new Map<string, string>();
  const closedTrades: ClosedTrade[] = [];
  const unmatchedSells: UnmatchedSell[] = [];

  for (const fill of sorted) {
    if (!(fill.quantity > 0)) continue;
    if (fill.name) nameByCode.set(fill.code, fill.name);
    const lots = lotsByCode.get(fill.code) ?? [];
    lotsByCode.set(fill.code, lots);

    const posDir: Direction | null = lots.length ? lots[0].direction : null;
    const closes = (posDir === "long" && fill.side === "sell") || (posDir === "short" && fill.side === "buy");

    let toClose = closes ? fill.quantity : 0;
    const legs: LotMatch[] = [];
    while (toClose > QTY_EPS && lots.length > 0) {
      const lot = lots[0];
      const q = Math.min(lot.remaining, toClose);
      const lotRatio = q / lot.remaining; // 占该批次剩余部分的比例，保证最后一次分摊把余数用完
      const entryAmt = lot.remainingCost * lotRatio;
      const entryFees = scaleFees(lot.remainingFees, lotRatio);
      const exitRatio = q / fill.quantity;
      const exitAmt = fill.amount * exitRatio;
      const exitFees = scaleFees(fill.fees, exitRatio);
      const long = lot.direction === "long";
      const cost = long ? entryAmt : exitAmt;
      const proceeds = long ? exitAmt : entryAmt;
      const pnl = proceeds - cost - totalFees(entryFees) - totalFees(exitFees);

      legs.push({
        direction: lot.direction,
        entryFillId: lot.fill.id,
        exitFillId: fill.id,
        buyFillId: long ? lot.fill.id : fill.id,
        sellFillId: long ? fill.id : lot.fill.id,
        code: fill.code,
        quantity: q,
        entryDate: lot.fill.date,
        entryTime: lot.fill.time,
        exitDate: fill.date,
        exitTime: fill.time,
        entryPrice: lot.fill.price,
        exitPrice: fill.price,
        cost,
        proceeds,
        buyFees: long ? entryFees : exitFees,
        sellFees: long ? exitFees : entryFees,
        pnl,
        holdingDays: daysBetween(lot.fill.date, fill.date),
      });

      lot.remaining -= q;
      lot.remainingCost -= entryAmt;
      lot.remainingFees = subFees(lot.remainingFees, entryFees);
      toClose -= q;
      if (lot.remaining <= QTY_EPS) lots.shift();
    }

    const closedQty = legs.reduce((s, l) => s + l.quantity, 0);
    const leftover = fill.quantity - closedQty;

    if (legs.length > 0) closedTrades.push(buildTrade(fill, legs, cycleByCode.get(fill.code) ?? 1, nameByCode));

    if (leftover > QTY_EPS) {
      const openDir: Direction | null = fill.side === "buy" ? "long" : allowShort(fill) ? "short" : null;
      if (openDir) {
        const r = leftover / fill.quantity;
        cycleByCode.set(fill.code, (cycleByCode.get(fill.code) ?? 0) + (lots.length === 0 ? 1 : 0));
        lots.push({
          fill,
          direction: openDir,
          openedQty: leftover,
          remaining: leftover,
          remainingCost: fill.amount * r,
          remainingFees: scaleFees(fill.fees, r),
        });
      } else {
        unmatchedSells.push({ sellFillId: fill.id, code: fill.code, date: fill.date, quantity: leftover });
      }
    }
  }

  const openPositions: OpenPosition[] = [];
  for (const [code, lots] of lotsByCode) {
    if (lots.length === 0) continue;
    const openLots: OpenLot[] = lots.map((l) => ({
      direction: l.direction,
      buyFillId: l.fill.id,
      code,
      name: l.fill.name ?? nameByCode.get(code),
      date: l.fill.date,
      time: l.fill.time,
      price: l.fill.price,
      originalQuantity: l.openedQty,
      quantity: l.remaining,
      cost: round(l.remainingCost),
      fees: roundFees(l.remainingFees),
    }));
    const quantity = lots.reduce((s, l) => s + l.remaining, 0);
    const costBasis = lots.reduce((s, l) => s + l.remainingCost + totalFees(l.remainingFees), 0);
    openPositions.push({
      code,
      name: nameByCode.get(code),
      direction: lots[0].direction,
      quantity,
      costBasis: round(costBasis),
      avgCost: round(costBasis / quantity, 4),
      lots: openLots,
    });
  }
  openPositions.sort((a, b) => a.code.localeCompare(b.code));

  return { closedTrades, openPositions, unmatchedSells };
}

function buildTrade(fill: Fill, legs: LotMatch[], cycle: number, nameByCode: Map<string, string>): ClosedTrade {
  const direction = legs[0].direction;
  const long = direction === "long";
  const qty = legs.reduce((s, l) => s + l.quantity, 0);
  const cost = legs.reduce((s, l) => s + l.cost, 0);
  const proceeds = legs.reduce((s, l) => s + l.proceeds, 0);
  const fees = legs.reduce((acc, l) => addFees(acc, addFees(l.buyFees, l.sellFees)), ZERO_FEES);
  const entryFeesTotal = legs.reduce((s, l) => s + totalFees(long ? l.buyFees : l.sellFees), 0);
  const pnl = legs.reduce((s, l) => s + l.pnl, 0);
  const entryAmount = long ? cost : proceeds;
  const exitAmount = long ? proceeds : cost;
  const basis = entryAmount + entryFeesTotal;

  return {
    id: fill.id,
    code: fill.code,
    name: fill.name ?? nameByCode.get(fill.code),
    market: fill.market,
    direction,
    cycleId: `${fill.code}#${cycle}`,
    entryDate: legs[0].entryDate,
    entryTime: legs[0].entryTime,
    exitDate: fill.date,
    exitTime: fill.time,
    quantity: round(qty, 8),
    avgEntryPrice: round(entryAmount / qty, 4),
    exitPrice: fill.price,
    entryAmount: round(entryAmount),
    exitAmount: round(exitAmount),
    cost: round(cost),
    proceeds: round(proceeds),
    fees: roundFees(fees),
    totalFees: round(totalFees(fees)),
    pnl: round(pnl),
    returnPct: basis > 0 ? round(pnl / basis, 6) : 0,
    holdingDays: round(legs.reduce((s, l) => s + l.holdingDays * l.quantity, 0) / qty, 2),
    maxHoldingDays: Math.max(...legs.map((l) => l.holdingDays)),
    legs: legs.map((l) => ({
      ...l,
      cost: round(l.cost),
      proceeds: round(l.proceeds),
      buyFees: roundFees(l.buyFees),
      sellFees: roundFees(l.sellFees),
      pnl: round(l.pnl),
    })),
  };
}
