// Function tokens with literal bytes. Opcodes and arities from LO lotform.cxx IndexToType
// (FT_FuncFixN / FT_FuncVar) and WSFF5; see src/formula/opcodes.ts for each source.
import { describe, expect, it } from "vitest";
import { decodeRpn } from "../../../src/formula/decode.ts";

const O = { col: 0, row: 0 };
const int = (v: number) => [0x05, v & 0xff, (v >> 8) & 0xff];
const run = (...b: number[]) => decodeRpn(new Uint8Array(b), O);
const errors = (r: ReturnType<typeof run>) => r.diagnostics.filter((d) => d.severity === "error");
const ints = (n: number) => Array.from({ length: n }, (_, i) => int(i + 1)).flat();
const intNodes = (n: number) => Array.from({ length: n }, (_, i) => ({ type: "int", value: i + 1 }));

const FIXED: [number, string, number][] = [
  [0x1f, "NA", 0], [0x20, "ERR", 0], [0x21, "ABS", 1], [0x22, "INT", 1], [0x23, "SQRT", 1], [0x26, "PI", 0],
  [0x2f, "MOD", 2], [0x33, "FALSE", 0], [0x34, "TRUE", 0], [0x35, "RAND", 0], [0x36, "DATE", 3], [0x37, "NOW", 0],
  [0x38, "PMT", 3], [0x39, "PV", 3], [0x3a, "FV", 3], [0x3b, "IF", 3], [0x3f, "ROUND", 2],
  [0x55, "VLOOKUP", 3], [0x56, "NPV", 2], [0x5a, "HLOOKUP", 3],
];

describe("fixed-arity functions", () => {
  for (const [opcode, name, arity] of FIXED) {
    it(`0x${opcode.toString(16)} is ${name} with ${arity} args in written order`, () => {
      expect(run(...ints(arity), opcode, 0x03).ast).toEqual({ type: "call", name, args: intNodes(arity) });
    });

    if (arity > 0) {
      it(`0x${opcode.toString(16)} ${name} with one argument too few is a stack-underflow`, () => {
        const r = run(...ints(arity - 1), opcode, 0x03);
        expect(r.ast).toBeNull();
        expect(errors(r)).toMatchObject([{ code: "stack-underflow", offset: 3 * (arity - 1), opcode }]);
      });
    }
  }

  it("decodes gnome647171-1.wks A5 as IF(MOD(A4,2)=1,\"Odd\",\"Even\")", () => {
    const bytes = [0x01, 0x00, 0x80, 0xff, 0xbf, 0x05, 0x02, 0x00, 0x2f, 0x05, 0x01, 0x00, 0x0e];
    const strs = [0x06, 0x4f, 0x64, 0x64, 0x00, 0x06, 0x45, 0x76, 0x65, 0x6e, 0x00, 0x3b, 0x03];
    const r = decodeRpn(new Uint8Array([...bytes, ...strs]), { col: 0, row: 4 });
    expect(r.diagnostics).toEqual([]);
    expect(r.ast).toEqual({
      type: "call",
      name: "IF",
      args: [
        {
          type: "binary",
          op: "eq",
          left: { type: "call", name: "MOD", args: [{ type: "ref", ref: { col: 0, row: 3, colAbs: false, rowAbs: false } }, { type: "int", value: 2 }] },
          right: { type: "int", value: 1 },
        },
        { type: "string", value: "Odd" },
        { type: "string", value: "Even" },
      ],
    });
  });
});

const VARIABLE: [number, string][] = [[0x50, "SUM"], [0x51, "AVG"], [0x52, "COUNT"], [0x53, "MIN"], [0x54, "MAX"], [0x30, "CHOOSE"], [0x58, "STD"]];

describe("variable-arity functions read a count byte", () => {
  for (const [opcode, name] of VARIABLE) {
    for (const n of [0, 1, 2, 255]) {
      it(`0x${opcode.toString(16)} ${name} with count ${n}`, () => {
        expect(run(...ints(n), opcode, n, 0x03).ast).toEqual({ type: "call", name, args: intNodes(n) });
      });
    }

    it(`0x${opcode.toString(16)} ${name} with no count byte is truncated-stream at the token`, () => {
      expect(errors(run(...ints(1), opcode))).toMatchObject([{ code: "truncated-stream", offset: 3, opcode }]);
    });

    it(`0x${opcode.toString(16)} ${name} with a count above the stack depth is a stack-underflow`, () => {
      expect(errors(run(...ints(1), opcode, 2, 0x03))).toMatchObject([{ code: "stack-underflow", offset: 3, opcode }]);
    });
  }
});
