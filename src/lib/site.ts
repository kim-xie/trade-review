/**
 * 站点配置唯一来源。域名只从 NEXT_PUBLIC_SITE_URL 读取，任何地方都不要硬编码域名。
 */
const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const SITE_URL = rawUrl.replace(/\/+$/, "");
export const SITE_NAME = "交易复盘工具";
export const SITE_TITLE = "交易复盘工具 - 股票交易日志与交易记录分析（本地优先）";
export const SITE_DESCRIPTION =
  "免费试用的股票复盘工具：导入东方财富、同花顺、华泰等券商交割单，自动先进先出配对成笔，统计胜率、盈亏比、最大回撤与资金曲线。交易日志与交易记录分析，数据只保存在你的浏览器本地。";
export const SITE_KEYWORDS = [
  "交易复盘",
  "交易日志",
  "股票复盘工具",
  "交易记录分析",
  "交割单分析",
  "胜率统计",
  "盈亏比",
  "最大回撤",
  "资金曲线",
];

/** 生成绝对地址，例如 absoluteUrl('/blog') */
export function absoluteUrl(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${p === "/" ? "" : p}` || SITE_URL;
}

export const DISCLAIMER = "仅用于个人交易记录分析，不构成投资建议。";

/** 默认 OG 图（public/og.png）。子页面覆盖 openGraph 时需要显式带上，否则会丢失图片 */
export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: SITE_NAME };
