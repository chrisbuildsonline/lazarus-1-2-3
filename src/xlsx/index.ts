// XLSX writer entry point (requirement 1): plan the cells, build the workbook with exceljs, then
// fix the ZIP timestamps so the same input gives the same bytes.
import { buildWorkbookBytes } from "./exceljs-adapter.ts";
import { planWorkbook, type WriterNote, type XlsxInput } from "./plan.ts";
import { normalizeZipTimestamps } from "./zip-normalize.ts";

export type { Alignment, PlannedValue } from "./labels.ts";
export type { CellPlan, WriterNote, WriterNoteCode, XlsxInput } from "./plan.ts";

export type XlsxResult = { bytes: Uint8Array; notes: WriterNote[] };

export async function writeXlsx(input: XlsxInput): Promise<XlsxResult> {
  const { cells, notes } = planWorkbook(input);
  const raw = await buildWorkbookBytes(cells);
  const bytes = normalizeZipTimestamps(raw);
  if (bytes) return { bytes, notes };
  return { bytes: raw, notes: [...notes, { address: "", code: "zip-not-normalised", message: "The ZIP timestamps could not be fixed; the bytes are as exceljs wrote them." }] };
}
