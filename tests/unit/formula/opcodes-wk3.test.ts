import { describe, expect, it } from "vitest";
import { OPCODES } from "../../../src/formula/opcodes.ts";
import { WK3_OPCODES, WK3_OPCODE_TABLE, WK3_UNSUPPORTED_REFERENCES } from "../../../src/formula/opcodes-wk3.ts";
import { FUNCTIONS, VOLATILE } from "../../../src/verify/evaluate.ts";

const hex = (op: number) => `0x${op.toString(16).padStart(2, "0")}`;

describe("WK3 opcode table", () => {
  it("has unique single-byte opcodes, each with a source and a known status", () => {
    const ops = WK3_OPCODES.map((e) => e.opcode);
    expect(new Set(ops).size).toBe(ops.length);
    expect(WK3_OPCODE_TABLE.size).toBe(ops.length);
    for (const e of WK3_OPCODES) {
      expect(e.opcode >= 0 && e.opcode <= 0xff, hex(e.opcode)).toBe(true);
      expect(e.source, hex(e.opcode)).toMatch(/lotform\.cxx/);
      expect(e.source, hex(e.opcode)).toMatch(/lotus-formula\.c/);
      expect(["confirmed", "candidate"]).toContain(e.status);
    }
  });

  it("marks confirmed only the tokens a real WK3 fixture shows", () => {
    const confirmed = WK3_OPCODES.filter((e) => e.status === "confirmed");
    for (const e of confirmed) expect(e.source, hex(e.opcode)).toMatch(/m3\.wk3|m21tab\.wk3/);
    expect(confirmed.map((e) => e.opcode)).toEqual([0x01, 0x03, 0x04, 0x05, 0x0f, 0x10, 0x11, 0x12, 0x1d]);
  });

  it("has the operands, return, parentheses and operators of LO IndexToTypeWK123", () => {
    expect(WK3_OPCODE_TABLE.get(0x00)).toMatchObject({ kind: "operand", name: "NUM10" });
    expect(WK3_OPCODE_TABLE.get(0x01)).toMatchObject({ kind: "operand", name: "CREF" });
    expect(WK3_OPCODE_TABLE.get(0x02)).toMatchObject({ kind: "operand", name: "RREF" });
    expect(WK3_OPCODE_TABLE.get(0x03)).toMatchObject({ kind: "return" });
    expect(WK3_OPCODE_TABLE.get(0x04)).toMatchObject({ kind: "paren" });
    expect(WK3_OPCODE_TABLE.get(0x05)).toMatchObject({ kind: "operand", name: "SNUM" });
    expect(WK3_OPCODE_TABLE.get(0x06)).toMatchObject({ kind: "operand", name: "STRING" });
    const ops = ["neg", "add", "sub", "mul", "div", "pow", "eq", "ne", "le", "ge", "lt", "gt", "and", "or", "not", "plus", "concat"];
    expect(ops.map((_, i) => WK3_OPCODE_TABLE.get(0x0e + i)).map((e) => (e && "op" in e ? e.op : null))).toEqual(ops);
  });

  it("leaves the named and error references 0x07 to 0x0B out of the table", () => {
    expect([...WK3_UNSUPPORTED_REFERENCES.keys()]).toEqual([0x07, 0x08, 0x09, 0x0a, 0x0b]);
    for (const op of WK3_UNSUPPORTED_REFERENCES.keys()) expect(WK3_OPCODE_TABLE.has(op), hex(op)).toBe(false);
  });

  it("has exactly the WK1 functions, with the WK1 numbers and arities, all known to the evaluator", () => {
    const wk1 = OPCODES.flatMap((e) => (e.kind === "function" ? [[e.opcode, e.name, e.arity]] : []));
    const wk3 = WK3_OPCODES.flatMap((e) => (e.kind === "function" ? [[e.opcode, e.name, e.arity]] : []));
    expect(wk3).toEqual(wk1);
    for (const [, name] of wk3) expect(FUNCTIONS.has(name as string) || VOLATILE.has(name as string), name as string).toBe(true);
  });
});
