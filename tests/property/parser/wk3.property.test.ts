import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bof, encode80, eof, formula80, label, number80, raw80, record, sheetName, small, smallInt, writeWk3 } from "../../../scripts/lib/wk3-writer.ts";
import { cellKey, float80ToDouble, parseWk3, type Cell, type Wk3ParseResult } from "../../../src/parser/index.ts";

const SEVERITIES = new Set(["error", "warning", "info"]);

function expectWellFormed(result: Wk3ParseResult, length: number): void {
  const { workbook, diagnostics, stats } = result;
  expect(workbook.format).toBe("wk3");
  expect(stats.bytesRead).toBeGreaterThanOrEqual(0);
  expect(stats.bytesRead).toBeLessThanOrEqual(length);
  expect(stats.cells).toBe(stats.formulas + stats.labels + stats.numbers);
  expect(stats.skippedRecords).toBe(Object.values(stats.skippedByOpcode).reduce((a, b) => a + b, 0));
  expect(stats.sheets).toBe(workbook.sheets.length);
  expect(new Set(workbook.sheets.map((s) => s.name)).size).toBe(workbook.sheets.length);
  for (const d of diagnostics) {
    expect(SEVERITIES.has(d.severity)).toBe(true);
    expect(d.offset).toBeGreaterThanOrEqual(0);
    expect(d.offset).toBeLessThanOrEqual(length);
  }
  if (!diagnostics.some((d) => d.code === "diagnostics-truncated")) {
    const duplicates = diagnostics.filter((d) => d.code === "duplicate-cell").length;
    const size = workbook.sheets.reduce((n, s) => n + s.sheet.cells.size, 0);
    expect(stats.cells).toBe(size + duplicates);
  }
}

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/**
 * Slow oracle: the double nearest to (-1)^sign * sig * 2^(exp - 16383 - 63), ties to even, by
 * BigInt arithmetic only (no float80ToDouble, no Number(BigInt) on the full value).
 */
function oracle(sig: bigint, signExp: number): number {
  const negative = (signExp & 0x8000) !== 0;
  const exp = signExp & 0x7fff;
  const sign = negative ? -1 : 1;
  if (sig === 0n) return negative ? -0 : 0;
  // value = sig * 2^(e2); find the double: 53-bit significand m and exponent q with value ~ m * 2^q.
  const e2 = exp - 16383 - 63;
  const bits = sig.toString(2).length;
  // Normal doubles: q >= -1074, top bit at e2 + bits - 1.
  let q = Math.max(e2 + bits - 53, -1074);
  const shift = q - e2; // how many low bits of sig to drop (may be negative: shift left)
  let m: bigint;
  if (shift <= 0) m = sig << BigInt(-shift);
  else {
    m = sig >> BigInt(shift);
    const rest = sig - (m << BigInt(shift));
    const half = 1n << BigInt(shift - 1);
    if (rest > half || (rest === half && (m & 1n) === 1n)) m += 1n;
  }
  if (m === 1n << 53n) {
    m >>= 1n;
    q += 1;
  }
  if (q + 52 > 1023) return sign * Infinity;
  // m * 2^q is exact in a double: build it in two steps so no step overflows or underflows.
  return sign * Number(m) * 2 ** Math.floor(q / 2) * 2 ** (q - Math.floor(q / 2));
}

describe("oracle self-check (hand values)", () => {
  it("matches plain doubles", () => {
    // 1.0 = 2^63 * 2^(16383 - 16383 - 63); -2.5 = 0xA000000000000000 * 2^(16384 - 16383 - 63).
    expect(oracle(1n << 63n, 16383)).toBe(1);
    expect(oracle(0xa000000000000000n, 0x8000 | 16384)).toBe(-2.5);
    // Smallest subnormal 2^-1074: 2^63 * 2^(e - 16383 - 63) with e = 16383 - 1074.
    expect(oracle(1n << 63n, 16383 - 1074)).toBe(5e-324);
    // Half of it ties to even (0).
    expect(oracle(1n << 63n, 16383 - 1075)).toBe(0);
  });
});

