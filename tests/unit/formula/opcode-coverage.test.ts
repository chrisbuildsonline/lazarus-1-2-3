import { describe, expect, it } from "vitest";
import type { Expr } from "../../../src/formula/ast.ts";
import { decodeRpn } from "../../../src/formula/decode.ts";
import { NO_EQUIVALENT_NAMES, RULE_NAMES } from "../../../src/formula/excel-ast.ts";
import { OPCODES, type OpcodeEntry } from "../../../src/formula/opcodes.ts";
import { translateFormula } from "../../../src/formula/translate.ts";
import { FUNCTIONS, VOLATILE } from "../../../src/verify/evaluate.ts";
import { encodeRpn } from "../helpers/rpn-encode.ts";

// The opcode table is the one list of what a WK1 formula can hold. The decoder, the Excel
// translator and the evaluator each keep their own name lists; this keeps them in step.
const origin = { col: 2, row: 2 };
const one: Expr = { type: "int", value: 1 };
const two: Expr = { type: "int", value: 2 };
const ref = { col: 0, row: 0, colAbs: true, rowAbs: true };

const OPERANDS: Record<string, Expr> = {
  NUM: { type: "number", value: 0.5 },
  INT: one,
  STRING: { type: "string", value: "Odd" },
  REF: { type: "ref", ref },
  RANGE: { type: "range", from: ref, to: { ...ref, row: 3 } },
};

/** The smallest formula that uses the entry's opcode, or null for the return token. */
function sample(e: OpcodeEntry): Expr | null {
  switch (e.kind) {
    case "operand":
      return OPERANDS[e.name]!;
    case "unary":
      return { type: "unary", op: e.op, arg: one };
    case "binary":
      return { type: "binary", op: e.op, left: one, right: two };
    case "paren":
      return { type: "paren", inner: one };
    case "function":
      return { type: "call", name: e.name, args: Array.from({ length: e.arity === "variable" ? 1 : e.arity }, () => one) };
    case "return":
      return null;
  }
}

const hex = (op: number) => `0x${op.toString(16).padStart(2, "0")}`;
const tableFunctions = new Set(OPCODES.flatMap((e) => (e.kind === "function" ? [e.name] : [])));

describe("opcode coverage", () => {
  it("the decoder knows every opcode in the table and rebuilds the tree it was encoded from", () => {
    for (const e of OPCODES) {
      const expr = sample(e) ?? one;
      const out = decodeRpn(encodeRpn(expr, origin), origin);
      expect(out.diagnostics.filter((d) => d.code === "unknown-opcode"), hex(e.opcode)).toEqual([]);
      expect(out.unknown, hex(e.opcode)).toBeNull();
      expect(out.ast, hex(e.opcode)).toEqual(expr);
    }
  });

  it("the translator gives Excel text for every opcode except the named no-equivalent functions", () => {
    for (const e of OPCODES) {
      const expr = sample(e) ?? one;
      const out = translateFormula(encodeRpn(expr, origin), origin);
      const none = e.kind === "function" && NO_EQUIVALENT_NAMES.has(e.name);
      if (none) {
        expect(out.excel, hex(e.opcode)).toBeNull();
        expect(out.diagnostics.map((d) => d.code), hex(e.opcode)).toContain("no-excel-equivalent");
      } else {
        expect(out.excel, hex(e.opcode)).toMatch(/\S/);
      }
    }
  });

  it("every translator rule and no-equivalent name is a function in the table", () => {
    for (const name of [...RULE_NAMES, ...NO_EQUIVALENT_NAMES]) expect(tableFunctions.has(name), name).toBe(true);
  });

  it("the evaluator covers every table function, and knows no function the table lacks", () => {
    for (const name of tableFunctions) expect(FUNCTIONS.has(name) || VOLATILE.has(name), name).toBe(true);
    for (const name of [...FUNCTIONS, ...VOLATILE]) expect(tableFunctions.has(name), name).toBe(true);
  });
});
