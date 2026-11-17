// Reads written XLSX bytes back with exceljs. The only test helper that imports exceljs.
// `result` comes from `cell.result`: `cell.value` drops a formula result of 0 on read
// (see tests/unit/xlsx/exceljs-probe.test.ts). Notes are read from xl/comments1.xml with JSZip
// (the ZIP library exceljs itself uses): exceljs's reader drops a note whose cell has no value,
// although the file holds it.
import ExcelJS from "exceljs";
import JSZip from "jszip";

const unescapeXml = (s: string) => s.replace(/&(lt|gt|quot|apos|amp);/g, (_, e: string) => ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[e]!);

async function readNotes(bytes: Uint8Array): Promise<Map<string, string>> {
  const xml = await (await JSZip.loadAsync(bytes)).file("xl/comments1.xml")?.async("string");
  const notes = new Map<string, string>();
  for (const m of xml?.matchAll(/<comment ref="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/comment>/g) ?? []) {
    notes.set(m[1]!, unescapeXml([...m[2]!.matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  }
  return notes;
}

export type ReadCell = {
  value: ExcelJS.CellValue;
  formula: string | null;
  result: unknown;
  alignment: string | null;
  note: string | null;
  numFmt: string | null;
};

export type ReadBack = {
  sheetNames: string[];
  cells: Map<string, ReadCell>;
  creator: string;
  lastModifiedBy: string;
  created: Date;
  modified: Date;
  fullCalcOnLoad: boolean | undefined;
};

const empty = (note: string): ReadCell => ({ value: null, formula: null, result: undefined, alignment: null, note, numFmt: null });

/** Cells in row-major order: every cell with a value, and every cell with a note. */
export async function readXlsx(bytes: Uint8Array): Promise<ReadBack> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const notes = await readNotes(bytes);
  const found = new Map<string, ReadCell>();
  wb.worksheets[0]?.eachRow((row) =>
    row.eachCell((cell) => {
      const isFormula = cell.type === ExcelJS.ValueType.Formula;
      found.set(cell.address, {
        value: isFormula ? null : cell.value,
        formula: isFormula ? cell.formula : null,
        result: isFormula ? cell.result : undefined,
        alignment: cell.alignment?.horizontal ?? null,
        note: notes.get(cell.address) ?? null,
        numFmt: cell.numFmt ?? null,
      });
    }),
  );
  for (const [address, note] of notes) if (!found.has(address)) found.set(address, empty(note));
  const key = (a: string) => {
    const [, col, row] = /^([A-Z]+)(\d+)$/.exec(a)!;
    return Number(row) * 20000 + [...col!].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  };
  const cells = new Map([...found].sort(([a], [b]) => key(a) - key(b)));
  return {
    sheetNames: wb.worksheets.map((w) => w.name),
    cells,
    creator: wb.creator,
    lastModifiedBy: wb.lastModifiedBy,
    created: wb.created,
    modified: wb.modified,
    fullCalcOnLoad: wb.calcProperties.fullCalcOnLoad,
  };
}
