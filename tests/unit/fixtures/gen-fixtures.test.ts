import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { LICENSE_TEXT, buildAll } from "../../../scripts/gen-fixtures.ts";
import { bof, dimensions, eof, formula, integer, label, number, writeWk1 } from "../../../scripts/lib/wk1-writer.ts";
import { a1, scanWk1 } from "../helpers/wk1-scan.ts";

const bytes = (u: Uint8Array) => [...u];

function formulaRecords(file: Uint8Array): { col: number; row: number; cached: number; rpn: Uint8Array }[] {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const out = [];
  for (let pos = 0; pos + 4 <= file.length; pos += 4 + view.getUint16(pos + 2, true)) {
    if (view.getUint16(pos, true) !== 0x0010) continue;
    const body = pos + 4;
    out.push({
      col: view.getUint16(body + 1, true),
      row: view.getUint16(body + 3, true),
      cached: view.getFloat64(body + 5, true),
      rpn: file.subarray(body + 15, body + 15 + view.getUint16(body + 13, true)),
    });
  }
  return out;
}

// Independent evaluator for the opcodes the synthetic specs use, with the Lotus definitions of
// each function (zero-based CHOOSE and lookup offsets, truncating @INT, @PMT(principal, rate,
// term), @PV and @FV(payment, rate, term)). Relative references set bit 15 and store a signed
// offset in the low 14 bits. A range is its values row by row plus its width.
type Value = { v: number[]; cols: number };
const FIXED: Record<number, [number, (...a: number[]) => number]> = {
  0x21: [1, Math.abs],
  0x22: [1, Math.trunc],
  0x23: [1, Math.sqrt],
  0x26: [0, () => Math.PI],
  0x34: [0, () => 1],
  0x36: [3, (y, m, d) => (Date.UTC(1900 + y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000],
  0x38: [3, (p, r, n) => (p * r) / (1 - (1 + r) ** -n)],
  0x39: [3, (pmt, r, n) => (pmt * (1 - (1 + r) ** -n)) / r],
  0x3a: [3, (pmt, r, n) => (pmt * ((1 + r) ** n - 1)) / r],
  0x3f: [2, (x, d) => Math.round(x * 10 ** d) / 10 ** d],
};
const VARIABLE: Record<number, (all: number[]) => number> = {
  0x50: (a) => a.reduce((s, v) => s + v, 0),
  0x51: (a) => a.reduce((s, v) => s + v, 0) / a.length,
  0x53: (a) => Math.min(...a),
  0x54: (a) => Math.max(...a),
};

function evalRpn(rpn: Uint8Array, col: number, row: number, valueAt: (col: number, row: number) => number): number {
  const view = new DataView(rpn.buffer, rpn.byteOffset, rpn.byteLength);
  const coord = (here: number, w: number) => (w & 0x8000 ? here + ((w << 18) >> 18) : w & 0x3fff);
  const word = (p: number) => view.getUint16(p, true);
  const stack: Value[] = [];
  const pop = () => stack.pop() ?? { v: [], cols: 0 };
  const num = () => pop().v[0] ?? NaN;
  const push = (x: number) => stack.push({ v: [x], cols: 1 });
  for (let p = 0; p < rpn.length; ) {
    const op = rpn[p++]!;
    if (op === 0x00) (push(view.getFloat64(p, true)), (p += 8));
    else if (op === 0x01) (push(valueAt(coord(col, word(p)), coord(row, word(p + 2)))), (p += 4));
    else if (op === 0x02) {
      const [c1, r1, c2, r2] = [coord(col, word(p)), coord(row, word(p + 2)), coord(col, word(p + 4)), coord(row, word(p + 6))];
      const v = [];
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) v.push(valueAt(c, r));
      stack.push({ v, cols: c2 - c1 + 1 });
      p += 8;
    } else if (op === 0x03) return num();
    else if (op === 0x05) (push(view.getInt16(p, true)), (p += 2));
    else if (op === 0x09 || op === 0x0b) {
      const b = num();
      const a = num();
      push(op === 0x09 ? a + b : a * b);
    } else if (FIXED[op]) {
      const [n, f] = FIXED[op];
      push(f(...Array.from({ length: n }, num).reverse()));
    } else if (VARIABLE[op]) {
      push(VARIABLE[op](Array.from({ length: rpn[p++] ?? 0 }, pop).flatMap((x) => x.v)));
    } else if (op === 0x30) {
      const args = Array.from({ length: rpn[p++] ?? 0 }, num).reverse();
      push(args[1 + args[0]!] ?? NaN);
    } else if (op === 0x56) {
      const flows = pop().v;
      const rate = num();
      push(flows.reduce((s, v, i) => s + v / (1 + rate) ** (i + 1), 0));
    } else if (op === 0x55 || op === 0x5a) {
      const offset = num();
      const { v, cols } = pop();
      const key = num();
      const rows = v.length / cols;
      const at = (i: number, k: number) => (op === 0x55 ? v[i * cols + k] : v[k * cols + i])!;
      let hit = -1;
      for (let i = 0; i < (op === 0x55 ? rows : cols); i++) if (at(i, 0) <= key) hit = i;
      push(hit < 0 ? NaN : at(hit, offset));
    } else if (op !== 0x04) throw new Error(`unexpected opcode ${op}`);
  }
  throw new Error("no return token");
}

describe("buildAll", () => {
  const first = buildAll();

  it("is deterministic across two calls", () => {
    const second = buildAll();
    expect(second.map((f) => f.path)).toEqual(first.map((f) => f.path));
    second.forEach((f, i) => {
      expect(Buffer.from(f.bytes).equals(Buffer.from(first[i]!.bytes)), f.path).toBe(true);
      expect(f.manifestEntry).toEqual(first[i]!.manifestEntry);
    });
  });

  it("matches the committed fixture bytes", () => {
    for (const f of first) {
      expect(Buffer.from(readFileSync(f.path)).equals(Buffer.from(f.bytes)), f.path).toBe(true);
    }
  });

  it("matches the synthetic entries in the committed manifest", () => {
    const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { origin: string }[] };
    const built = first.map((f) => f.manifestEntry).sort((a, b) => (a.path < b.path ? -1 : 1));
    expect(manifest.fixtures.filter((e) => e.origin === "synthetic")).toEqual(built);
  });

  it("writes FORMULA records whose cached values are in the manifest", () => {
    const f = first.find((x) => x.path === "fixtures/formulas/formulas.wk1");
    expect(f).toBeDefined();
    const formulas = scanWk1(f!.bytes).cells.filter((c) => c.kind === "formula");
    expect(formulas.length).toBeGreaterThanOrEqual(5);
    expect(f!.manifestEntry.expectedValues.filter((v) => v.kind === "formula").length).toBeGreaterThanOrEqual(3);
  });

  it("writes date serials 1, 59, 60, 61 and a leap day, plus a formula with a date cached value", () => {
    const f = first.find((x) => x.path === "fixtures/dates/dates.wk1");
    expect(f).toBeDefined();
    const cells = scanWk1(f!.bytes).cells;
    const stored = (kind: string) => cells.filter((c) => c.kind === kind).map((c) => c.value);
    expect(stored("integer")).toEqual(expect.arrayContaining([1, 59, 60, 61]));
    expect(stored("number")).toEqual(expect.arrayContaining([60, 36585])); // 36585 = 2000-02-29
    expect(stored("formula")).toContain(36586);
    expect(f!.manifestEntry.expectedValues).toContainEqual({ cell: "A3", kind: "integer", cached: 60 });
  });

  it("has a mixed file with every cell record kind and all three label prefixes", () => {
    const f = first.find((x) => x.path === "fixtures/mixed/mixed.wk1");
    expect(f).toBeDefined();
    const cells = scanWk1(f!.bytes).cells;
    expect(new Set(cells.map((c) => c.kind))).toEqual(new Set(["integer", "number", "label", "formula"]));
    expect(new Set(cells.flatMap((c) => (c.kind === "label" ? [c.prefix] : [])))).toEqual(new Set(["'", '"', "^"]));
  });

  it("has RPN streams that evaluate to their cached values", () => {
    let checked = 0;
    for (const f of first) {
      const cells = scanWk1(f.bytes).cells;
      const valueAt = (col: number, row: number) => {
        const c = cells.find((x) => x.cell === a1(col, row));
        if (!c || typeof c.value !== "number") throw new Error(`${f.path}: no number at ${a1(col, row)}`);
        return c.value;
      };
      for (const { col, row, cached, rpn } of formulaRecords(f.bytes)) {
        expect(evalRpn(rpn, col, row, valueAt), `${f.path} ${a1(col, row)}`).toBe(cached);
        checked++;
      }
    }
    expect(checked).toBe(27); // formulas 6, dates 1, mixed 4, functions 16
  });

  it("writes the committed LICENSE.txt next to every synthetic file", () => {
    for (const f of first) expect(readFileSync(join(dirname(f.path), "LICENSE.txt"), "utf8"), f.path).toBe(LICENSE_TEXT);
  });

  it("ends every RPN stream with the return token", () => {
    for (const f of first) {
      const view = new DataView(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength);
      for (let pos = 0; pos + 4 <= f.bytes.length; pos += 4 + view.getUint16(pos + 2, true)) {
        if (view.getUint16(pos, true) !== 0x0010) continue;
        const rpnLength = view.getUint16(pos + 4 + 13, true);
        expect(view.getUint16(pos + 2, true), f.path).toBe(15 + rpnLength);
        expect(f.bytes[pos + 4 + 15 + rpnLength - 1], f.path).toBe(0x03);
      }
    }
  });

  it("writes LABEL cells with all three prefixes", () => {
    const prefixes = new Set(first.flatMap((f) => scanWk1(f.bytes).cells.flatMap((c) => (c.kind === "label" ? [c.prefix] : []))));
    expect([...prefixes].sort()).toEqual(['"', "'", "^"]);
  });
});

