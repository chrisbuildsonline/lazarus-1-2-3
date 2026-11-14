import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { writeWk1, type CellSpec } from "../../../scripts/lib/wk1-writer.ts";
import { a1, getCell, parseA1, parseWk1, type Wk1ParseResult } from "../../../src/parser/index.ts";
import { concat, rawRecord } from "../../unit/helpers/bytes.ts";
import { a1 as helperA1 } from "../../unit/helpers/wk1-scan.ts";

const SEVERITIES = new Set(["error", "warning", "info"]);
const FORMATS = new Set(["wk1", "wks", "unknown"]);

function expectWellFormed(result: Wk1ParseResult, length: number): void {
  const { sheet, diagnostics, stats } = result;
  expect(FORMATS.has(sheet.format)).toBe(true);
  expect(stats.bytesRead).toBeGreaterThanOrEqual(0);
  expect(stats.bytesRead).toBeLessThanOrEqual(length);
  expect(stats.cells).toBe(stats.formulas + stats.labels + stats.numbers);
  expect(stats.skippedRecords).toBe(Object.values(stats.skippedByOpcode).reduce((a, b) => a + b, 0));
  for (const d of diagnostics) {
    expect(SEVERITIES.has(d.severity)).toBe(true);
    expect(d.offset).toBeGreaterThanOrEqual(0);
    expect(d.offset).toBeLessThanOrEqual(length);
  }
  if (!diagnostics.some((d) => d.code === "diagnostics-truncated")) {
    const duplicates = diagnostics.filter((d) => d.code === "duplicate-cell").length;
    expect(stats.cells).toBe(sheet.cells.size + duplicates);
  }
}