describe("parseWk3 properties", () => {
  it("never throws on arbitrary bytes behind a valid BOF", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 2048 }), (tail) => {
        const bytes = concat([bof(), tail]);
        expectWellFormed(parseWk3(bytes), bytes.length);
      }),
      { numRuns: 500 },
    );
  });

  it("never throws on arbitrary bytes with no BOF", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 2048 }), (bytes) => {
        expectWellFormed(parseWk3(bytes), bytes.length);
      }),
      { numRuns: 300 },
    );
  });

  it("keeps bytesRead and diagnostic offsets in range on framed garbage", () => {
    const opcode = fc.oneof(fc.constantFrom(0x00, 0x01, 0x16, 0x17, 0x18, 0x19, 0x1b), fc.integer({ min: 0, max: 0xffff }));
    const frame = fc.record({ opcode, body: fc.uint8Array({ maxLength: 40 }), cut: fc.option(fc.integer({ min: 0, max: 0xffff }), { freq: 4 }) });
    fc.assert(
      fc.property(fc.array(frame, { maxLength: 40 }), (frames) => {
        const parts = [bof()];
        for (const f of frames) {
          const r = record(f.opcode, f.body);
          if (f.cut !== null) new DataView(r.buffer).setUint16(2, f.cut, true);
          parts.push(r);
        }
        const bytes = concat(parts);
        expectWellFormed(parseWk3(bytes), bytes.length);
      }),
      { numRuns: 500 },
    );
  });

  describe("mutated fixtures", () => {
    const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; format: string }[] };
    const paths = manifest.fixtures.filter((e) => e.format === "wk3").map((e) => e.path);

    it("has wk3 fixtures to mutate", () => {
      expect(paths.length).toBeGreaterThan(0);
    });

    for (const path of paths) {
      it(`never throws on mutations of ${path}`, () => {
        const original = new Uint8Array(readFileSync(path));
        const mutation = fc.array(fc.record({ at: fc.nat(), value: fc.integer({ min: 0, max: 255 }) }), { minLength: 1, maxLength: 16 });
        fc.assert(
          fc.property(mutation, fc.nat(), (edits, cut) => {
            const bytes = original.slice(0, original.length - (cut % 64));
            for (const e of edits) if (bytes.length > 0) bytes[e.at % bytes.length] = e.value;
            expectWellFormed(parseWk3(bytes), bytes.length);
          }),
          { numRuns: 200 },
        );
      });
    }
  });

  it("round-trips random cells over random sheet indexes", () => {
    const where = { sheet: fc.integer({ min: 0, max: 255 }), col: fc.integer({ min: 0, max: 255 }), row: fc.integer({ min: 0, max: 8191 }) };
    const finite = fc.double({ noNaN: true, noDefaultInfinity: true });
    const text = fc.string({ maxLength: 30 }).map((s) => s.replace(/[^\x01-\xff]/g, "x"));
    const spec = fc.oneof(
      fc.record({ ...where, kind: fc.constant("number" as const), value: finite }),
      fc.record({ ...where, kind: fc.constant("integer" as const), value: fc.integer({ min: -16384, max: 16383 }) }),
      fc.record({ ...where, kind: fc.constant("label" as const), prefix: fc.constantFrom("'", '"', "^"), text }),
      fc.record({ ...where, kind: fc.constant("formula" as const), value: finite, rpn: fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 20 }) }),
    );
    fc.assert(
      fc.property(fc.array(spec, { maxLength: 30 }), (specs) => {
        const records = specs.map((s) =>
          s.kind === "number"
            ? number80(s.sheet, s.col, s.row, s.value)
            : s.kind === "integer"
              ? small(s.sheet, s.col, s.row, smallInt(s.value))
              : s.kind === "label"
                ? label(s.sheet, s.col, s.row, s.prefix, s.text)
                : formula80(s.sheet, s.col, s.row, s.value, s.rpn),
        );
        const { workbook, stats } = parseWk3(writeWk3(records));
        // Last record per (sheet, col, row) wins.
        const expected = new Map<string, (typeof specs)[number]>();
        for (const s of specs) expected.set(`${s.sheet}:${s.col}:${s.row}`, s);
        const sheetIndexes = [...new Set([...expected.values()].map((s) => s.sheet))].sort((a, b) => a - b);
        expect(workbook.sheets.length).toBe(sheetIndexes.length);
        expect(stats.roundedNumbers).toBe(0);
        sheetIndexes.forEach((index, i) => {
          const cells = workbook.sheets[i]!.sheet.cells;
          const mine = [...expected.values()].filter((s) => s.sheet === index);
          expect(cells.size).toBe(mine.length);
          for (const s of mine) {
            const cell = cells.get(cellKey(s.col, s.row)) as Cell;
            expect(cell).toBeDefined();
            if (s.kind === "number") expect(cell).toMatchObject({ kind: "number" }), expect(Object.is((cell as { value: number }).value, s.value)).toBe(true);
            if (s.kind === "integer") expect(cell).toEqual({ kind: "integer", col: s.col, row: s.row, value: s.value });
            if (s.kind === "label") expect(cell).toEqual({ kind: "label", col: s.col, row: s.row, prefix: s.prefix, text: s.text.split("\0")[0] });
            if (s.kind === "formula") {
              expect(cell.kind).toBe("formula");
              const f = cell as Extract<Cell, { kind: "formula" }>;
              expect(Object.is(f.cached, s.value)).toBe(true);
              expect(Array.from(f.rpn)).toEqual(s.rpn);
            }
          }
        });
      }),
      { numRuns: 300 },
    );
  });

  it("float80ToDouble(encode80(d)) is d for every double", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (d) => {
        const { value, exact } = float80ToDouble(encode80(d));
        expect(Object.is(value, d)).toBe(true);
        expect(exact).toBe(true);
      }),
      { numRuns: 2000 },
    );
    expect(Number.isNaN(float80ToDouble(encode80(Number.NaN)).value)).toBe(true);
  });

  it("rounds a random 64-bit significand correctly (BigInt oracle)", () => {
    const sig = fc.bigInt({ min: 1n << 63n, max: (1n << 64n) - 1n });
    // Exponents around the whole double range, including overflow and the subnormal band.
    const exp = fc.integer({ min: 16383 - 1140, max: 16383 + 1030 });
    fc.assert(
      fc.property(sig, exp, fc.boolean(), (s, e, negative) => {
        const signExp = (negative ? 0x8000 : 0) | e;
        const want = oracle(s, signExp);
        const { value } = float80ToDouble(raw80(s, signExp));
        expect(Object.is(value, want)).toBe(true);
      }),
      { numRuns: 3000 },
    );
  });
});

describe("sheet names stay unique", () => {
  it("holds for random name records", () => {
    const name = fc.constantFrom("", "A", "B", "Totals", "totals", "A 2");
    fc.assert(
      fc.property(fc.array(fc.record({ sheet: fc.integer({ min: 0, max: 6 }), name }), { maxLength: 12 }), (list) => {
        const bytes = concat([bof(), ...list.map((l) => sheetName(l.sheet, l.name)), eof()]);
        const { workbook } = parseWk3(bytes);
        expect(new Set(workbook.sheets.map((s) => s.name)).size).toBe(workbook.sheets.length);
      }),
      { numRuns: 300 },
    );
  });
});