describe("wk1 writer records", () => {
  it("writes BOF with the given version, little-endian", () => {
    expect(bytes(bof(0x0406))).toEqual([0x00, 0x00, 0x02, 0x00, 0x06, 0x04]);
    expect(bytes(bof(0x0404))).toEqual([0x00, 0x00, 0x02, 0x00, 0x04, 0x04]);
  });

  it("writes an empty EOF", () => {
    expect(bytes(eof())).toEqual([0x01, 0x00, 0x00, 0x00]);
  });

  it("writes DIMENSIONS as first col, first row, last col, last row", () => {
    expect(bytes(dimensions(0, 0, 2, 0x0109))).toEqual([0x06, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x09, 0x01]);
  });

  it("writes INTEGER as format, col, row, int16", () => {
    expect(bytes(integer(1, 0x0102, -2))).toEqual([0x0d, 0x00, 0x07, 0x00, 0xff, 0x01, 0x00, 0x02, 0x01, 0xfe, 0xff]);
  });

  it("rejects INTEGER values outside int16", () => {
    expect(() => integer(0, 0, 32768)).toThrow();
    expect(() => integer(0, 0, 1.5)).toThrow();
  });

  it("writes NUMBER as format, col, row, double", () => {
    expect(bytes(number(0, 0, 1.5))).toEqual([
      0x0e, 0x00, 0x0d, 0x00, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f,
    ]);
  });

  it.each(["'", '"', "^"] as const)("writes LABEL with prefix %s, text and NUL", (prefix) => {
    expect(bytes(label(0, 1, prefix, "Hi"))).toEqual([
      0x0f, 0x00, 0x09, 0x00, 0xff, 0x00, 0x00, 0x01, 0x00, prefix.charCodeAt(0), 0x48, 0x69, 0x00,
    ]);
  });

  it("rejects non-ASCII label text", () => {
    expect(() => label(0, 0, "'", "café")).toThrow();
  });

  it("writes FORMULA as format, col, row, cached double, RPN length, RPN", () => {
    expect(bytes(formula(1, 1, 43, [0x03]))).toEqual([
      0x10, 0x00, 0x10, 0x00, 0xff, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x45, 0x40, 0x01, 0x00, 0x03,
    ]);
  });
});

describe("writeWk1", () => {
  const file = writeWk1(0x0406, [
    { kind: "formula", col: 1, row: 1, cached: 3, rpn: [0x03] },
    { kind: "label", col: 0, row: 1, prefix: "^", text: "x" },
    { kind: "number", col: 2, row: 0, value: 0.25 },
    { kind: "integer", col: 0, row: 0, value: 7 },
  ]);

  it("starts with BOF, then DIMENSIONS of the used range, and ends with EOF", () => {
    expect(bytes(file.subarray(0, 6))).toEqual(bytes(bof(0x0406)));
    expect(bytes(file.subarray(6, 18))).toEqual(bytes(dimensions(0, 0, 2, 1)));
    expect(bytes(file.subarray(-4))).toEqual(bytes(eof()));
  });

  it("writes cells in row-major order", () => {
    const scan = scanWk1(file);
    expect(scan.eof).toBe(true);
    expect(scan.truncated).toBe(false);
    expect(scan.cells.map((c) => c.cell)).toEqual(["A1", "C1", "A2", "B2"]);
    expect(scan.counts).toEqual({ cells: 4, formulas: 1, labels: 1, numbers: 2 });
  });
});
