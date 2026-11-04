/**
 * IndexedDB 存储（Dexie）。数据只保存在用户浏览器本地，不上传服务器。
 * 只能在浏览器中使用（组件内动态 import 本文件）。
 */
import Dexie, { type Table } from "dexie";
import { BUILTIN_EMOTIONS, BUILTIN_TAGS, type Emotion, type Journal, type Strategy, type Tag } from "./journal";
import type { Candle, Interval } from "./kline/types";
import type { Fill } from "./types";

export interface ImportBatch {
  id?: number;
  fileName: string;
  presetId: string;
  importedAt: string;
  rowCount: number;
  addedCount: number;
  skippedCount: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

/** 旧版预留表（v1），保留以兼容 */
export interface NoteRow {
  id?: number;
  tradeId: string;
  text: string;
  tags: string[];
  updatedAt: string;
}

/** K 线缓存：series = `${source}|${symbol}|${interval}` */
export interface CandleRow extends Candle {
  id: string;
  series: string;
}

export interface CandleRange {
  id?: number;
  series: string;
  start: number;
  end: number;
}

class TradeReviewDB extends Dexie {
  fills!: Table<Fill, string>;
  imports!: Table<ImportBatch, number>;
  settings!: Table<SettingRow, string>;
  notes!: Table<NoteRow, number>;
  journals!: Table<Journal, string>;
  tags!: Table<Tag, string>;
  strategies!: Table<Strategy, string>;
  emotions!: Table<Emotion, string>;
  candles!: Table<CandleRow, string>;
  candleRanges!: Table<CandleRange, number>;

  constructor() {
    super("trade-review");
    this.version(1).stores({
      fills: "id, code, date, side",
      imports: "++id, importedAt",
      settings: "key",
      notes: "++id, tradeId, *tags",
    });
    this.version(2)
      .stores({
        journals: "tradeId, strategyId, emotionId, rating, *tagIds",
        tags: "id, kind",
        strategies: "id",
        emotions: "id",
        candles: "id, [series+t]",
        candleRanges: "++id, series",
      })
      .upgrade(async (tx) => {
        await tx.table("tags").bulkPut(BUILTIN_TAGS);
        await tx.table("emotions").bulkPut(BUILTIN_EMOTIONS);
      });
    this.on("populate", async (tx) => {
      await tx.table("tags").bulkPut(BUILTIN_TAGS);
      await tx.table("emotions").bulkPut(BUILTIN_EMOTIONS);
    });
  }
}

let _db: TradeReviewDB | null = null;
export function getDb(): TradeReviewDB {
  if (!_db) _db = new TradeReviewDB();
  return _db;
}

/** 写入成交记录，按 id 去重；返回新增条数 */
export async function saveFills(fills: Fill[], batch: Omit<ImportBatch, "id" | "addedCount">): Promise<number> {
  const db = getDb();
  return db.transaction("rw", db.fills, db.imports, async () => {
    const existing = new Set(await db.fills.where("id").anyOf(fills.map((f) => f.id)).primaryKeys());
    const fresh = fills.filter((f) => !existing.has(f.id));
    await db.fills.bulkPut(fresh);
    await db.imports.add({ ...batch, addedCount: fresh.length });
    return fresh.length;
  });
}

export async function loadFills(): Promise<Fill[]> {
  return getDb().fills.toArray();
}

/** 清空成交与复盘记录（保留标签库、策略库、情绪库与 K 线缓存） */
export async function clearAll(): Promise<void> {
  const db = getDb();
  await Promise.all([db.fills.clear(), db.imports.clear(), db.notes.clear(), db.journals.clear()]);
}

// ---------- 复盘日志 ----------

export interface JournalData {
  journals: Record<string, Journal>;
  tags: Tag[];
  strategies: Strategy[];
  emotions: Emotion[];
}

export async function loadJournalData(): Promise<JournalData> {
  const db = getDb();
  const [journals, tags, strategies, emotions] = await Promise.all([db.journals.toArray(), db.tags.toArray(), db.strategies.toArray(), db.emotions.toArray()]);
  return {
    journals: Object.fromEntries(journals.map((j) => [j.tradeId, j])),
    tags: tags.length ? tags : BUILTIN_TAGS,
    strategies,
    emotions: emotions.length ? emotions : BUILTIN_EMOTIONS,
  };
}

export async function saveJournal(j: Journal): Promise<void> {
  await getDb().journals.put({ ...j, updatedAt: new Date().toISOString() });
}

export async function putTag(t: Tag): Promise<void> {
  await getDb().tags.put(t);
}

/** 删除标签，并从所有复盘记录中移除该标签 */
export async function deleteTag(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.tags, db.journals, async () => {
    await db.tags.delete(id);
    const affected = await db.journals.where("tagIds").equals(id).toArray();
    await db.journals.bulkPut(affected.map((j) => ({ ...j, tagIds: j.tagIds.filter((x) => x !== id) })));
  });
}

export async function putStrategy(s: Strategy): Promise<void> {
  await getDb().strategies.put(s);
}

export async function deleteStrategy(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.strategies, db.journals, async () => {
    await db.strategies.delete(id);
    const affected = await db.journals.where("strategyId").equals(id).toArray();
    await db.journals.bulkPut(affected.map((j) => ({ ...j, strategyId: undefined })));
  });
}

export async function putEmotion(e: Emotion): Promise<void> {
  await getDb().emotions.put(e);
}

export async function deleteEmotion(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.emotions, db.journals, async () => {
    await db.emotions.delete(id);
    const affected = await db.journals.where("emotionId").equals(id).toArray();
    await db.journals.bulkPut(affected.map((j) => ({ ...j, emotionId: undefined })));
  });
}

// ---------- K 线缓存 ----------

export const seriesKey = (source: string, symbol: string, interval: Interval) => `${source}|${symbol}|${interval}`;

export async function readCachedCandles(series: string, start: number, end: number): Promise<{ candles: Candle[]; covered: boolean }> {
  const db = getDb();
  const ranges = await db.candleRanges.where("series").equals(series).toArray();
  const covered = ranges.some((r) => r.start <= start && r.end >= end);
  const rows = await db.candles.where("[series+t]").between([series, start], [series, end], true, true).toArray();
  return { candles: rows.map(({ t, o, h, l, c, v }) => ({ t, o, h, l, c, v })), covered };
}

/** 写入缓存；markCovered=false 时（例如区间包含尚未收盘的 K 线）不登记覆盖范围，下次会重新拉取 */
export async function writeCachedCandles(series: string, candles: Candle[], range: { start: number; end: number } | null): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.candles, db.candleRanges, async () => {
    await db.candles.bulkPut(candles.map((c) => ({ ...c, series, id: `${series}|${c.t}` })));
    if (range) await db.candleRanges.add({ series, ...range });
  });
}

export async function listCachedSeries(symbol: string): Promise<string[]> {
  const db = getDb();
  const all = await db.candleRanges.toArray();
  return [...new Set(all.map((r) => r.series).filter((s) => s.split("|")[1] === symbol))];
}

/** 删除某个数据源的全部 K 线缓存（如“清除 Tushare 缓存”） */
export async function clearCachedSource(source: string): Promise<number> {
  const db = getDb();
  const prefix = `${source}|`;
  await db.candleRanges.filter((r) => r.series.startsWith(prefix)).delete();
  return db.candles.filter((c) => c.series.startsWith(prefix)).delete();
}
