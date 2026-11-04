/** 产品可配置项（集中放这里，后续可改为远程配置）。 */
export const FREE_TIER = {
  /** 免费版可分析的天数 */
  windowDays: 30,
  /**
   * 窗口基准：
   * - "today"：以今天为基准往前 windowDays 天（默认，kim 已确认）
   * - "latestTrade"：以导入数据中最新的成交日期为基准
   */
  basis: "today" as "today" | "latestTrade",
};

export const PRICING = {
  /** 买断价（元） */
  lifetimePrice: 49,
  /** 首周优惠价（元） */
  launchWeekPrice: 29,
};
