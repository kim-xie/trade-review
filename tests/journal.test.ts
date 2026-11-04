import { describe, expect, it } from "vitest";
import { BUILTIN_EMOTIONS, BUILTIN_TAGS, renderMarkdown, type Journal } from "../src/lib/journal";
import { mistakeImpact, statsByEmotion, statsByRating, statsByStrategy, statsByTag } from "../src/lib/journalStats";
import { filterTrades, sortTrades } from "../src/lib/tradeList";
import type { ClosedTrade } from "../src/lib/types";

function tr(id: string, pnl: number, extra: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    id, code: "BTCUSDT", direction: "long", cycleId: "x", entryDate: "2026-11-04", entryTime: "01:00:00", exitDate: "2026-11-04",
    exitTime: "02:00:00", quantity: 1, avgEntryPrice: 100, exitPrice: 100 + pnl, entryAmount: 100, exitAmount: 100 + pnl,
    cost: 100, proceeds: 100 + pnl, fees: { commission: 0, stampTax: 0, transferFee: 0, otherFee: 0 }, totalFees: 0, pnl,
    returnPct: pnl / 100, holdingDays: 0, maxHoldingDays: 0, legs: [], ...extra,
  };
}
const j = (tradeId: string, p: Partial<Journal>): Journal => ({ tradeId, tagIds: [], updatedAt: "", ...p });

const trades = [tr("a", 50), tr("b", -30), tr("c", -20), tr("d", 10, { direction: "short", code: "ETHUSDT" }), tr("e", 0)];
const tags = [...BUILTIN_TAGS, { id: "n-1", name: "突破", color: "#22d3ee", kind: "normal" as const }];
const strategies = [{ id: "s1", name: "趋势回踩" }, { id: "s2", name: "反转" }];
const journals: Record<string, Journal> = {
  a: j("a", { tagIds: ["n-1"], strategyId: "s1", rating: 5, emotionId: "e-1" }),
  b: j("b", { tagIds: ["m-chase", "m-nostop"], strategyId: "s1", rating: 2, emotionId: "e-8" }),
  c: j("c", { tagIds: ["m-chase"], strategyId: "s2", rating: 2, emotionId: "e-8" }),
  d: j("d", { tagIds: ["m-oversize"], rating: 4 }),
};

describe("复盘统计联动", () => {
  it("按标签：多标签各计一次，未打标签单列", () => {
    const g = statsByTag(trades, journals, tags);
    const chase = g.find((x) => x.key === "m-chase")!;
    expect(chase).toMatchObject({ label: "追高", count: 2, wins: 0, losses: 2, pnl: -50, lossSum: -50, winRate: 0 });
    expect(g.find((x) => x.key === "m-nostop")!.count).toBe(1);
    expect(g.find((x) => x.key === "__none")).toMatchObject({ label: "未打标签", count: 1 });
    expect(g[0].pnl).toBeLessThanOrEqual(g[g.length - 1].pnl); // 按盈亏升序
  });
  it("按策略：胜率、盈亏比", () => {
    const g = statsByStrategy(trades, journals, strategies);
    const s1 = g.find((x) => x.key === "s1")!;
    expect(s1).toMatchObject({ count: 2, wins: 1, losses: 1, winRate: 0.5, pnl: 20 });
    expect(s1.payoffRatio).toBeCloseTo(50 / 30, 4);
    expect(g.find((x) => x.key === "__none")!.count).toBe(2);
  });
  it("按情绪与评分", () => {
    const e = statsByEmotion(trades, journals, BUILTIN_EMOTIONS);
    expect(e.find((x) => x.label === "FOMO")).toMatchObject({ count: 2, pnl: -50 });
    const r = statsByRating(trades, journals);
    expect(r.map((x) => x.key)).toEqual(["r5", "r4", "r2", "__none"]);
    expect(r.find((x) => x.key === "r2")).toMatchObject({ count: 2, pnl: -50, payoffRatio: 0 });
  });
  it("错误标签造成的亏损：每笔只计一次，并给出占全部亏损的比例", () => {
    const m = mistakeImpact(trades, journals, tags);
    expect(m.count).toBe(3); // b, c, d
    expect(m.lossSum).toBe(-50);
    expect(m.netPnl).toBe(-40);
    expect(m.shareOfAllLosses).toBe(1);
    expect(m.byTag.map((x) => x.key).sort()).toEqual(["m-chase", "m-nostop", "m-oversize"]);
    expect(mistakeImpact([tr("z", 5)], {}, tags)).toMatchObject({ count: 0, lossSum: 0, shareOfAllLosses: 0 });
  });
});

describe("交易列表筛选与排序", () => {
  it("筛选：标签/策略/情绪/评分/盈亏/方向/代码", () => {
    const ids = (f: Parameters<typeof filterTrades>[2]) => filterTrades(trades, journals, f).map((t) => t.id);
    expect(ids({ tagId: "m-chase" })).toEqual(["b", "c"]);
    expect(ids({ strategyId: "s1" })).toEqual(["a", "b"]);
    expect(ids({ emotionId: "e-8" })).toEqual(["b", "c"]);
    expect(ids({ minRating: 4 })).toEqual(["a", "d"]);
    expect(ids({ ratingUnset: true })).toEqual(["e"]);
    expect(ids({ result: "win" })).toEqual(["a", "d"]);
    expect(ids({ result: "loss" })).toEqual(["b", "c"]);
    expect(ids({ result: "flat" })).toEqual(["e"]);
    expect(ids({ direction: "short" })).toEqual(["d"]);
    expect(ids({ code: "eth" })).toEqual(["d"]);
    expect(ids({ tagId: "m-chase", strategyId: "s2" })).toEqual(["c"]);
  });
  it("排序：盈亏、评分、时间；稳定排序", () => {
    expect(sortTrades(trades, "pnl", "desc").map((t) => t.id)).toEqual(["a", "d", "e", "c", "b"]);
    expect(sortTrades(trades, "rating", "desc", journals).map((t) => t.id)).toEqual(["a", "d", "b", "c", "e"]);
    const t2 = [tr("x", 1, { entryDate: "2026-11-03" }), tr("y", 1, { entryTime: "00:30:00" }), tr("z", 1)];
    expect(sortTrades(t2, "entry", "asc").map((t) => t.id)).toEqual(["x", "y", "z"]);
  });
});

describe("Markdown 渲染", () => {
  it("转义 HTML，支持列表/粗体/标题", () => {
    const html = renderMarkdown("# 标题\n- **要点** 一\n- `代码`\n<script>alert(1)</script>");
    expect(html).toContain("<h4>标题</h4>");
    expect(html).toContain("<ul><li><strong>要点</strong> 一</li><li><code>代码</code></li></ul>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
