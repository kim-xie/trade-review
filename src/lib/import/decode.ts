/**
 * 文件格式与编码嗅探。
 *
 * 国内券商导出的 .xls 很多其实是 GBK/GB18030 编码的制表符文本（例如华泰专业版Ⅲ的 table.xls），
 * 所以不能只看扩展名：先看文件头魔数，xlsx（PK）/ 真 xls（D0 CF 11 E0）交给 SheetJS，其余都按文本处理。
 */

export type FileKind = "xlsx" | "xls" | "text";

export function sniffKind(bytes: Uint8Array): FileKind {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "xlsx";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1
  )
    return "xls";
  return "text";
}

export type TextEncodingName = "utf-8" | "utf-16le" | "utf-16be" | "gbk";

export interface DecodedText {
  text: string;
  encoding: TextEncodingName;
}

/**
 * 解码文本：
 * 1. 有 BOM 按 BOM；
 * 2. 尝试严格 UTF-8（fatal），成功即用；
 * 3. 失败则用 TextDecoder('gbk')（WHATWG 规范中 gbk 解码器与 gb18030 相同，可覆盖 GB18030 文件）。
 */
export function decodeText(bytes: Uint8Array): DecodedText {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be" };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("gbk").decode(bytes), encoding: "gbk" };
  }
}
