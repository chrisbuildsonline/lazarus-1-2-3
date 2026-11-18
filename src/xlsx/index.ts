// XLSX writer entry point (requirement 1): plan the cells, build the workbook with exceljs, then
// fix the ZIP timestamps so the same input gives the same bytes. One sheet (XlsxInput) is written
// as a workbook with one worksheet named Sheet1, so its bytes are the same either way.
import { buildWorkbookBytes } from "./exceljs-adapter.ts";
import { planWorkbook, type WriterNote, type XlsxInput, type XlsxWorkbookInput } from "./plan.ts";
import { excelSheetName } from "./sheet-names.ts";
import { normalizeZipTimestamps } from "./zip-normalize.ts";

export type { Alignment, PlannedValue } from "./labels.ts";
export type { CellPlan, WriterNote, WriterNoteCode, XlsxInput, XlsxSheetInput, XlsxWorkbookInput } from "./plan.ts";

export type XlsxResult = { bytes: Uint8Array; notes: WriterNote[] };

export async function writeXlsx(input: XlsxInput | XlsxWorkbookInput): Promise<XlsxResult> {
  const notes: WriterNote[] = [];
  const sheets = [];
  if ("sheets" in input) {
    const taken = new Set<string>();
    for (const s of input.sheets) {
      const { name, changed } = excelSheetName(s.name, taken);
      if (changed) notes.push({ sheet: name, address: "", code: "sheet-name-changed", message: `The sheet name "${s.name}" is not allowed in Excel or is already used; it is written as "${name}".` });
      const plan = planWorkbook(s);
      notes.push(...plan.notes.map((n) => ({ sheet: name, ...n })));
      sheets.push({ name, cells: plan.cells });
    }
  } else {
    const plan = planWorkbook(input);
    notes.push(...plan.notes);
    sheets.push({ name: "Sheet1", cells: plan.cells });
  }
  const raw = await buildWorkbookBytes(sheets);
  const bytes = normalizeZipTimestamps(raw);
  if (bytes) return { bytes, notes };
  return { bytes: raw, notes: [...notes, { address: "", code: "zip-not-normalised", message: "The ZIP timestamps could not be fixed; the bytes are as exceljs wrote them." }] };
}
