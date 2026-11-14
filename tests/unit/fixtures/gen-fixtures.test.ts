import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAll } from "../../../scripts/gen-fixtures.ts";
import { bof, dimensions, eof, formula, integer, label, number, writeWk1 } from "../../../scripts/lib/wk1-writer.ts";
import { scanWk1 } from "../helpers/wk1-scan.ts";

const bytes = (u: Uint8Array) => [...u];

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
