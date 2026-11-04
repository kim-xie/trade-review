/** 复盘日志的数据模型与内置项（纯数据，无副作用）。存储见 db.ts。 */

export type TagKind = "mistake" | "normal";

export interface Tag {
  id: string;
  name: string;
  color: string;
  kind: TagKind;
  builtin?: boolean;
}

export interface Strategy {
  id: string;
  name: string;
  description?: string;
}

export interface Emotion {
  id: string;
  name: string;
  builtin?: boolean;
}

/** 一笔交易的复盘记录，按 ClosedTrade.id 关联 */
export interface Journal {
  tradeId: string;
  tagIds: string[];
  strategyId?: string;
  /** 入场原因 */
  entryReason?: string;
  /** 复盘笔记（简单 Markdown） */
  notes?: string;
  /** 执行评分 1-5 */
  rating?: number;
  emotionId?: string;
  /** 计划止损价 / 目标价 */
  stopLoss?: number;
  takeProfit?: number;
  /** 是否按计划执行：true / false / undefined（未填） */
  followedPlan?: boolean;
  updatedAt: string;
}

export const BUILTIN_TAGS: Tag[] = [
  { id: "m-chase", name: "追高", color: "#f97316", kind: "mistake", builtin: true },
  { id: "m-nostop", name: "没止损", color: "#ef4444", kind: "mistake", builtin: true },
  { id: "m-oversize", name: "重仓", color: "#eab308", kind: "mistake", builtin: true },
  { id: "m-unplanned", name: "计划外交易", color: "#a855f7", kind: "mistake", builtin: true },
];

export const BUILTIN_EMOTIONS: Emotion[] = [
  "平静",
  "自信",
  "犹豫",
  "焦虑",
  "贪婪",
  "恐惧",
  "报复心态",
  "FOMO",
].map((name, i) => ({ id: `e-${i + 1}`, name, builtin: true }));

export const TAG_COLORS = ["#22d3ee", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#eab308", "#84cc16", "#10b981", "#ef4444", "#94a3b8"];

export function emptyJournal(tradeId: string): Journal {
  return { tradeId, tagIds: [], updatedAt: new Date(0).toISOString() };
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 渲染极简 Markdown 为安全的 HTML（先整体转义，只支持标题、粗体、斜体、行内代码、列表、换行） */
export function renderMarkdown(md: string): string {
  const esc = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const inline = (s: string) =>
    s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  const lines = esc.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      if (!inList) out.push("<ul>");
      inList = true;
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) out.push(`<h${h[1].length + 3}>${inline(h[2])}</h${h[1].length + 3}>`);
    else if (line.trim() === "") out.push("<br/>");
    else out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
}
