// Download names (requirement 54): the entry's base name without its final .wk1/.wks/.wk3/.dbf, made safe
// for Windows, macOS and Linux file systems, then the suffix of the download kind.
export type DownloadKind = "xlsx" | "report-html" | "report-json";

const SUFFIX: Record<DownloadKind, string> = { xlsx: ".xlsx", "report-html": ".report.html", "report-json": ".report.json" };
const MAX_BASE = 100;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

const trimDotsAndSpaces = (s: string) => s.replace(/^[ .]+|[ .]+$/g, "");

export function downloadName(entryName: string, kind: DownloadKind): string {
  const file = entryName.split(/[\\/]/).pop() ?? "";
  let base = file
    .replace(/\.(wk1|wks|wk3|dbf)$/i, "")
    // Forbidden characters, control characters and lone surrogates become _.
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]|\p{Cs}/gu, "_");
  base = trimDotsAndSpaces(base);
  if (base.length > MAX_BASE) {
    const high = base.charCodeAt(MAX_BASE - 1);
    base = base.slice(0, high >= 0xd800 && high <= 0xdbff ? MAX_BASE - 1 : MAX_BASE);
    base = trimDotsAndSpaces(base);
  }
  if (base === "") base = "workbook";
  if (RESERVED.test(base)) base = `_${base}`;
  return `${base}${SUFFIX[kind]}`;
}
