/**
 * 券商列名映射预设。
 *
 * 每个别名都带 status：
 * - "confirmed"   ：有公开来源（见 source）
 * - "unconfirmed" ：待确认 —— 根据同类券商/常见格式推测，尚未见到该券商的真实导出文件，请勿当作已确认
 *
 * 各券商、各客户端版本的导出列名可能不同，因此所有预设都只是“自动识别的起点”，导入界面允许手动调整。
 * 上线前必须用真实（脱敏）文件做回归测试。
 */

export type FieldKey =
  | "date"
  | "time"
  | "code"
  | "name"
  | "side"
  | "quantity"
  | "price"
  | "amount"
  | "netAmount"
  | "commission"
  | "stampTax"
  | "transferFee"
  | "otherFee"
  | "totalFee"
  | "tradeNo"
  | "currency"
  | "market";

export const FIELD_LABELS: Record<FieldKey, string> = {
  date: "成交日期",
  time: "成交时间",
  code: "证券代码",
  name: "证券名称",
  side: "买卖方向",
  quantity: "成交数量",
  price: "成交价格",
  amount: "成交金额",
  netAmount: "发生金额(核对用)",
  commission: "佣金",
  stampTax: "印花税",
  transferFee: "过户费",
  otherFee: "其他费用",
  totalFee: "费用合计(无明细时用)",
  tradeNo: "成交编号",
  currency: "币种",
  market: "品种类型(A股/加密/其他)",
};

export const FIELD_ORDER: FieldKey[] = Object.keys(FIELD_LABELS) as FieldKey[];

/** 必填字段；price 与 amount 至少有一个 */
export const REQUIRED_FIELDS: FieldKey[] = ["date", "code", "side", "quantity"];

export interface Alias {
  header: string;
  status: "confirmed" | "unconfirmed";
  /** 来源链接或说明 */
  source?: string;
  note?: string;
}

export interface BrokerPreset {
  id: string;
  label: string;
  description: string;
  /** 该预设的默认品种类型（文件里没有“品种类型”列时使用）；不填则按代码推断 */
  defaultMarket?: "cn" | "crypto" | "other";
  fields: Partial<Record<FieldKey, Alias[]>>;
}

const SRC_EM = "https://wealthsight.cn/docs/trade-import/eastmoney/";
const SRC_HT = "https://wealthsight.cn/docs/trade-import/huatai/";
const SRC_SAMPLE = "https://github.com/tyr-liu/stock";
const SRC_THS_QUANT = "https://quant.10jqka.com.cn/view/help/22";

const c = (header: string, source: string, note?: string): Alias => ({ header, status: "confirmed", source, note });
const u = (header: string, note = "待确认"): Alias => ({ header, status: "unconfirmed", note });

/** 通用格式：本工具自己的模板（见 public/samples/sample-generic.csv），也兼容常见中英文列名 */
export const GENERIC_PRESET: BrokerPreset = {
  id: "generic",
  label: "通用格式",
  description: "本工具的通用模板：日期、时间、代码、名称、方向、数量、价格、成交金额、佣金、印花税、过户费、其他费用，可选“品种类型”（A股/加密/其他）。时间按北京时间解释。",
  fields: {
    date: [c("日期", "本工具模板"), c("date", "本工具模板"), u("成交日期", "通用别名"), u("发生日期", "通用别名"), u("交易日期", "通用别名")],
    time: [c("时间", "本工具模板（可选，北京时间）"), c("time", "本工具模板"), u("成交时间", "通用别名")],
    code: [c("代码", "本工具模板"), c("code", "本工具模板"), u("证券代码", "通用别名"), u("股票代码", "通用别名")],
    name: [c("名称", "本工具模板"), c("name", "本工具模板"), u("证券名称", "通用别名"), u("股票名称", "通用别名")],
    side: [c("方向", "本工具模板"), c("side", "本工具模板"), u("买卖方向", "通用别名"), u("操作", "通用别名"), u("买卖标志", "通用别名"), u("交易类别", "通用别名"), u("业务名称", "通用别名"), u("摘要", "通用别名")],
    quantity: [c("数量", "本工具模板"), c("quantity", "本工具模板"), u("成交数量", "通用别名")],
    price: [c("价格", "本工具模板"), c("price", "本工具模板"), u("成交价格", "通用别名"), u("成交均价", "通用别名")],
    amount: [c("成交金额", "本工具模板"), c("amount", "本工具模板")],
    netAmount: [u("发生金额", "通用别名"), u("清算金额", "通用别名")],
    commission: [c("佣金", "本工具模板"), c("commission", "本工具模板")],
    stampTax: [c("印花税", "本工具模板"), c("stamp_tax", "本工具模板")],
    transferFee: [c("过户费", "本工具模板"), c("transfer_fee", "本工具模板")],
    otherFee: [c("其他费用", "本工具模板"), c("other_fee", "本工具模板"), u("其他费", "通用别名"), u("其他杂费", "通用别名")],
    totalFee: [u("手续费", "通用别名"), u("费用合计", "通用别名")],
    tradeNo: [u("成交编号", "通用别名"), u("trade_no", "通用别名")],
    currency: [u("币种", "通用别名")],
    market: [c("品种类型", "本工具模板（可选：A股/加密/其他）"), c("market", "本工具模板"), u("市场", "通用别名")],
  },
};

