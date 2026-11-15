// The test-only RPN encoder must reproduce the literal byte arrays used by the decoder tests
// (tasks 6 to 14) and the real fixture bytes in evidence.md, for the same trees.
import { describe, expect, it } from "vitest";
import type { Expr, Origin } from "../../../src/formula/ast.ts";
import { encodeRpn } from "../helpers/rpn-encode.ts";

const O = { col: 0, row: 0 };
const enc = (e: Expr, origin: Origin = O) => [...encodeRpn(e, origin)];
const ref = (col: number, row: number, colAbs = false, rowAbs = false): Expr => ({ type: "ref", ref: { col, row, colAbs, rowAbs } });
const int = (value: number): Expr => ({ type: "int", value });
type Op = Extract<Expr, { type: "binary" }>["op"];
const bin = (op: Op, left: Expr, right: Expr): Expr => ({ type: "binary", op, left, right });
const call = (name: string, ...args: Expr[]): Expr => ({ type: "call", name, args });

describe("encodeRpn", () => {
  it("encodes number, int and string operands", () => {
    expect(enc({ type: "number", value: 0.5 })).toEqual([0x00, 0, 0, 0, 0, 0, 0, 0xe0, 0x3f, 0x03]);
    expect(enc(int(-1))).toEqual([0x05, 0xff, 0xff, 0x03]);
    expect(enc(int(32767))).toEqual([0x05, 0xff, 0x7f, 0x03]);
    expect(enc({ type: "string", value: "Odd" })).toEqual([0x06, 0x4f, 0x64, 0x64, 0x00, 0x03]);
  });

  it("encodes absolute and relative references as the decoder tests write them", () => {
    expect(enc(ref(2, 4, true, true), { col: 7, row: 7 })).toEqual([0x01, 0x02, 0x00, 0x04, 0x00, 0x03]);
    expect(enc(ref(4, 5), { col: 3, row: 3 })).toEqual([0x01, 0x01, 0x80, 0x02, 0x80, 0x03]);
    expect(enc(ref(9, 1), { col: 14, row: 2 })).toEqual([0x01, 0xfb, 0xbf, 0xff, 0xbf, 0x03]);
    expect(enc(ref(2, 4, true, false), { col: 5, row: 5 })).toEqual([0x01, 0x02, 0x00, 0xff, 0xbf, 0x03]);
  });

  it("encodes formulas.wk1 C2, @SUM(A1..C1) at C2", () => {
    const sum = call("SUM", { type: "range", from: { col: 0, row: 0, colAbs: false, rowAbs: false }, to: { col: 2, row: 0, colAbs: false, rowAbs: false } });
    expect(enc(sum, { col: 2, row: 1 })).toEqual([0x02, 0xfe, 0xbf, 0xff, 0xbf, 0x00, 0x80, 0xff, 0xbf, 0x50, 0x01, 0x03]);
  });

  it("encodes KSBASE.WK1 N3 and O3", () => {
    const n3 = bin("and", bin("eq", ref(2, 2), ref(2, 3)), bin("eq", ref(3, 2), ref(3, 3)));
    expect(enc(n3, { col: 13, row: 2 })).toEqual([
      0x01, 0xf5, 0xbf, 0x00, 0x80, 0x01, 0xf5, 0xbf, 0x01, 0x80, 0x0e, 0x01, 0xf6, 0xbf, 0x00, 0x80, 0x01, 0xf6, 0xbf, 0x01, 0x80, 0x0e, 0x14, 0x03,
    ]);
    const o3 = call("IF", bin("eq", ref(13, 2), int(1)), bin("mul", { type: "number", value: 0.5 }, { type: "paren", inner: bin("add", ref(9, 2), ref(9, 3)) }), call("FALSE"));
    expect(enc(o3, { col: 14, row: 2 })).toEqual([
      0x01, 0xff, 0xbf, 0x00, 0x80, 0x05, 0x01, 0x00, 0x0e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe0, 0x3f,
      0x01, 0xfb, 0xbf, 0x00, 0x80, 0x01, 0xfb, 0xbf, 0x01, 0x80, 0x09, 0x04, 0x0b, 0x33, 0x3b, 0x03,
    ]);
  });

  it("encodes gnome647171-1.wks A5, IF(MOD(A4,2)=1,\"Odd\",\"Even\")", () => {
    const a5 = call("IF", bin("eq", call("MOD", ref(0, 3), int(2)), int(1)), { type: "string", value: "Odd" }, { type: "string", value: "Even" });
    expect(enc(a5, { col: 0, row: 4 })).toEqual([
      0x01, 0x00, 0x80, 0xff, 0xbf, 0x05, 0x02, 0x00, 0x2f, 0x05, 0x01, 0x00, 0x0e,
      0x06, 0x4f, 0x64, 0x64, 0x00, 0x06, 0x45, 0x76, 0x65, 0x6e, 0x00, 0x3b, 0x03,
    ]);
  });

  it("encodes unary operators and a variable count", () => {
    expect(enc({ type: "unary", op: "neg", arg: int(1) })).toEqual([0x05, 0x01, 0x00, 0x08, 0x03]);
    expect(enc({ type: "unary", op: "plus", arg: int(1) })).toEqual([0x05, 0x01, 0x00, 0x17, 0x03]);
    expect(enc({ type: "unary", op: "not", arg: int(1) })).toEqual([0x05, 0x01, 0x00, 0x16, 0x03]);
    expect(enc(call("CHOOSE", int(1), int(2)))).toEqual([0x05, 0x01, 0x00, 0x05, 0x02, 0x00, 0x30, 0x02, 0x03]);
  });
});
