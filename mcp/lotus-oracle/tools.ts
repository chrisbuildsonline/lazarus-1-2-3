// The logic of the three lotus-oracle tools: thin wrappers over src/ that take plain input and
// return plain data. No MCP SDK import here (server.ts adapts the results). Nothing is parsed,
// decoded or verified in this file: parseWorkbook, translateFormula and verifyWorkbook do that.
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { OPCODE_TABLE, translateFormula } from "../../src/formula/index.ts";
import { a1, cellsInRowMajorOrder, parseWorkbook, type Cell, type Sheet, type WorkbookParseResult } from "../../src/parser/index.ts";
import { verifyWorkbook, type Value } from "../../src/verify/index.ts";
import { valueFromDouble } from "../../src/verify/value.ts";

export type ToolResult = { isError: boolean; data: unknown };

/** The app's per-file limit (src/ui/model/entries.ts LIMITS.maxBytes), so one call cannot exhaust memory. */
export const MAX_BYTES = 32 * 1024 * 1024;

const fail = (error: string): ToolResult => ({ isError: true, data: { error } });
const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;

export function opcodeLookup(opcode: number | string): ToolResult {
  const code = typeof opcode === "number" ? opcode : Number.parseInt(opcode, 16);
  const entry = OPCODE_TABLE.get(code);
  if (!entry) return fail(`Opcode ${hex(code)} is unknown: it is not in the opcode table. A cell that uses it stays unverifiable.`);
  return { isError: false, data: { ...entry, hex: hex(code) } };
}

type Read = { ok: true; parsed: WorkbookParseResult } | { ok: false; result: ToolResult };

/** Reads and parses one file, or says why it cannot: missing, a folder, too large, or not a Lotus or dBase file. */
async function readWorkbook(path: string): Promise<Read> {
  let bytes: Uint8Array;
  try {
    const info = await stat(path);
    if (info.isDirectory()) return { ok: false, result: fail(`${path}: is a folder, not a file`) };
    if (info.size > MAX_BYTES) return { ok: false, result: fail(`${path}: larger than 32 MiB (${info.size} bytes)`) };
    bytes = new Uint8Array(await readFile(path));
  } catch (err) {
    return { ok: false, result: fail(`${path}: ${(err as Error).message}`) };
  }
  const parsed = parseWorkbook(bytes);
  const empty = parsed.workbook.sheets.every(({ sheet }) => sheet.cells.size === 0);
  const garbage = parsed.diagnostics.find((d) => d.severity === "error" && (d.code === "missing-bof" || d.code === "unknown-format"));
  if (empty && garbage) return { ok: false, result: fail(`${path}: not a WK1, WKS, WK3 or DBF file (${garbage.message})`) };
  return { ok: true, parsed };
}

export async function verifyFile(path: string): Promise<ToolResult> {
  const read = await readWorkbook(path);
  if (!read.ok) return read.result;
  const { workbook, diagnostics } = read.parsed;
  const verifications = verifyWorkbook(workbook, basename(path));
  return {
    isError: false,
    data: {
      path,
      format: workbook.format,
      sheets: verifications.map((v, i) => ({
        name: workbook.sheets[i]?.name ?? "",
        format: v.format,
        totals: { formulas: v.totals.formulas, matched: v.totals.matched, mismatched: v.totals.mismatched, unverifiable: v.totals.unverifiable },
        cells: v.cells.map((c) => ({
          address: c.address,
          status: c.status,
          reason: { code: c.reason.code, message: c.reason.message },
          formula: c.formula,
          lotusFormula: c.lotusFormula,
          cached: c.cached,
          recalculated: c.recalculated,
        })),
      })),
      diagnostics,
    },
  };
}

type CellView = { kind: Cell["kind"]; value?: Value | null; label?: string; cached?: Value | null; excel?: string | null };
type Changed = { address: string; left: CellView; right: CellView; differs: string[] };

function view(c: Cell, sheet: Sheet): CellView {
  if (c.kind === "label") return { kind: c.kind, label: c.text };
  if (c.kind !== "formula") return { kind: c.kind, value: valueFromDouble(c.value) };
  // WK3 RPN is never decoded with the WK1 table (src/verify/workbook.ts), so it has no Excel text.
  const excel = sheet.format === "wk3" ? null : translateFormula(c.rpn, { col: c.col, row: c.row }).excel;
  return { kind: c.kind, cached: valueFromDouble(c.cached), excel };
}

/** Which fields differ. Doubles compare with Object.is, so -0 and 0 differ and two NaN patterns are equal. */
function differs(l: Cell, r: Cell, lv: CellView, rv: CellView): string[] {
  if (l.kind !== r.kind) return ["kind"];
  const out: string[] = [];
  if ((l.kind === "integer" || l.kind === "number") && (r.kind === "integer" || r.kind === "number") && !Object.is(l.value, r.value)) out.push("value");
  if (l.kind === "label" && r.kind === "label" && l.text !== r.text) out.push("label");
  if (l.kind === "formula" && r.kind === "formula") {
    if (!Object.is(l.cached, r.cached)) out.push("cached");
    if (lv.excel !== rv.excel) out.push("excel");
  }
  return out;
}

function diffSheets(left: Sheet, right: Sheet) {
  const onlyInLeft: (CellView & { address: string })[] = [];
  const onlyInRight: (CellView & { address: string })[] = [];
  const changed: Changed[] = [];
  const rightByAddress = new Map(cellsInRowMajorOrder(right).map((c) => [a1(c.col, c.row), c]));
  for (const l of cellsInRowMajorOrder(left)) {
    const address = a1(l.col, l.row);
    const r = rightByAddress.get(address);
    if (!r) {
      onlyInLeft.push({ address, ...view(l, left) });
      continue;
    }
    rightByAddress.delete(address);
    const lv = view(l, left);
    const rv = view(r, right);
    const d = differs(l, r, lv, rv);
    if (d.length > 0) changed.push({ address, left: lv, right: rv, differs: d });
  }
  for (const [address, r] of rightByAddress) onlyInRight.push({ address, ...view(r, right) });
  return { onlyInLeft, onlyInRight, changed };
}

export async function diffWorkbooks(leftPath: string, rightPath: string): Promise<ToolResult> {
  const left = await readWorkbook(leftPath);
  if (!left.ok) return left.result;
  const right = await readWorkbook(rightPath);
  if (!right.ok) return right.result;
  const ls = left.parsed.workbook.sheets;
  const rs = right.parsed.workbook.sheets;
  const pairs = Math.min(ls.length, rs.length);
  const sheets = [];
  for (let i = 0; i < pairs; i++) sheets.push({ index: i, leftName: ls[i]!.name, rightName: rs[i]!.name, ...diffSheets(ls[i]!.sheet, rs[i]!.sheet) });
  return {
    isError: false,
    data: {
      left: { path: leftPath, format: left.parsed.workbook.format },
      right: { path: rightPath, format: right.parsed.workbook.format },
      sheets,
      sheetsOnlyInLeft: ls.slice(pairs).map((s) => s.name),
      sheetsOnlyInRight: rs.slice(pairs).map((s) => s.name),
    },
  };
}
