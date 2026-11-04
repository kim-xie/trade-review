import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { decodeText, sniffKind } from "../src/lib/import/decode";
import { parseFileBytes } from "../src/lib/import/parseFile";
import { autoMap, detectPreset, EASTMONEY_PRESET, getPreset, HUATAI_PRESET, PRESETS, THS_PRESET } from "../src/lib/import/presets";
import { cleanCell, locateHeader } from "../src/lib/import/table";
import { inferMarket, missingRequired, normalizeCode, normalizeRows, parseDate, parseMarket, parseNumber, parseSide, parseTime } from "../src/lib/import/normalize";
import { matchFifo } from "../src/lib/fifo";
import { computeStats } from "../src/lib/stats";

const root = path.resolve(__dirname, "..");
const read = (p: string) => new Uint8Array(readFileSync(path.join(root, p)));

describe("编码与格式嗅探", () => {
  it("识别 xlsx / xls / 文本", () => {
    expect(sniffKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toBe("xlsx");
    expect(sniffKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe("xls");
    expect(sniffKind(read("tests/fixtures/ths-sample-gbk.xls"))).toBe("text");
  });

  it("UTF-8（含 BOM）与 GBK 解码", () => {
    const utf8 = new TextEncoder().encode("\uFEFF证券代码,成交日期");
    expect(decodeText(utf8)).toEqual({ text: "证券代码,成交日期", encoding: "utf-8" });
    // “证券代码” 的 GBK 字节
    const gbk = new Uint8Array([0xd6, 0xa4, 0xc8, 0xaf, 0xb4, 0xfa, 0xc2, 0xeb]);
    expect(decodeText(gbk)).toEqual({ text: "证券代码", encoding: "gbk" });
  });
});

describe("表头定位与单元格清洗", () => {
  it("跳过说明行，找到表头", () => {
    const t = locateHeader([["某某证券交割单"], ["查询区间", "2026-01-01"], ["成交日期", "证券代码", "成交数量", ""], ["20260101", "1", "100"]]);
    expect(t?.headerRowIndex).toBe(2);
    expect(t?.headers).toEqual(["成交日期", "证券代码", "成交数量"]);
    expect(t?.rows).toEqual([["20260101", "1", "100"]]);
  });
  it("找不到表头返回 null", () => {
    expect(locateHeader([["a", "b"], ["1", "2"]])).toBeNull();
  });
  it('处理 Excel 文本保护 ="000878"', () => {
    expect(cleanCell('="000878"')).toBe("000878");
    expect(cleanCell("  600000 ")).toBe("600000");
  });
});

describe("字段解析", () => {
  it("日期", () => {
    expect(parseDate("20190710")).toBe("2019-07-10");
    expect(parseDate("2019/7/1")).toBe("2019-07-01");
    expect(parseDate("2019-07-10 09:30:00")).toBe("2019-07-10");
    expect(parseDate("2019年7月10日")).toBe("2019-07-10");
    expect(parseDate("45658")).toBe("2025-01-01");
    expect(parseDate("abc")).toBeNull();
  });
  it("时间", () => {
    expect(parseTime("9:31:05")).toBe("09:31:05");
    expect(parseTime("093105")).toBe("09:31:05");
    expect(parseTime("")).toBeUndefined();
  });
  it("数字与代码", () => {
    expect(parseNumber("1,234.50")).toBe(1234.5);
    expect(parseNumber("--")).toBeNull();
    expect(normalizeCode("878")).toBe("000878");
    expect(normalizeCode("600000")).toBe("600000");
    expect(normalizeCode("878.0")).toBe("000878");
    expect(normalizeCode("hk00700")).toBe("HK00700");
  });
  it("买卖方向与非成交记录", () => {
    expect(parseSide("证券买入")).toBe("buy");
    expect(parseSide("担保品卖出")).toBe("sell");
    expect(parseSide("买入")).toBe("buy");
    expect(parseSide("撤单")).toBeNull();
    expect(parseSide("新股申购")).toBeNull();
    expect(parseSide("银行转证券")).toBeNull();
    expect(parseSide("红利入账")).toBeNull();
  });
});

describe("券商预设", () => {
  it("每个预设字段都有来源标注或待确认标记", () => {
    for (const p of PRESETS) {
      for (const aliases of Object.values(p.fields)) {
        for (const a of aliases ?? []) {
          if (a.status === "confirmed") expect(a.source, `${p.id}:${a.header}`).toBeTruthy();
          else expect(a.note, `${p.id}:${a.header}`).toBeTruthy();
        }
      }
    }
  });

  it("自动识别同花顺 / 东方财富 / 华泰", () => {
    const ths = ["成交日期", "证券代码", "证券名称", "买卖标志", "成交价格", "成交数量", "成交金额", "发生金额", "佣金", "印花税", "过户费", "其他费", "成交编号", "股东代码", "备注", "手续费"];
    expect(detectPreset(ths).preset.id).toBe("ths");
    const em = ["发生日期", "证券代码", "证券名称", "交易类别", "成交数量", "成交金额", "发生金额", "佣金", "其他费用", "印花税", "过户费", "币种"];
    expect(detectPreset(em).preset.id).toBe("eastmoney");
    const ht3 = ["成交日期", "证券代码", "业务名称", "成交数量", "成交金额", "发生金额", "手续费", "印花税", "过户费", "其他杂费"];
    expect(detectPreset(ht3).preset.id).toBe("huatai");
    const htAdv = ["发生日期", "证券代码", "业务名称", "成交数量", "发生金额", "手续费", "印花税", "过户费", "其他费", "币种"];
    expect(detectPreset(htAdv).preset.id).toBe("huatai");
    const generic = ["日期", "时间", "代码", "名称", "方向", "数量", "价格", "成交金额", "佣金", "印花税", "过户费", "其他费用"];
    expect(detectPreset(generic).preset.id).toBe("generic");
  });

  it("autoMap：东方财富 / 华泰映射", () => {
    const em = autoMap(["发生日期", "证券代码", "交易类别", "成交数量", "成交金额", "发生金额", "佣金", "其他费用", "印花税", "过户费"], EASTMONEY_PRESET);
    expect(em).toMatchObject({ date: "发生日期", side: "交易类别", amount: "成交金额", otherFee: "其他费用" });
    expect(missingRequired(em)).toEqual([]);
    const ht = autoMap(["成交日期", "证券代码", "业务名称", "成交数量", "成交金额", "手续费", "其他杂费"], HUATAI_PRESET);
    expect(ht).toMatchObject({ date: "成交日期", side: "业务名称", commission: "手续费", otherFee: "其他杂费" });
  });

  it("费用明细优先；只有“手续费”合计时计入佣金", () => {
    const headers = ["成交日期", "证券代码", "买卖标志", "成交数量", "成交价格", "手续费"];
    const m = autoMap(headers, THS_PRESET);
    const r = normalizeRows(headers, [["20260101", "1", "买入", "100", "10", "5.2"]], m, "ths");
    expect(r.fills[0].fees).toEqual({ commission: 5.2, stampTax: 0, transferFee: 0, otherFee: 0 });
  });

  it("无成交编号：整行哈希去重，同文件内相同的两行都保留", () => {
    const headers = ["日期", "代码", "方向", "数量", "价格"];
    const m = autoMap(headers, getPreset("generic"));
    const row = ["2026-01-01", "600000", "买入", "100", "10"];
    const r1 = normalizeRows(headers, [row, row], m);
    expect(r1.fills).toHaveLength(2);
    expect(r1.fills[0].id).not.toBe(r1.fills[1].id);
    const r2 = normalizeRows(headers, [row, row], m);
    expect(r2.fills.map((f) => f.id)).toEqual(r1.fills.map((f) => f.id));
  });
});

describe("端到端：解析文件 → 标准化 → FIFO → 统计", () => {
  it("同花顺风格 GBK 制表符 .xls（示例数据）", async () => {
    const parsed = await parseFileBytes(read("tests/fixtures/ths-sample-gbk.xls"));
    expect(parsed.kind).toBe("text");
    expect(parsed.encoding).toBe("gbk");
    expect(parsed.delimiter).toBe("\t");
    expect(parsed.headerRowIndex).toBe(1);
    const { preset } = detectPreset(parsed.headers);
    expect(preset.id).toBe("ths");
    const { fills, skipped } = normalizeRows(parsed.headers, parsed.rows, autoMap(parsed.headers, preset), preset.id);
    expect(fills).toHaveLength(3);
    expect(skipped).toHaveLength(1); // 银行转证券
    expect(fills[0]).toMatchObject({ code: "000878", date: "2026-09-01", side: "buy", quantity: 2000, tradeNo: "99386" });
    expect(fills[1]).toMatchObject({ side: "sell", quantity: 1000 });
    const fifo = matchFifo(fills);
    expect(fifo.closedTrades).toHaveLength(2);
    expect(fifo.openPositions).toHaveLength(0);
    // 第一笔卖出：10070 - 9900 - 买入费用一半(2.6) - 卖出费用(10.14)
    expect(fifo.closedTrades[0].pnl).toBeCloseTo(170 - 2.6 - 10.14, 2);
  });

  it("通用模板示例 CSV（public/samples，示例数据）", async () => {
    const parsed = await parseFileBytes(read("public/samples/sample-generic.csv"));
    expect(parsed.encoding).toBe("utf-8");
    expect(parsed.headerRowIndex).toBe(1);
    const { preset } = detectPreset(parsed.headers);
    expect(preset.id).toBe("generic");
    const { fills, skipped } = normalizeRows(parsed.headers, parsed.rows, autoMap(parsed.headers, preset), "sample");
    expect(skipped.map((s) => s.reason)).toEqual(["非买卖记录：撤单"]);
    expect(fills).toHaveLength(13);
    const fifo = matchFifo(fills);
    expect(fifo.closedTrades).toHaveLength(7);
    expect(fifo.unmatchedSells).toHaveLength(0);
    expect(fifo.openPositions.map((p) => [p.code, p.quantity])).toEqual([
      ["000002", 500],
      ["300003", 100],
      ["510300", 3000],
    ]);
    const s = computeStats(fifo.closedTrades);
    expect(s.totalTrades).toBe(7);
    expect(s.wins + s.losses + s.breakeven).toBe(7);
  });

  it("xlsx（SheetJS），表头前有标题行，代码为数字", async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["东方财富交割单（示例数据）"],
      ["发生日期", "证券代码", "证券名称", "交易类别", "成交数量", "成交金额", "发生金额", "佣金", "其他费用", "印花税", "过户费", "币种"],
      ["20261008", 2, "示例B", "证券买入", 1000, 5000, -5005.05, 5, 0, 0, 0.05, "人民币"],
      ["20261009", 2, "示例B", "证券卖出", 1000, 5200, 5192.35, 5, 0, 2.6, 0.05, "人民币"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    const parsed = await parseFileBytes(bytes);
    expect(parsed.kind).toBe("xlsx");
    const { preset } = detectPreset(parsed.headers);
    expect(preset.id).toBe("eastmoney");
    const { fills } = normalizeRows(parsed.headers, parsed.rows, autoMap(parsed.headers, preset), preset.id);
    expect(fills[0]).toMatchObject({ code: "000002", price: 5, currency: "人民币" });
    const t = matchFifo(fills).closedTrades[0];
    expect(t.pnl).toBeCloseTo(200 - 5.05 - 7.65, 2);
    expect(t.holdingDays).toBe(1);
  });
});

describe("加密 / 通用格式扩展", () => {
  it("方向：BUY/SELL、开多/平空、long/short", () => {
    expect(parseSide("BUY")).toBe("buy");
    expect(parseSide("Sell")).toBe("sell");
    expect(parseSide("开多")).toBe("buy");
    expect(parseSide("平多")).toBe("sell");
    expect(parseSide("开空")).toBe("sell");
    expect(parseSide("平空")).toBe("buy");
    expect(parseSide("short")).toBe("sell");
  });
  it("品种类型解析与推断", () => {
    expect(parseMarket("A股")).toBe("cn");
    expect(parseMarket("加密")).toBe("crypto");
    expect(parseMarket("crypto")).toBe("crypto");
    expect(parseMarket("美股")).toBe("other");
    expect(parseMarket("")).toBeUndefined();
    expect(inferMarket("600000")).toBe("cn");
    expect(inferMarket("BTCUSDT")).toBe("crypto");
    expect(inferMarket("AAPL")).toBeUndefined();
    expect(normalizeCode("btc/usdt")).toBe("BTCUSDT");
    expect(normalizeCode("ETH-USDT")).toBe("ETHUSDT");
  });
  it("券商预设默认 A 股；通用格式读取品种类型列", () => {
    const headers = ["日期", "时间", "代码", "方向", "数量", "价格", "品种类型"];
    const m = autoMap(headers, getPreset("generic"));
    expect(m.market).toBe("品种类型");
    const r = normalizeRows(headers, [["2026-11-04", "06:05:05", "BTC/USDT", "SELL", "0.0013", "77836.3", "加密"]], m);
    expect(r.fills[0]).toMatchObject({ code: "BTCUSDT", side: "sell", quantity: 0.0013, market: "crypto", time: "06:05:05" });
    const ths = normalizeRows(["成交日期", "证券代码", "买卖标志", "成交数量", "成交价格"], [["20260101", "1", "卖出", "100", "10"]], autoMap(["成交日期", "证券代码", "买卖标志", "成交数量", "成交价格"], THS_PRESET), "ths", THS_PRESET.defaultMarket);
    expect(ths.fills[0].market).toBe("cn");
  });
});

describe("加密分钟级示例（public/samples/sample-crypto.csv，示例数据）", () => {
  it("含多空、分批开平仓；剩余空单单列", async () => {
    const parsed = await parseFileBytes(read("public/samples/sample-crypto.csv"));
    const { preset } = detectPreset(parsed.headers);
    expect(preset.id).toBe("generic");
    const { fills, skipped } = normalizeRows(parsed.headers, parsed.rows, autoMap(parsed.headers, preset), "sample");
    expect(skipped).toHaveLength(0);
    expect(fills.every((f) => f.market === "crypto" && f.time)).toBe(true);
    const r = matchFifo(fills);
    expect(r.closedTrades).toHaveLength(10);
    expect(r.closedTrades.filter((t) => t.direction === "short")).toHaveLength(3);
    expect(r.openPositions).toEqual([expect.objectContaining({ code: "BTCUSDT", direction: "short", quantity: 0.002 })]);
    expect(r.unmatchedSells).toHaveLength(0);
  });
});