describe("parseWk1 properties", () => {
  it("never throws on arbitrary bytes and returns a well-formed result", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 4096 }), (bytes) => {
        expectWellFormed(parseWk1(bytes), bytes.length);
      }),
      { numRuns: 500 },
    );
  });

  it("keeps bytesRead and diagnostic offsets in range on framed garbage", () => {
    const opcode = fc.oneof(fc.constantFrom(0x00, 0x01, 0x06, 0x0d, 0x0e, 0x0f, 0x10), fc.integer({ min: 0, max: 0xffff }));
    const frame = fc.record({
      opcode,
      body: fc.uint8Array({ maxLength: 40 }),
      length: fc.option(fc.integer({ min: 0, max: 0xffff }), { freq: 4 }),
    });
    fc.assert(
      fc.property(fc.array(frame, { maxLength: 40 }), (frames) => {
        const bytes = concat(...frames.map((f) => rawRecord(f.opcode, Array.from(f.body), f.length ?? f.body.length)));
        expectWellFormed(parseWk1(bytes), bytes.length);
      }),
      { numRuns: 500 },
    );
  });

  describe("mutated fixtures", () => {
    const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; format: string }[] };
    const paths = manifest.fixtures.filter((e) => e.format === "wk1" || e.format === "wks").map((e) => e.path);

    it("has wk1/wks fixtures to mutate", () => {
      expect(paths.length).toBeGreaterThan(0);
    });

    const mutation = fc.record({
      flips: fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 })), { maxLength: 8 }),
      insert: fc.option(fc.tuple(fc.nat(), fc.uint8Array({ minLength: 1, maxLength: 8 }))),
      remove: fc.option(fc.tuple(fc.nat(), fc.integer({ min: 1, max: 16 }))),
      cut: fc.option(fc.nat()),
    });

    for (const path of paths) {
      const original = new Uint8Array(readFileSync(path));
      it(`never throws on ${path} with random flips, truncation, insertion and deletion`, () => {
        fc.assert(
          fc.property(mutation, (m) => {
            let bytes: Uint8Array = original.slice();
            for (const [at, value] of m.flips) bytes[at % bytes.length] = value;
            if (m.insert) {
              const at = m.insert[0] % (bytes.length + 1);
              bytes = concat(bytes.subarray(0, at), m.insert[1], bytes.subarray(at));
            }
            if (m.remove) {
              const at = m.remove[0] % (bytes.length + 1);
              bytes = concat(bytes.subarray(0, at), bytes.subarray(at + m.remove[1]));
            }
            if (m.cut !== null) bytes = bytes.subarray(0, m.cut % (bytes.length + 1));
            expectWellFormed(parseWk1(bytes), bytes.length);
          }),
          { numRuns: 100 },
        );
      });
    }
  });

  describe("writer round trip", () => {
    const printable = fc.integer({ min: 0x20, max: 0x7e }).map((c) => String.fromCharCode(c));
    const address = { col: fc.integer({ min: 0, max: 255 }), row: fc.integer({ min: 0, max: 8191 }) };
    const cellSpec: fc.Arbitrary<CellSpec> = fc.oneof(
      fc.record({ kind: fc.constant("integer" as const), ...address, value: fc.integer({ min: -32768, max: 32767 }) }),
      fc.record({ kind: fc.constant("number" as const), ...address, value: fc.double({ noNaN: true }) }),
      fc.record({
        kind: fc.constant("label" as const),
        ...address,
        prefix: fc.constantFrom("'" as const, '"' as const, "^" as const),
        text: fc.string({ unit: printable, maxLength: 80 }),
      }),
      fc.record({
        kind: fc.constant("formula" as const),
        ...address,
        cached: fc.double({ noNaN: true }),
        rpn: fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 64 }),
      }),
    );

    it("parses every written cell back exactly", () => {
      fc.assert(
        fc.property(fc.uniqueArray(cellSpec, { minLength: 1, maxLength: 30, selector: (c) => `${c.col},${c.row}` }), (specs) => {
          const { sheet, diagnostics, stats } = parseWk1(writeWk1(0x0406, specs));
          expect(diagnostics).toEqual([]);
          expect(sheet.format).toBe("wk1");
          expect(sheet.cells.size).toBe(specs.length);
          expect(stats.cells).toBe(specs.length);
          expect(stats.formulas).toBe(specs.filter((s) => s.kind === "formula").length);
          expect(stats.labels).toBe(specs.filter((s) => s.kind === "label").length);
          for (const spec of specs) {
            const cell = getCell(sheet, spec.col, spec.row);
            if (spec.kind === "formula") {
              expect(cell).toEqual({ ...spec, rpn: Uint8Array.from(spec.rpn) });
              expect(cell?.kind === "formula" && Object.is(cell.cached, spec.cached)).toBe(true);
            } else {
              expect(cell).toEqual(spec);
              if (spec.kind !== "label") expect(cell?.kind !== "label" && cell?.kind !== "formula" && Object.is(cell?.value, spec.value)).toBe(true);
            }
          }
        }),
        { numRuns: 300 },
      );
    });

    it("keeps NaN and infinities in cached and number values", () => {
      const specials = [NaN, Infinity, -Infinity];
      const specs: CellSpec[] = specials.flatMap((v, i) => [
        { kind: "formula" as const, col: i, row: 0, cached: v, rpn: [0x03] },
        { kind: "number" as const, col: i, row: 1, value: v },
      ]);
      const { sheet, diagnostics } = parseWk1(writeWk1(0x0406, specs));
      expect(diagnostics).toEqual([]);
      specials.forEach((v, i) => {
        const f = getCell(sheet, i, 0);
        const n = getCell(sheet, i, 1);
        expect(f?.kind === "formula" && Object.is(f.cached, v), `formula ${v}`).toBe(true);
        expect(n?.kind === "number" && Object.is(n.value, v), `number ${v}`).toBe(true);
      });
    });
  });

  describe("addresses", () => {
    it("round trips parseA1(a1(c, r)) and matches the test helper", () => {
      const u16 = fc.integer({ min: 0, max: 65535 });
      fc.assert(
        fc.property(u16, u16, (col, row) => {
          expect(parseA1(a1(col, row))).toEqual({ col, row });
          expect(a1(col, row)).toBe(helperA1(col, row));
        }),
        { numRuns: 2000 },
      );
    });

    it("matches the test helper for every column 0 to 65535 (row = column)", () => {
      const mismatches: string[] = [];
      for (let col = 0; col <= 65535; col++) {
        if (a1(col, col) !== helperA1(col, col)) mismatches.push(`${col}: ${a1(col, col)} vs ${helperA1(col, col)}`);
      }
      expect(mismatches).toEqual([]);
    });
  });
});
