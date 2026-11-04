import { describe, expect, it } from "vitest";
import {
  aggregateByDay,
  aggregateByMonth,
  aggregateByWeek,
  aggregateByYear,
  buildMonthMatrix,
  buildYearArchive,
  buildYearBreakdown,
  dayOfWeek,
  daysInMonth,
  isLeapYear,
  lockStateForRange,
  shiftMonth,
  weekStartOf,
} from "../src/lib/calendar";

const t = (exitDate: string, pnl: number, totalFees = 1) => ({ exitDate, pnl, totalFees });

const trades = [
  t("2026-10-30", 100),
  t("2026-10-31", -40),
  t("2026-11-01", 50),
  t("2026-11-01", -20),
  t("2026-11-04", 0),
  t("2025-12-31", 300),
];

describe("基础日期工具", () => {
  it("星期与周起始", () => {
    expect(dayOfWeek("2026-11-01")).toBe(0); // 周日
    expect(dayOfWeek("2026-11-04")).toBe(3);
    expect(weekStartOf("2026-11-04")).toBe("2026-11-01");
    expect(weekStartOf("2026-11-04", 1)).toBe("2026-11-02");
    expect(weekStartOf("2026-11-01", 1)).toBe("2026-10-26");
  });
  it("闰年与月天数", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
  it("月份切换跨年", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 11, -13)).toEqual({ year: 2025, month: 10 });
  });
});

describe("按日/周/月/年聚合", () => {
  it("按日：盈亏、笔数、胜率（持平不算胜）", () => {
    const d = aggregateByDay(trades);
    expect(d["2026-11-01"]).toEqual({ pnl: 30, count: 2, wins: 1, losses: 1, winRate: 0.5, fees: 2 });
    expect(d["2026-11-04"]).toMatchObject({ count: 1, wins: 0, losses: 0, winRate: 0 });
  });
  it("按周：跨月的周归到同一周（周日起始）", () => {
    const w = aggregateByWeek(trades);
    // 2026-10-25(日) ~ 10-31(六)；11-01(日) ~ 11-07(六)
    expect(w["2026-10-25"]).toMatchObject({ pnl: 60, count: 2 });
    expect(w["2026-11-01"]).toMatchObject({ pnl: 30, count: 3 });
    // 周一起始时，10-30 ~ 11-01 同属 10-26 这一周
    const w1 = aggregateByWeek(trades, 1);
    expect(w1["2026-10-26"]).toMatchObject({ pnl: 90, count: 4 });
  });
  it("按月、按年；跨年周", () => {
    expect(aggregateByMonth(trades)["2026-10"]).toMatchObject({ pnl: 60, count: 2 });
    expect(aggregateByMonth(trades)["2026-11"]).toMatchObject({ pnl: 30, count: 3 });
    expect(aggregateByYear(trades)).toMatchObject({ "2025": { pnl: 300 }, "2026": { pnl: 90, count: 5 } });
    expect(weekStartOf("2025-12-31")).toBe("2025-12-28");
    expect(aggregateByWeek([t("2025-12-31", 1), t("2026-01-02", 2)])["2025-12-28"]).toMatchObject({ count: 2, pnl: 3 });
  });
});