/**
 * 东方财富（Windows 终端「快速交易→查询→交割单→导出数据」）。
 * 已确认列名来自 WealthSight 的东方财富导入说明（映射表与“成交金额 + 费用”模式说明）。
 * 证券名称、成交价格、成交时间等列：待确认（未见真实文件）。
 */
export const EASTMONEY_PRESET: BrokerPreset = {
  id: "eastmoney",
  defaultMarket: "cn",
  label: "东方财富",
  description: "东方财富 PC 端交割单导出（xlsx，或 GBK 编码的制表符文本）。",
  fields: {
    date: [c("发生日期", SRC_EM), u("成交日期")],
    time: [u("成交时间")],
    code: [c("证券代码", SRC_EM)],
    name: [u("证券名称")],
    side: [c("交易类别", SRC_EM), u("操作"), u("买卖标志")],
    quantity: [c("成交数量", SRC_EM)],
    price: [u("成交价格"), u("成交均价")],
    amount: [c("成交金额", SRC_EM, "出现在该页“成交金额 + 费用”模式说明中")],
    netAmount: [c("发生金额", SRC_EM)],
    commission: [c("佣金", SRC_EM)],
    stampTax: [c("印花税", SRC_EM)],
    transferFee: [c("过户费", SRC_EM)],
    otherFee: [c("其他费用", SRC_EM)],
    totalFee: [u("手续费")],
    tradeNo: [u("成交编号", "来源称交割单无唯一编号列，此别名仅备用")],
    currency: [c("币种", SRC_EM)],
  },
};

/**
 * 同花顺（交易入口由各接入券商提供，列名随券商不同）。
 * 已确认列名来自 GitHub 公开的真实交割单 CSV（tyr-liu/stock，作者未注明券商/客户端，格式属同花顺/通达信系），
 * 另参考同花顺官方量化帮助文档中“操作、成交均价”的叫法（该文档是成交汇总，不是交割单）。
 */
export const THS_PRESET: BrokerPreset = {
  id: "ths",
  defaultMarket: "cn",
  label: "同花顺",
  description: "同花顺 PC 端「查询→交割单」导出（CSV/xls，常为 GBK 编码）。日期形如 20190710，卖出数量可能为负。",
  fields: {
    date: [c("成交日期", SRC_SAMPLE), u("发生日期")],
    time: [u("成交时间")],
    code: [c("证券代码", SRC_SAMPLE)],
    name: [c("证券名称", SRC_SAMPLE)],
    side: [c("买卖标志", SRC_SAMPLE), c("操作", SRC_THS_QUANT, "官方量化文档成交汇总表头"), c("备注", SRC_SAMPLE, "样例中为“证券买入/证券卖出”")],
    quantity: [c("成交数量", SRC_SAMPLE)],
    price: [c("成交价格", SRC_SAMPLE), c("成交均价", SRC_THS_QUANT)],
    amount: [c("成交金额", SRC_SAMPLE)],
    netAmount: [c("发生金额", SRC_SAMPLE)],
    commission: [c("佣金", SRC_SAMPLE)],
    stampTax: [c("印花税", SRC_SAMPLE)],
    transferFee: [c("过户费", SRC_SAMPLE)],
    otherFee: [c("其他费", SRC_SAMPLE)],
    totalFee: [c("手续费", SRC_SAMPLE, "样例中 = 佣金+印花税+过户费+其他费，仅在无明细时使用")],
    tradeNo: [c("成交编号", SRC_SAMPLE)],
    currency: [u("币种")],
  },
};

