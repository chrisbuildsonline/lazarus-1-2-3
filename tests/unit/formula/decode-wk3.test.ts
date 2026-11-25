// WK3 formula tokens (decodeRpn with dialect "wk3"). Byte strings marked "real" are copied from the
// FORMULA records of the NOAA fixtures (fixtures/noaa-ala-wai-m3/m3.wk3, noaa-ala-wai-m21/m21tab.wk3)
// and decoded by hand from LibreOffice lotform.cxx (IndexToTypeWK123, ReadSRD) and Gnumeric
// lotus-formula.c (lotus_parse_formula_new). The others are built from the same tables.
import { describe, expect, it } from "vitest";
import { decodeRpn } from "../../../src/formula/decode.ts";
import { printLotus } from "../../../src/formula/print-lotus.ts";
import { encode80 } from "../../../scripts/lib/wk3-writer.ts";

type Origin = { col: number; row: number; sheet: number };
const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((h) => parseInt(h, 16)));
const run = (origin: Origin, ...b: number[]) => decodeRpn(new Uint8Array([...b, 0x03]), origin, "wk3");
const ref = (col: number, row: number, colAbs: boolean, rowAbs: boolean) => ({ col, row, colAbs, rowAbs });
const codes = (r: ReturnType<typeof run>) => r.diagnostics.map((d) => d.code);
const at = (col: number, row: number, sheet = 0): Origin => ({ col, row, sheet });

describe("real WK3 formulas", () => {
  it("m21tab.wk3 T44: L44/K44*100 (cref, cref, div, packed 100, mul)", () => {
    // 01 07 2b00 00 0b: cell ref, relbits 7, row 43, sheet 0, col 11 (L44). 05 c800: packed word 200, bit 0 clear = 100.
    const r = decodeRpn(hex("01072b00000b01072b00000a1205c8001103"), at(19, 43), "wk3");
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.ast).toEqual({
      type: "binary",
      op: "mul",
      left: { type: "binary", op: "div", left: { type: "ref", ref: ref(11, 43, false, false) }, right: { type: "ref", ref: ref(10, 43, false, false) } },
      right: { type: "int", value: 100 },
    });
    expect(printLotus(r.ast!)).toBe("L44/K44*100");
  });

  it("m21tab.wk3 U45: L45-0.25, a packed word with bit 0 set (0x004D: 4 / 16)", () => {
    const r = decodeRpn(hex("01072c00000b054d001003"), at(20, 44), "wk3");
    expect(r.ast).toEqual({ type: "binary", op: "sub", left: { type: "ref", ref: ref(11, 44, false, false) }, right: { type: "number", value: 0.25 } });
  });

  it("m3.wk3 U9: unary plus, parentheses, $C9 (relbits 6) and $S$40 (relbits 0)", () => {
    const r = decodeRpn(hex("0107080000121d01060800000204120106080000011105140011040100270000120514001101002700000212041003"), at(20, 8), "wk3");
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // Hand check with the file's cells S9 655, C9 56.16, B9 0.4115, S40 5.37, C40 53.62:
    // 655/56.16*0.4115*10 - 5.37*10/53.62 = 47.99369 - 1.00149 = 46.99219; the file stores 46.992186794324525.
    expect(printLotus(r.ast!)).toBe("(+S9/($C9)*$B9*10)-($S$40*10/$C$40)");
  });
});

describe("WK3 operand tokens", () => {
  it("0x00 reads a 10-byte extended constant", () => {
    expect(run(at(0, 0), 0x00, ...encode80(0.1)).ast).toEqual({ type: "number", value: 0.1 });
    expect(run(at(0, 0), 0x00, ...encode80(-2.5)).ast).toEqual({ type: "number", value: -2.5 });
  });

  it("0x00 rejects a constant that is not a finite number", () => {
    const r = run(at(0, 0), 0x00, ...encode80(Infinity));
    expect(r.ast).toBeNull();
    expect(codes(r)).toContain("non-finite-constant");
  });

  it("0x05 reads packed small numbers the way the SMALLNUM record does", () => {
    expect(run(at(0, 0), 0x05, 0xfe, 0xff).ast).toEqual({ type: "int", value: -1 });
    expect(run(at(0, 0), 0x05, 0xc8, 0x00).ast).toEqual({ type: "int", value: 100 });
    // 0x0033: bit 0 set, scale index 1 (x500), mantissa 3 = 1500.
    expect(run(at(0, 0), 0x05, 0x33, 0x00).ast).toEqual({ type: "number", value: 1500 });
  });

  it("0x06 reads a NUL-terminated string", () => {
    expect(run(at(0, 0), 0x06, 0x4f, 0x64, 0x64, 0x00).ast).toEqual({ type: "string", value: "Odd" });
  });

  it("0x01 keeps the stored coordinates and reads relbits bit 0 as column, bit 1 as row", () => {
    expect(run(at(9, 9), 0x01, 0x00, 0x04, 0x00, 0x00, 0x02).ast).toEqual({ type: "ref", ref: ref(2, 4, true, true) });
    expect(run(at(9, 9), 0x01, 0x01, 0x04, 0x00, 0x00, 0x02).ast).toEqual({ type: "ref", ref: ref(2, 4, false, true) });
    expect(run(at(9, 9), 0x01, 0x02, 0x04, 0x00, 0x00, 0x02).ast).toEqual({ type: "ref", ref: ref(2, 4, true, false) });
  });

  it("0x02 reads a range: relbits low 3 bits for the first corner, bits 3-5 for the second", () => {
    // 0x38 = second corner relative on all axes, first corner absolute. A1..C5 on sheet 0.
    const r = run(at(9, 9), 0x02, 0x38, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x02);
    expect(r.ast).toEqual({ type: "range", from: ref(0, 0, true, true), to: ref(2, 4, false, false) });
  });

  it("refuses a reference to another sheet, naming it", () => {
    const r = run(at(0, 0, 2), 0x01, 0x07, 0x00, 0x00, 0x01, 0x01);
    expect(r.ast).toBeNull();
    expect(codes(r)).toEqual(["foreign-reference"]);
    expect(r.diagnostics[0]!.message).toContain("sheet B");
    const range = run(at(0, 0, 0), 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00);
    expect(range.ast).toBeNull();
    expect(range.diagnostics.filter((d) => d.severity === "error").map((d) => d.code)).toEqual(["foreign-reference"]);
  });

  it("refuses a row past the grid", () => {
    expect(codes(run(at(0, 0), 0x01, 0x00, 0x00, 0x20, 0x00, 0x00))).toEqual(["reference-out-of-grid"]);
  });
});

