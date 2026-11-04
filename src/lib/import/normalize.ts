import { round } from "../money";
import type { Fill, Market, Side } from "../types";
import type { FieldKey, Mapping } from "./presets";

export interface SkippedRow {
  rowIndex: number;
  reason: string;
  raw: string[];
}

export interface NormalizeResult {
  fills: Fill[];
  skipped: SkippedRow[];
}

/** 非成交类记录关键词：遇到直接跳过 */
const EXCLUDE_KEYWORDS = ["撤单", "废单", "撤销", "银证", "转账", "转存", "转取", "利息", "结息", "红利", "股息", "派息", "红股", "申购", "中签", "配号", "缴款", "赎回", "认购", "托管转", "融资利息"];

/** 解析买卖方向（A 股：买入/卖出；加密：BUY/SELL、开多/平多/开空/平空、long/short） */
export function parseSide(text: string | undefined): Side | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  if (EXCLUDE_KEYWORDS.some((k) => s.includes(k))) return null;
  if (/开多|平空|买多|^long$|^buy[\s_-]*(long|to[\s_-]*cover)$/i.test(s)) return "buy";
  if (/开空|平多|卖空|^short$|^sell[\s_-]*(short|long)?$/i.test(s)) return "sell";
  if (/卖|^sell$|^s$/i.test(s)) return "sell";
  if (/买|^buy$|^b$/i.test(s)) return "buy";
  return null;
}

/** 解析品种类型 */
export function parseMarket(v: string | undefined): Market | undefined {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (/美股|港股|期货|外汇/.test(s)) return "other";
  if (/a股|沪|深|股票|^cn$|^stock|^a$/.test(s)) return "cn";
  if (/加密|数字货币|币|crypto/.test(s)) return "crypto";
  return "other";
}

/** 没有品种类型时按代码推断：6 位数字 → A 股；USDT/USDC/BTC 等计价的交易对 → 加密；其他 → undefined */
export function inferMarket(code: string): Market | undefined {
  if (/^\d{6}$/.test(code)) return "cn";
  if (/^[A-Z0-9]{2,}[-/_]?(USDT|USDC|BUSD|FDUSD|BTC|ETH|USD)$/.test(code)) return "crypto";
  return undefined;
}