/**
 * 华泰证券。
 * 专业版Ⅲ「交割单」右键保存 table.xls（实为 GB18030 制表符文本）：成交日期、业务名称、手续费、其他杂费，无币种。
 * 高级版「资金流水」输出：发生日期、业务名称、其他费、币种，含出入金等非买卖行（导入时自动过滤）。
 * 来源均为 WealthSight 华泰导入说明。证券名称、成交价格、成交时间：待确认。
 * “手续费”在华泰文件中与印花税、过户费并列，这里按“佣金”处理 —— 含义待确认。
 */
export const HUATAI_PRESET: BrokerPreset = {
  id: "huatai",
  defaultMarket: "cn",
  label: "华泰证券",
  description: "华泰专业版Ⅲ交割单 table.xls / 高级版资金流水（GB18030 制表符文本）。",
  fields: {
    date: [c("成交日期", SRC_HT, "专业版Ⅲ"), c("发生日期", SRC_HT, "高级版资金流水")],
    time: [u("成交时间")],
    code: [c("证券代码", SRC_HT)],
    name: [u("证券名称")],
    side: [c("业务名称", SRC_HT)],
    quantity: [c("成交数量", SRC_HT)],
    price: [u("成交价格"), u("成交均价")],
    amount: [c("成交金额", SRC_HT, "出现在该页“成交金额 + 费用”模式说明中")],
    netAmount: [c("发生金额", SRC_HT)],
    commission: [c("手续费", SRC_HT, "列名已确认；是否仅为佣金待确认")],
    stampTax: [c("印花税", SRC_HT)],
    transferFee: [c("过户费", SRC_HT)],
    otherFee: [c("其他杂费", SRC_HT, "专业版Ⅲ"), c("其他费", SRC_HT, "高级版资金流水")],
    tradeNo: [u("成交编号", "来源称无唯一编号列，此别名仅备用")],
    currency: [c("币种", SRC_HT, "仅高级版资金流水")],
  },
};

export const PRESETS: BrokerPreset[] = [GENERIC_PRESET, EASTMONEY_PRESET, THS_PRESET, HUATAI_PRESET];

export function getPreset(id: string): BrokerPreset {
  return PRESETS.find((p) => p.id === id) ?? GENERIC_PRESET;
}

/** 所有预设中出现过的列名，用于定位表头行 */
export const ALL_KNOWN_HEADERS: Set<string> = new Set(
  PRESETS.flatMap((p) => Object.values(p.fields).flatMap((arr) => (arr ?? []).map((a) => normalizeHeader(a.header)))),
);

export function normalizeHeader(h: string): string {
  return String(h ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, "")
    .replace(/[（(].*?[)）]/g, "") // 去掉“成交金额(元)”中的单位
    .toLowerCase();
}

export type Mapping = Partial<Record<FieldKey, string>>;

/** 按预设别名自动映射：返回 字段 → 实际表头 */
export function autoMap(headers: string[], preset: BrokerPreset): Mapping {
  const norm = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: Mapping = {};
  for (const field of FIELD_ORDER) {
    const aliases = preset.fields[field] ?? [];
    for (const alias of aliases) {
      const idx = norm.findIndex((h, i) => !used.has(i) && h === normalizeHeader(alias.header));
      if (idx >= 0) {
        mapping[field] = headers[idx];
        used.add(idx);
        break;
      }
    }
  }
  // 方向列缺失时回退：备注/摘要列常含“证券买入/证券卖出”
  return mapping;
}

/** 按“已确认别名命中数”给每个预设打分，返回最可能的预设 */
export function detectPreset(headers: string[]): { preset: BrokerPreset; score: number; scores: Record<string, number> } {
  const norm = new Set(headers.map(normalizeHeader));
  const scores: Record<string, number> = {};
  let best = GENERIC_PRESET;
  let bestScore = -1;
  for (const p of PRESETS) {
    let s = 0;
    for (const aliases of Object.values(p.fields)) {
      if ((aliases ?? []).some((a) => norm.has(normalizeHeader(a.header)))) {
        s += (aliases ?? []).some((a) => a.status === "confirmed" && norm.has(normalizeHeader(a.header))) ? 2 : 1;
      }
    }
    scores[p.id] = s;
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return { preset: best, score: bestScore, scores };
}
