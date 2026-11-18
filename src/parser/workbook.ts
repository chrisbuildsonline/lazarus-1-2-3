// One entry point for every format: the reader is chosen from the bytes (detectKind), never the name.

import { parseDbf, type DbfStats, type DbfTable } from "./dbf.ts";
import { detectKind } from "./detect.ts";
import type { Diagnostic } from "./diagnostics.ts";
import type { Workbook } from "./sheet.ts";
import { parseWk1, type Wk1Stats } from "./wk1.ts";
import { parseWk3, type Wk3Stats } from "./wk3.ts";

export type WorkbookParseResult =
  | { kind: "wk1"; workbook: Workbook; diagnostics: Diagnostic[]; stats: Wk1Stats }
  | { kind: "wk3"; workbook: Workbook; diagnostics: Diagnostic[]; stats: Wk3Stats }
  | { kind: "dbf"; workbook: Workbook; diagnostics: Diagnostic[]; stats: DbfStats; table: DbfTable };

export type WorkbookStats = Wk1Stats | Wk3Stats | DbfStats;

export function parseWorkbook(bytes: Uint8Array): WorkbookParseResult {
  switch (detectKind(bytes)) {
    case "wk3":
      return { kind: "wk3", ...parseWk3(bytes) };
    case "dbf":
      return { kind: "dbf", ...parseDbf(bytes) };
    default: {
      const r = parseWk1(bytes);
      return { kind: "wk1", workbook: { format: r.sheet.format, sheets: [{ name: "Sheet1", sheet: r.sheet }] }, diagnostics: r.diagnostics, stats: r.stats };
    }
  }
}
