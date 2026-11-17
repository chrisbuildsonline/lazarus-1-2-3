// The only exceljs import (requirement 2). Turns cell plans into workbook bytes. Section names
// are from the exceljs README (https://github.com/exceljs/exceljs#readme).
import ExcelJS from "exceljs";
import { escapeOoxmlText, type PlannedValue } from "./labels.ts";
import type { CellPlan } from "./plan.ts";

const FIXED_DATE = new Date(Date.UTC(1980, 0, 1));
const AUTHOR = "Lazarus 1-2-3";

const plain = (v: PlannedValue): ExcelJS.CellValue =>
  v.kind === "number" ? v.value : v.kind === "text" ? escapeOoxmlText(v.value) : v.kind === "error" ? ({ error: v.code } as ExcelJS.CellErrorValue) : null;

export async function buildWorkbookBytes(plans: readonly CellPlan[]): Promise<Uint8Array> {
  // "Create a Workbook"
  const workbook = new ExcelJS.Workbook();
  // "Set Workbook Properties". calcProperties.fullCalcOnLoad stays unset (requirement 18).
  workbook.creator = AUTHOR;
  workbook.lastModifiedBy = AUTHOR;
  workbook.created = FIXED_DATE;
  workbook.modified = FIXED_DATE;
  // "Add a Worksheet"
  const sheet = workbook.addWorksheet("Sheet1");
  for (const p of plans) {
    const cell = sheet.getCell(p.row + 1, p.col + 1);
    if (p.formula !== null) {
      // "Formula Value"; an error result is an "Error Value"
      const result = plain(p.value);
      cell.value = (result === null ? { formula: p.formula } : { formula: p.formula, result }) as ExcelJS.CellFormulaValue;
    } else {
      // "Number Value", "String Value", "Error Value"
      cell.value = plain(p.value);
    }
    // "Styles" > "Alignment"
    if (p.alignment) cell.alignment = { horizontal: p.alignment };
    // "Cell Comments"
    if (p.note !== null) cell.note = p.note;
  }
  // "Writing XLSX": a Node buffer under bun, an ArrayBuffer in a browser; copy into a plain Uint8Array.
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
