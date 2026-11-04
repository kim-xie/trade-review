import { describe, expect, it } from "vitest";
import { applyFreeTierWindow, FREE_TIER_NOTICE } from "../src/lib/freeTier";

const items = [
  { id: "a", exitDate: "2026-10-05" },
  { id: "b", exitDate: "2026-10-06" },
  { id: "c", exitDate: "2026-10-20" },
  { id: "d", exitDate: "2026-11-04" },
];
// 2026-11-04 12:00 北京时间
const now = new Date("2026-11-04T04:00:00Z");

describe("applyFreeTierWindow", () => {
  it("免费版：以今天为基准保留最近 30 个自然日（含今天）", () => {
    const r = applyFreeTierWindow(items, now, false);
    expect(r.cutoffDate).toBe("2026-10-06");
    expect(r.anchorDate).toBe("2026-11-04");
    expect(r.items.map((i) => i.id)).toEqual(["b", "c", "d"]);
    expect(r.limited).toBe(true);
    expect(r.hiddenCount).toBe(1);
  });

  it("付费版：原样返回", () => {
    const r = applyFreeTierWindow(items, now, true);
    expect(r.items).toHaveLength(4);
    expect(r.limited).toBe(false);
    expect(r.cutoffDate).toBeNull();
  });

  it("“今天”按 Asia/Shanghai 计算（UTC 前一天晚上已是北京时间当天）", () => {
    const r = applyFreeTierWindow(items, new Date("2026-11-03T17:00:00Z"), false);
    expect(r.anchorDate).toBe("2026-11-04");
  });

  it("可配置窗口天数与基准（latestTrade）", () => {
    const r = applyFreeTierWindow(items, new Date("2027-06-01T00:00:00Z"), false, { basis: "latestTrade", windowDays: 15 });
    expect(r.anchorDate).toBe("2026-11-04");
    expect(r.cutoffDate).toBe("2026-10-21");
    expect(r.items.map((i) => i.id)).toEqual(["d"]);
  });

  it("未来日期不计入；自定义取日期函数", () => {
    const r = applyFreeTierWindow([{ d: "2026-11-05" }, { d: "2026-11-01" }], now, false, { getDate: (x) => x.d });
    expect(r.items).toEqual([{ d: "2026-11-01" }]);
  });

  it("提示文案", () => {
    expect(FREE_TIER_NOTICE).toBe("免费版仅分析最近 30 天，买断解锁全部历史");
  });
});
