export type Side = "buy" | "sell";
/** 持仓方向：long = 先买后卖；short = 先卖后买（做空，A 股预设不启用） */
export type Direction = "long" | "short";
/** 品种类型 */
export type Market = "cn" | "crypto" | "other";

/** 费用明细（单位：结算货币，A 股为元，加密通常为 USDT） */
export interface Fees {
  commission: number; // 佣金 / 手续费
  stampTax: number; // 印花税
  transferFee: number; // 过户费
  otherFee: number; // 其他费用（经手费、证管费、规费等）
}

/** 一条标准化后的成交记录 */
export interface Fill {
  id: string;
  /** 成交日期 YYYY-MM-DD（北京时间） */
  date: string;
  /** 成交时间 HH:mm:ss（北京时间，可选） */
  time?: string;
  /** 证券代码 / 交易对（数字代码补齐 6 位；交易对如 BTCUSDT） */
  code: string;
  name?: string;
  side: Side;
  /** 成交数量（始终为正数，可为小数） */
  quantity: number;
  /** 成交价格 */
  price: number;
  /** 成交金额（不含费用）= 价格 × 数量 */
  amount: number;
  fees: Fees;
  /** 发生金额 / 清算金额（含费用，买入为负，仅用于核对） */
  netAmount?: number;
  tradeNo?: string;
  currency?: string;
  /** 品种类型；未知时为 undefined（按 A 股规则只做多） */
  market?: Market;
  /** 导入来源预设 id */
  source?: string;
  /** 文件内原始顺序，用于同一时间点的稳定排序 */
  seq?: number;
}

/** FIFO 中一个开仓批次与一次平仓成交的配对片段 */
export interface LotMatch {
  direction: Direction;
  /** 开仓成交 id（做多为买入，做空为卖出） */
  entryFillId: string;
  /** 平仓成交 id */
  exitFillId: string;
  /** 买入一侧成交 id（做多=开仓，做空=平仓） */
  buyFillId: string;
  /** 卖出一侧成交 id */
  sellFillId: string;
  code: string;
  quantity: number;
  entryDate: string;
  entryTime?: string;
  exitDate: string;
  exitTime?: string;
  entryPrice: number;
  exitPrice: number;
  /** 本片段买入一侧成交金额（不含费） */
  cost: number;
  /** 本片段卖出一侧成交金额（不含费） */
  proceeds: number;
  buyFees: Fees;
  sellFees: Fees;
  pnl: number;
  holdingDays: number;
}

/** 一笔已平仓交易：以每一次平仓成交为一笔，按 FIFO 对应到若干开仓批次 */
export interface ClosedTrade {
  id: string;
  code: string;
  name?: string;
  market?: Market;
  direction: Direction;
  /** 一个“持仓周期”（仓位从 0 建立到回到 0）的标识 */
  cycleId: string;
  entryDate: string;
  entryTime?: string;
  exitDate: string;
  exitTime?: string;
  quantity: number;
  avgEntryPrice: number;
  exitPrice: number;
  /** 开仓金额（不含费） */
  entryAmount: number;
  /** 平仓金额（不含费） */
  exitAmount: number;
  /** 买入一侧金额（做多=开仓金额，做空=平仓金额） */
  cost: number;
  /** 卖出一侧金额 */
  proceeds: number;
  fees: Fees;
  totalFees: number;
  /** 净盈亏 = 卖出金额 − 买入金额 − 分摊的开仓费用 − 分摊的平仓费用（多空通用） */
  pnl: number;
  /** 收益率 = pnl / (开仓金额 + 分摊开仓费用) */
  returnPct: number;
  /** 按数量加权的平均持仓天数（自然日） */
  holdingDays: number;
  maxHoldingDays: number;
  legs: LotMatch[];
}

/** 未平仓批次（剩余部分） */
export interface OpenLot {
  direction: Direction;
  /** 开仓成交 id（兼容旧字段名） */
  buyFillId: string;
  code: string;
  name?: string;
  date: string;
  time?: string;
  price: number;
  originalQuantity: number;
  quantity: number;
  /** 剩余部分对应的开仓金额（不含费） */
  cost: number;
  /** 剩余部分分摊的开仓费用 */
  fees: Fees;
}

export interface OpenPosition {
  code: string;
  name?: string;
  direction: Direction;
  quantity: number;
  /** 含费成本（开仓金额 + 开仓费用） */
  costBasis: number;
  /** 含费每单位成本 */
  avgCost: number;
  lots: OpenLot[];
}

/** 不允许做空时，卖出数量超过已知持仓（例如买入早于导入区间），无法配对的部分 */
export interface UnmatchedSell {
  sellFillId: string;
  code: string;
  date: string;
  quantity: number;
}

export interface FifoResult {
  closedTrades: ClosedTrade[];
  openPositions: OpenPosition[];
  unmatchedSells: UnmatchedSell[];
}