describe("WK3 operators and functions", () => {
  const a1 = [0x01, 0x07, 0x00, 0x00, 0x00, 0x00];
  const b1 = [0x01, 0x07, 0x00, 0x00, 0x00, 0x01];
  const ops: [number, string][] = [
    [0x0f, "add"], [0x10, "sub"], [0x11, "mul"], [0x12, "div"], [0x13, "pow"], [0x14, "eq"], [0x15, "ne"],
    [0x16, "le"], [0x17, "ge"], [0x18, "lt"], [0x19, "gt"], [0x1a, "and"], [0x1b, "or"], [0x1e, "concat"],
  ];

  it.each(ops)("opcode %i is the binary %s", (op, name) => {
    expect(run(at(5, 5), ...a1, ...b1, op).ast).toMatchObject({ type: "binary", op: name });
  });

  it("0x0E is negation, 0x1C not, 0x1D unary plus, 0x04 parentheses", () => {
    expect(run(at(5, 5), ...a1, 0x0e).ast).toMatchObject({ type: "unary", op: "neg" });
    expect(run(at(5, 5), ...a1, 0x1c).ast).toMatchObject({ type: "unary", op: "not" });
    expect(run(at(5, 5), ...a1, 0x1d).ast).toMatchObject({ type: "unary", op: "plus" });
    expect(run(at(5, 5), ...a1, 0x04).ast).toMatchObject({ type: "paren" });
  });

  it("keeps the WK1 function numbers: 0x50 SUM with a count byte, 0x3B IF with three arguments", () => {
    const range = [0x02, 0x3f, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00];
    expect(run(at(5, 5), ...range, 0x50, 0x01).ast).toMatchObject({ type: "call", name: "SUM", args: [{ type: "range" }] });
    expect(run(at(5, 5), ...a1, ...b1, ...a1, 0x3b).ast).toMatchObject({ type: "call", name: "IF" });
  });

  it("0x09 is not add in WK3: it is an error reference, which is not read", () => {
    const r = run(at(5, 5), ...a1, ...b1, 0x09);
    expect(r.ast).toBeNull();
    expect(codes(r)).toEqual(["reference-kind-unsupported"]);
    expect(r.diagnostics[0]!.offset).toBe(12);
  });

  it("named and error references (0x07 to 0x0B) stop decoding with reference-kind-unsupported", () => {
    for (const op of [0x07, 0x08, 0x09, 0x0a, 0x0b]) {
      const r = run(at(5, 5), op, 0x41, 0x00);
      expect(r.ast, String(op)).toBeNull();
      expect(r.unknown, String(op)).toBeNull();
      expect(codes(r), String(op)).toEqual(["reference-kind-unsupported"]);
    }
  });

  it("a function number past the WK1 table (0x66 @UPPER) is an unknown opcode", () => {
    expect(run(at(5, 5), ...a1, 0x66).unknown).toEqual({ opcode: 0x66, offset: 6 });
  });

  it("a stream cut inside a reference is a truncated-stream error", () => {
    const r = decodeRpn(new Uint8Array([0x01, 0x07, 0x00]), at(0, 0), "wk3");
    expect(r.ast).toBeNull();
    expect(codes(r)).toEqual(["truncated-stream"]);
  });
});

describe("the WK1 dialect is unchanged", () => {
  it("still reads 0x09 as add and 0x05 as a 2-byte integer", () => {
    const wk1 = decodeRpn(new Uint8Array([0x05, 0x02, 0x00, 0x05, 0x03, 0x00, 0x09, 0x03]), { col: 0, row: 0 });
    expect(wk1.ast).toEqual({ type: "binary", op: "add", left: { type: "int", value: 2 }, right: { type: "int", value: 3 } });
  });
});
