// Test-only browser entry for e2e/xlsx-browser.spec.ts: bundled by Vite into a temp folder and run
// in Chromium. Writes the hand-built sheet with writeXlsx and renders its report with renderReportHtml.
import { buildReport, renderReportHtml } from "../../src/report/index.ts";
import { writeXlsx } from "../../src/xlsx/index.ts";
import { handBuilt } from "./xlsx-sheet.ts";

export async function run(): Promise<{ plain: boolean; bytes: number[]; notes: number; html: string }> {
  const input = handBuilt();
  const { bytes, notes } = await writeXlsx(input);
  const report = buildReport({ fileName: "BOOK.WK1", sha256: "0".repeat(64), byteLength: 0, toolVersion: "0.0.0", verification: input.verification });
  return { plain: Object.getPrototypeOf(bytes) === Uint8Array.prototype, bytes: Array.from(bytes), notes: notes.length, html: renderReportHtml(report) };
}