/** 解析数字：去掉千分位、货币符号、空白；空串返回 null */
export function parseNumber(v: string | undefined): number | null {
  if (v == null) return null;
  const s = String(v).replace(/[,，\s¥￥元]/g, "");
  if (s === "" || s === "-" || s === "--") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 证券代码：纯数字且不足 6 位时补前导 0（Excel/CSV 常把 000878 变成 878）；交易对去掉分隔符，如 BTC/USDT → BTCUSDT */
export function normalizeCode(v: string | undefined): string {
  const s = String(v ?? "").trim().replace(/\.0+$/, "");
  if (/^\d{1,5}$/.test(s)) return s.padStart(6, "0");
  const up = s.toUpperCase();
  if (/^[A-Z0-9]+[-/_][A-Z0-9]+$/.test(up) && !/^\d/.test(up)) return up.replace(/[-/_]/g, "");
  return up;
}

/** 解析日期：20190710 / 2019-07-10 / 2019/7/10 / 2019.07.10 / Excel 序列号 */
export function parseDate(v: string | undefined): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Excel 序列号（1900 日期系统）
    const serial = Math.floor(Number(s));
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 解析时间：09:31:22 / 9:31 / 93122 / 093122 */
export function parseTime(v: string | undefined): string | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  let m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
  m = s.match(/^(\d{1,2})(\d{2})(\d{2})$/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}:${m[3]}`;
  return undefined;
}

/** FNV-1a 32 位哈希，用于无成交编号时的整行去重 */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * 按映射把原始行转换成标准成交记录。纯函数。
 *
 * - 方向：优先用方向列；方向列无法识别时，用数量正负判断（负数视为卖出）。
 * - 数量取绝对值；价格缺失时 = 成交金额 / 数量；成交金额缺失时 = 价格 × 数量。
 * - 费用：若映射了佣金/印花税/过户费/其他费用中任一明细列，按明细累加；否则使用“费用合计”列（计入佣金）。
 * - id：有成交编号用“日期+代码+编号”，否则用整行哈希 + 文件内重复序号（同一文件内完全相同的两行都会保留，
 *   重复导入同一文件时 id 相同，可用于去重）。
 */
export function normalizeRows(
  headers: string[],
  rows: string[][],
  mapping: Mapping,
  source = "generic",
  defaultMarket?: Market,
): NormalizeResult {
  const col: Partial<Record<FieldKey, number>> = {};
  for (const [field, header] of Object.entries(mapping) as [FieldKey, string][]) {
    if (!header) continue;
    const idx = headers.indexOf(header);
    if (idx >= 0) col[field] = idx;
  }
  const get = (row: string[], f: FieldKey) => (col[f] != null ? row[col[f]!] : undefined);
  const hasFeeDetail = ["commission", "stampTax", "transferFee", "otherFee"].some((f) => col[f as FieldKey] != null);

  const fills: Fill[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Map<string, number>();

  rows.forEach((row, rowIndex) => {
    const skip = (reason: string) => skipped.push({ rowIndex, reason, raw: row });
    const date = parseDate(get(row, "date"));
    if (!date) return skip("日期无法识别");
    const code = normalizeCode(get(row, "code"));
    if (!code) return skip("缺少证券代码");

    const rawQty = parseNumber(get(row, "quantity"));
    const sideText = get(row, "side");
    let side = parseSide(sideText);
    if (!side && sideText && EXCLUDE_KEYWORDS.some((k) => sideText.includes(k))) return skip(`非买卖记录：${sideText}`);
    if (!side && rawQty != null && rawQty < 0 && !sideText) side = "sell";
    if (!side) return skip(sideText ? `无法识别方向：${sideText}` : "缺少买卖方向");
    if (rawQty == null || rawQty === 0) return skip("成交数量为空或为 0");
    const quantity = Math.abs(rawQty);

    let price = parseNumber(get(row, "price"));
    let amount = parseNumber(get(row, "amount"));
    if (amount != null) amount = Math.abs(amount);
    if ((price == null || price === 0) && amount) price = amount / quantity;
    if ((amount == null || amount === 0) && price) amount = price * quantity;
    if (price == null || amount == null || price <= 0) return skip("价格/成交金额缺失");

    const fee = (f: FieldKey) => Math.abs(parseNumber(get(row, f)) ?? 0);
    const fees = hasFeeDetail
      ? { commission: fee("commission"), stampTax: fee("stampTax"), transferFee: fee("transferFee"), otherFee: fee("otherFee") }
      : { commission: fee("totalFee"), stampTax: 0, transferFee: 0, otherFee: 0 };

    const tradeNo = get(row, "tradeNo")?.trim() || undefined;
    let id: string;
    if (tradeNo) {
      id = `${date}_${code}_${tradeNo}`;
    } else {
      const base = `${source}_${hashString(row.join("\u0001"))}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      id = n === 1 ? base : `${base}_${n}`;
    }

    fills.push({
      id,
      date,
      time: parseTime(get(row, "time")),
      code,
      name: get(row, "name")?.trim() || undefined,
      side,
      quantity,
      price: round(price, 4),
      amount: round(amount, 2),
      fees,
      netAmount: parseNumber(get(row, "netAmount")) ?? undefined,
      tradeNo,
      currency: get(row, "currency")?.trim() || undefined,
      market: parseMarket(get(row, "market")) ?? defaultMarket ?? inferMarket(code),
      source,
      seq: rowIndex,
    });
  });

  return { fills, skipped };
}

/** 必填字段检查，返回缺失的字段 */
export function missingRequired(mapping: Mapping): FieldKey[] {
  const missing: FieldKey[] = [];
  for (const f of ["date", "code", "quantity"] as FieldKey[]) if (!mapping[f]) missing.push(f);
  if (!mapping.side) missing.push("side");
  if (!mapping.price && !mapping.amount) missing.push("price");
  return missing;
}