describe("月度执行矩阵", () => {
  it("2026 年 11 月：首行从 11-01 周日开始，共 5 行，周汇总只算本月", () => {
    const m = buildMonthMatrix(2026, 11, trades, { today: "2026-11-04" });
    expect(m.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(m.weeks).toHaveLength(5);
    expect(m.weeks[0].days[0].date).toBe("2026-11-01");
    expect(m.weeks[0]).toMatchObject({ start: "2026-11-01", end: "2026-11-07" });
    expect(m.weeks[0].stats).toMatchObject({ pnl: 30, count: 3, wins: 1 });
    expect(m.weeks[0].days[3]).toMatchObject({ date: "2026-11-04", isToday: true });
    const lastRow = m.weeks[4];
    expect(lastRow).toMatchObject({ start: "2026-11-29", end: "2026-11-30" });
    expect(lastRow.days[2].inMonth).toBe(false);
    expect(m.stats).toMatchObject({ pnl: 30, count: 3 });
  });
  it("跨月周：10 月最后一行包含 11 月日期但不计入", () => {
    const m = buildMonthMatrix(2026, 10, trades);
    const last = m.weeks[m.weeks.length - 1];
    expect(last.start).toBe("2026-10-25");
    expect(last.end).toBe("2026-10-31");
    expect(last.stats).toMatchObject({ pnl: 60, count: 2 });
    const first = m.weeks[0];
    expect(first.days[0]).toMatchObject({ date: "2026-09-27", inMonth: false, stats: null });
    expect(first.start).toBe("2026-10-01");
  });
  it("周一起始", () => {
    const m = buildMonthMatrix(2026, 11, trades, { weekStartsOn: 1 });
    expect(m.weekdays).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(m.weeks[0].days[6].date).toBe("2026-11-01");
    expect(m.weeks[0].stats).toMatchObject({ pnl: 30, count: 2 });
  });
  it("空月", () => {
    const m = buildMonthMatrix(2026, 3, trades);
    expect(m.stats.count).toBe(0);
    expect(m.weeks.every((w) => w.days.every((d) => d.stats === null))).toBe(true);
  });
  it("闰年二月：2024-02 共 29 天；2026-02 恰好 4 行", () => {
    const m = buildMonthMatrix(2024, 2, [t("2024-02-29", 10)]);
    const cells = m.weeks.flatMap((w) => w.days).filter((d) => d.inMonth);
    expect(cells).toHaveLength(29);
    expect(cells.at(-1)).toMatchObject({ date: "2024-02-29", stats: { pnl: 10 } });
    expect(buildMonthMatrix(2026, 2, []).weeks).toHaveLength(4); // 2026-02-01 是周日
  });
  it("免费版锁定：窗口外日期锁定且不展示数值", () => {
    const m = buildMonthMatrix(2026, 10, trades, { cutoffDate: "2026-10-31" });
    const cells = m.weeks.flatMap((w) => w.days).filter((d) => d.inMonth);
    const d30 = cells.find((d) => d.date === "2026-10-30")!;
    expect(d30).toMatchObject({ locked: true, stats: null });
    expect(cells.find((d) => d.date === "2026-10-31")).toMatchObject({ locked: false, stats: { pnl: -40 } });
    expect(m.weeks.at(-1)!.lock).toBe("partial");
    expect(m.weeks[0].lock).toBe("full");
    expect(m.lock).toBe("partial");
    expect(m.stats.pnl).toBe(-40);
  });
});

describe("月度绩效分解与年度归档", () => {
  it("12 个月 + 上下半年；当前月；空月为 null", () => {
    const y = buildYearBreakdown(2026, trades, { today: "2026-11-04" });
    expect(y.months).toHaveLength(12);
    expect(y.months[10]).toMatchObject({ key: "2026-11", isCurrent: true, stats: { pnl: 30 } });
    expect(y.months[0].stats).toBeNull();
    expect(y.firstHalf.count).toBe(0);
    expect(y.secondHalf).toMatchObject({ pnl: 90, count: 5 });
    expect(y.total.pnl).toBe(90);
  });
  it("锁定：窗口之前的整月为 full 且不含数值", () => {
    const y = buildYearBreakdown(2026, trades, { cutoffDate: "2026-10-06" });
    expect(y.months[8]).toMatchObject({ lock: "full", stats: null });
    expect(y.months[9].lock).toBe("partial");
    expect(y.firstHalfLock).toBe("full");
    expect(y.secondHalfLock).toBe("partial");
  });
  it("年度归档：倒序，含额外年份", () => {
    const a = buildYearArchive(trades, { extraYears: [2027] });
    expect(a.map((c) => c.year)).toEqual([2027, 2026, 2025]);
    expect(a[0].stats.count).toBe(0);
    expect(a[2].stats.pnl).toBe(300);
    expect(lockStateForRange("2025-01-01", "2025-12-31", "2026-10-06")).toBe("full");
    expect(lockStateForRange("2026-01-01", "2026-12-31", null)).toBe("none");
  });
});
