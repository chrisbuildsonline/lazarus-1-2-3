// Operator tokens with literal bytes. Opcodes: WSFF2 Table 1-b and LO lotform.cxx IndexToType
// (0x09 add, 0x0B mul, 0x0E eq, 0x14 AND also in real fixtures, see evidence.md).
import { describe, expect, it } from "vitest";
import { decodeRpn } from "../../../src/formula/decode.ts";

const O = { col: 0, row: 0 };
const I1 = [0x05, 0x01, 0x00];
const I2 = [0x05, 0x02, 0x00];
const one = { type: "int", value: 1 };
const two = { type: "int", value: 2 };
const run = (...b: number[]) => decodeRpn(new Uint8Array(b), O);

const BINARY: [number, string][] = [
  [0x09, "add"], [0x0a, "sub"], [0x0b, "mul"], [0x0c, "div"], [0x0d, "pow"],
  [0x0e, "eq"], [0x0f, "ne"], [0x10, "le"], [0x11, "ge"], [0x12, "lt"], [0x13, "gt"],
  [0x14, "and"], [0x15, "or"], [0x18, "concat"],
];

describe("binary operators", () => {
  for (const [opcode, op] of BINARY) {
    it(`0x${opcode.toString(16).padStart(2, "0")} is ${op} with the earlier operand on the left`, () => {
      expect(run(...I1, ...I2, opcode, 0x03).ast).toEqual({ type: "binary", op, left: one, right: two });
    });

    it(`0x${opcode.toString(16).padStart(2, "0")} with one operand is a stack-underflow at its offset`, () => {
      const r = run(...I1, opcode, 0x03);
      expect(r.ast).toBeNull();
      expect(r.diagnostics.filter((d) => d.severity === "error")).toMatchObject([{ code: "stack-underflow", offset: 3, opcode }]);
    });
  }
});

describe("unary operators and parentheses", () => {
  it("0x08 is negate", () => {
    expect(run(...I1, 0x08, 0x03).ast).toEqual({ type: "unary", op: "neg", arg: one });
  });

  it("0x17 is unary plus", () => {
    expect(run(...I1, 0x17, 0x03).ast).toEqual({ type: "unary", op: "plus", arg: one });
  });

  it("0x16 is NOT", () => {
    expect(run(...I1, 0x16, 0x03).ast).toEqual({ type: "unary", op: "not", arg: one });
  });

  it("negates a number constant as a unary node", () => {
    expect(run(0x00, 0, 0, 0, 0, 0, 0, 0xe0, 0x3f, 0x08, 0x03).ast).toEqual({ type: "unary", op: "neg", arg: { type: "number", value: 0.5 } });
  });

  it("0x04 keeps the parentheses as a paren node", () => {
    expect(run(...I1, ...I2, 0x09, 0x04, 0x03).ast).toEqual({ type: "paren", inner: { type: "binary", op: "add", left: one, right: two } });
  });

  for (const opcode of [0x08, 0x16, 0x17, 0x04]) {
    it(`0x${opcode.toString(16).padStart(2, "0")} on an empty stack is a stack-underflow`, () => {
      const r = run(opcode, 0x03);
      expect(r.diagnostics.filter((d) => d.severity === "error")).toMatchObject([{ code: "stack-underflow", offset: 0, opcode }]);
    });
  }
});
