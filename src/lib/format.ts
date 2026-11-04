import type { Market } from "./types";

/** 结算货币符号：A 股 ¥，加密 U（USDT 等），其他不加符号 */
export function currencyUnit(market?: Market): string {
  return market === "crypto" ? "U" : market === "cn" || !market ? "¥" : "";
}

/** 一组交易的货币单位；多种市场混在一起时返回空串（不加单位） */
export function unitFor(markets: (Market | undefined)[]): string {
  const set = new Set(markets.map((m) => currencyUnit(m)));
  return set.size === 1 ? [...set][0] : "";
}

export function fmtNum(n: number, digits = 2): string {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 金额：¥1,234.50 / 12.30U，signed=true 时带 +/- */
export function fmtMoney(n: number, unit: string, signed = false, digits = 2): string {
  const sign = signed ? (n > 0 ? "+" : n < 0 ? "-" : "") : n < 0 ? "-" : "";
  const body = fmtNum(Math.abs(n), digits);
  if (unit === "¥") return `${sign}¥${body}`;
  return `${sign}${body}${unit}`;
}

/** 价格：按量级自适应小数位 */
/** ref：决定小数位的参考价（如价差按成交价的精度显示） */
export function fmtPrice(p: number, ref?: number): string {
  const a = Math.abs(ref ?? p);
  const d = a >= 1000 ? 2 : a >= 1 ? 3 : 6;
  return fmtNum(p, d);
}

export function fmtDateTime(date: string, time?: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}/${m}/${d}${time ? ` ${time}` : ""}`;
}

export const pnlClass = (n: number) => (n > 0 ? "pnl-up" : n < 0 ? "pnl-down" : "text-slate-300");
