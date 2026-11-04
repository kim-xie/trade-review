import { decodeText, sniffKind, type FileKind, type TextEncodingName } from "./decode";
import { locateHeader, type LocatedTable } from "./table";

export interface ParsedFile extends LocatedTable {
  kind: FileKind;
  encoding?: TextEncodingName;
  delimiter?: string;
  sheetName?: string;
}

/** 用 Papa Parse 解析文本（自动识别逗号/制表符/分号分隔） */
export async function parseTextTable(text: string): Promise<{ rows: string[][]; delimiter: string }> {
  const Papa = (await import("papaparse")).default;
  const res = Papa.parse<string[]>(text, {
    delimiter: "",
    delimitersToGuess: ["\t", ",", ";", "|"],
    skipEmptyLines: "greedy",
  });
  return { rows: res.data, delimiter: res.meta.delimiter };
}

/** 用 SheetJS 解析 xlsx / 真 xls，取第一个工作表 */
export async function parseWorkbook(bytes: Uint8Array): Promise<{ rows: string[][]; sheetName: string }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
    dateNF: "yyyy-mm-dd",
  });
  return { rows, sheetName };
}

/**
 * 解析导入文件（浏览器与 Node 通用；重库按需动态加载）。
 * 找不到表头时抛错。
 */
export async function parseFileBytes(bytes: Uint8Array): Promise<ParsedFile> {
  const kind = sniffKind(bytes);
  if (kind === "xlsx" || kind === "xls") {
    const { rows, sheetName } = await parseWorkbook(bytes);
    const t = locateHeader(rows);
    if (!t) throw new Error("没有找到表头行（需要包含“证券代码”“成交日期”等列名）");
    return { ...t, kind, sheetName };
  }
  const { text, encoding } = decodeText(bytes);
  const { rows, delimiter } = await parseTextTable(text);
  const t = locateHeader(rows);
  if (!t) throw new Error("没有找到表头行（需要包含“证券代码”“成交日期”等列名）");
  return { ...t, kind, encoding, delimiter };
}
