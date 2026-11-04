import { ALL_KNOWN_HEADERS, normalizeHeader } from "./presets";

export interface LocatedTable {
  headers: string[];
  rows: string[][];
  /** 表头在原始表格中的行号（0 起） */
  headerRowIndex: number;
}

/** 清洗单元格：去 BOM、首尾空白，处理 Excel 文本保护写法 ="000878" */
export function cleanCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  s = s.replace(/^\uFEFF/, "").trim();
  const m = s.match(/^="(.*)"$/);
  if (m) s = m[1];
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s.trim();
}

/**
 * 定位表头行：在前 maxScan 行里找“命中已知列名最多”的那一行（至少命中 minHits 个），
 * 用来跳过券商导出文件开头的标题、账号、查询区间等说明行。
 */
export function locateHeader(raw: unknown[][], maxScan = 30, minHits = 2): LocatedTable | null {
  let bestIdx = -1;
  let bestHits = 0;
  const limit = Math.min(raw.length, maxScan);
  for (let i = 0; i < limit; i++) {
    const hits = raw[i].map((c) => normalizeHeader(cleanCell(c))).filter((h) => h && ALL_KNOWN_HEADERS.has(h)).length;
    if (hits > bestHits) {
      bestHits = hits;
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestHits < minHits) return null;
  const headers = raw[bestIdx].map(cleanCell);
  // 去掉末尾空列
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  const rows = raw
    .slice(bestIdx + 1)
    .map((r) => headers.map((_, i) => cleanCell(r[i])))
    .filter((r) => r.some((c) => c !== ""));
  return { headers, rows, headerRowIndex: bestIdx };
}
