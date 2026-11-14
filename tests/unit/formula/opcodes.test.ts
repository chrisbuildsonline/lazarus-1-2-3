import { describe, expect, it } from "vitest";
import { OPCODES, OPCODE_TABLE } from "../../../src/formula/opcodes.ts";

const REQUIRED_FUNCTIONS = [
  "SUM", "AVG", "MIN", "MAX", "COUNT", "IF", "ROUND", "ABS", "INT", "SQRT", "MOD", "DATE", "NPV", "PMT", "PV", "FV",
  "CHOOSE", "VLOOKUP", "HLOOKUP", "NA", "ERR", "TRUE", "FALSE", "PI", "NOW", "RAND",
];

describe("opcode table", () => {
  it("has unique opcodes, each a single byte", () => {
    const ops = OPCODES.map((e) => e.opcode);
    expect(new Set(ops).size).toBe(ops.length);
    for (const op of ops) expect(op >= 0 && op <= 0xff).toBe(true);
    expect(OPCODE_TABLE.size).toBe(ops.length);
  });

  it("gives every entry a source and a known status", () => {
    for (const e of OPCODES) {
      expect(e.source.trim().length, `0x${e.opcode.toString(16)}`).toBeGreaterThan(0);
      expect(["confirmed", "candidate"]).toContain(e.status);
    }
  });

  it("marks confirmed only where a real fixture and a written reference both show the opcode", () => {
    for (const e of OPCODES.filter((x) => x.status === "confirmed")) {
      expect(e.source, `0x${e.opcode.toString(16)}`).toMatch(/KSBASE\.WK1|gnome647171-1\.wks|testLotus123\.wks/);
      expect(e.source, `0x${e.opcode.toString(16)}`).toMatch(/lotform\.cxx|WSFF/);
    }
  });

  it("has the nine entries design.md confirms, with their kind and operand shape", () => {
    expect(OPCODE_TABLE.get(0x00)).toMatchObject({ kind: "operand", name: "NUM", status: "confirmed" });
    expect(OPCODE_TABLE.get(0x01)).toMatchObject({ kind: "operand", name: "REF", status: "confirmed" });
    expect(OPCODE_TABLE.get(0x02)).toMatchObject({ kind: "operand", name: "RANGE", status: "confirmed" });
    expect(OPCODE_TABLE.get(0x03)).toMatchObject({ kind: "return", status: "confirmed" });
    expect(OPCODE_TABLE.get(0x04)).toMatchObject({ kind: "paren", status: "confirmed" });
    expect(OPCODE_TABLE.get(0x05)).toMatchObject({ kind: "operand", name: "INT", status: "confirmed" });
    expect(OPCODE_TABLE.get(0x09)).toMatchObject({ kind: "binary", op: "add", status: "confirmed" });
    expect(OPCODE_TABLE.get(0x0b)).toMatchObject({ kind: "binary", op: "mul", status: "confirmed" });
    expect(OPCODE_TABLE.get(0x50)).toMatchObject({ kind: "function", name: "SUM", arity: "variable", status: "confirmed" });
  });

  it("confirms the opcodes evidence.md reads from real fixtures", () => {
    expect(OPCODE_TABLE.get(0x06)).toMatchObject({ kind: "operand", name: "STRING", status: "confirmed" });
    expect(OPCODE_TABLE.get(0x0e)).toMatchObject({ kind: "binary", op: "eq", status: "confirmed" });
    expect(OPCODE_TABLE.get(0x14)).toMatchObject({ kind: "binary", op: "and", status: "confirmed" });
    expect(OPCODE_TABLE.get(0x2f)).toMatchObject({ kind: "function", name: "MOD", arity: 2, status: "confirmed" });
    expect(OPCODE_TABLE.get(0x33)).toMatchObject({ kind: "function", name: "FALSE", arity: 0, status: "confirmed" });
    expect(OPCODE_TABLE.get(0x3b)).toMatchObject({ kind: "function", name: "IF", arity: 3, status: "confirmed" });
    expect(OPCODE_TABLE.get(0x52)).toMatchObject({ kind: "function", name: "COUNT", arity: "variable", status: "confirmed" });
    expect(OPCODE_TABLE.get(0x58)).toMatchObject({ kind: "function", name: "STD", arity: "variable", status: "confirmed" });
  });

  it("has an entry for every function requirement 17 lists", () => {
    const names = new Set(OPCODES.flatMap((e) => (e.kind === "function" ? [e.name] : [])));
    for (const name of REQUIRED_FUNCTIONS) expect(names.has(name), name).toBe(true);
  });

  it("has every operator requirement 14 lists", () => {
    const ops = new Set(OPCODES.flatMap((e) => (e.kind === "binary" || e.kind === "unary" ? [e.op] : [])));
    for (const op of ["add", "sub", "mul", "div", "pow", "eq", "ne", "lt", "gt", "le", "ge", "and", "or", "concat", "neg", "plus", "not"]) {
      expect(ops.has(op as never), op).toBe(true);
    }
  });
});
