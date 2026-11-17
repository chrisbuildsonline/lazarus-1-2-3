// Writer properties (requirements 6, 7, 11, 12, 24). Few runs: each run writes and reads a ZIP.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { a1, cellKey, parseWk1, type Cell, type Sheet } from "../../../src/parser/index.ts";
import { TOLERANCE, verifySheet, type CellResult, type SheetVerification } from "../../../src/verify/index.ts";
import { writeXlsx } from "../../../src/xlsx/index.ts";
import { sanitizeXmlText } from "../../../src/xlsx/labels.ts";
import { readXlsx } from "../../unit/helpers/xlsx-readback.ts";

const pos = { col: fc.integer({ min: 0, max: 30 }), row: fc.integer({ min: 0, max: 30 }) };
const cellArb: fc.Arbitrary<Cell> = fc.oneof(
  fc.record({ kind: fc.constant("number" as const), ...pos, value: fc.double() }),
  fc.record({ kind: fc.constant("integer" as const), ...pos, value: fc.integer({ min: -32768, max: 32767 }) }),
  fc.record({ kind: fc.constant("label" as const), ...pos, prefix: fc.constantFrom("'", '"', "^", "\\", "|", "x", ""), text: fc.oneof(fc.string({ unit: "binary" }), fc.constantFrom("_x0041_", "a_x00e9_b", "_x005F_x0041_", "  pad  ")) }),
  fc.record({ kind: fc.constant("formula" as const), ...pos, cached: fc.double(), rpn: fc.constant(new Uint8Array([0x03])) }),
);

const valueOf = (d: number): CellResult["cached"] => (Number.isNaN(d) ? null : d === Infinity ? { t: "err" } : d === -Infinity ? { t: "na" } : { t: "num", v: d });

function build(cells: Cell[]): { sheet: Sheet; verification: SheetVerification } {
  const sheet: Sheet = { format: "wk1", version: null, sawEof: true, declaredDimensions: null, cells: new Map(cells.map((c) => [cellKey(c.col, c.row), c])) };
  const results: CellResult[] = [...sheet.cells.values()].flatMap((c) =>
    c.kind !== "formula"
      ? []
      : [{ address: a1(c.col, c.row), col: c.col, row: c.row, status: "matched", cached: valueOf(c.cached), recalculated: null, reason: { code: "exact", message: "m" }, formula: "1+1", lotusFormula: "1+1", candidateOpcodes: [] }],
  );
  return { sheet, verification: { name: "", format: "wk1", tolerance: TOLERANCE, cells: results, totals: { formulas: results.length, matched: results.length, mismatched: 0, unverifiable: 0, exact: 0, withinTolerance: 0, byReason: {} } } };
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

describe("writer properties", () => {
  it("never rejects, keeps every finite double and label, adds no cell, and is deterministic", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(cellArb, { maxLength: 25 }), async (cells) => {
        const input = build(cells);
        const first = await writeXlsx(input);
        expect(same((await writeXlsx(input)).bytes, first.bytes)).toBe(true);
        const back = await readXlsx(first.bytes);
        const addresses = new Set([...input.sheet.cells.values()].map((c) => a1(c.col, c.row)));
        expect([...back.cells.keys()].filter((a) => !addresses.has(a))).toEqual([]);
        for (const c of input.sheet.cells.values()) {
          const got = back.cells.get(a1(c.col, c.row));
          if ((c.kind === "number" || c.kind === "integer") && Number.isFinite(c.value)) expect(got?.value === c.value).toBe(true);
          if (c.kind === "formula" && Number.isFinite(c.cached)) expect(got?.result === c.cached).toBe(true);
          if (c.kind === "label") expect(got?.value ?? "").toBe(sanitizeXmlText(c.text).text);
        }
      }),
      { numRuns: 50 },
    );
  });

  // Found by the property above (seed 275313591): a label "\r" read back as "\n".
  it("keeps carriage returns in labels", async () => {
    const texts = ["\r", "a\r\nb", "\r\r", "_x000D_\r"];
    const back = await readXlsx((await writeXlsx(build(texts.map((text, row) => ({ kind: "label", col: 0, row, prefix: "'", text }))))).bytes);
    expect(texts.map((_, row) => back.cells.get(a1(0, row))?.value)).toEqual(texts);
  });

  it("parseWk1, verifySheet and writeXlsx never throw on arbitrary bytes", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 300 }), async (bytes) => {
        const { sheet } = parseWk1(bytes);
        await writeXlsx({ sheet, verification: verifySheet(sheet) });
      }),
      { numRuns: 50 },
    );
  });
});
