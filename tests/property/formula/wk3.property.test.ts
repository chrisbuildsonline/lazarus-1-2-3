// decodeRpn with dialect "wk3": total on any bytes, and a round trip of generated trees through
// the test encoder tests/unit/helpers/rpn3-encode.ts.
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BinaryOp, Expr, Ref } from "../../../src/formula/ast.ts";
import { decodeRpn } from "../../../src/formula/decode.ts";
import { OPCODES } from "../../../src/formula/opcodes.ts";
import { parseWk3 } from "../../../src/parser/index.ts";
import { encodeRpn3 } from "../../unit/helpers/rpn3-encode.ts";

const latin1 = fc.oneof(fc.integer({ min: 0x20, max: 0x7e }), fc.integer({ min: 0xa0, max: 0xff })).map((c) => String.fromCharCode(c));
const number = fc.double({ noNaN: true, noDefaultInfinity: true }).map((v): Expr => ({ type: "number", value: v === 0 ? 0 : v }));
const int = fc.integer({ min: -16384, max: 16383 }).map((value): Expr => ({ type: "int", value }));
const string = fc.string({ unit: latin1, maxLength: 20 }).map((value): Expr => ({ type: "string", value }));
const cell: fc.Arbitrary<Ref> = fc.record({ col: fc.integer({ min: 0, max: 255 }), row: fc.integer({ min: 0, max: 8191 }), colAbs: fc.boolean(), rowAbs: fc.boolean() });
const BINARY: BinaryOp[] = ["add", "sub", "mul", "div", "pow", "eq", "ne", "lt", "gt", "le", "ge", "and", "or", "concat"];
const CALLS = OPCODES.flatMap((e) => (e.kind === "function" ? [[e.name, e.arity] as const] : []));

const expr = fc.letrec<{ e: Expr }>((tie) => {
  const sub = tie("e");
  return {
    e: fc.oneof(
      { depthSize: "small", maxDepth: 6 },
      fc.oneof(number, int, string, cell.map((ref): Expr => ({ type: "ref", ref })), fc.tuple(cell, cell).map(([from, to]): Expr => ({ type: "range", from, to }))),
      fc.tuple(fc.constantFrom("neg" as const, "plus" as const, "not" as const), sub).map(([op, arg]): Expr => ({ type: "unary", op, arg })),
      fc.tuple(fc.constantFrom(...BINARY), sub, sub).map(([op, left, right]): Expr => ({ type: "binary", op, left, right })),
      sub.map((inner): Expr => ({ type: "paren", inner })),
      fc.constantFrom(...CALLS).chain(([name, arity]) =>
        fc.array(sub, arity === "variable" ? { maxLength: 4 } : { minLength: arity, maxLength: arity }).map((args): Expr => ({ type: "call", name, args })),
      ),
    ),
  };
}).e;

const origin = fc.record({ col: fc.integer({ min: 0, max: 255 }), row: fc.integer({ min: 0, max: 8191 }), sheet: fc.integer({ min: 0, max: 255 }) });

function expectWellFormed(rpn: Uint8Array, o: { col: number; row: number; sheet: number }) {
  const r = decodeRpn(rpn, o, "wk3");
  const errors = r.diagnostics.filter((d) => d.severity === "error");
  expect(r.bytesRead).toBeLessThanOrEqual(rpn.length);
  expect(r.ast === null).toBe(errors.length > 0);
  if (r.unknown) expect(errors.map((d) => d.code)).toEqual(["unknown-opcode"]);
}

describe("decodeRpn wk3 never throws", () => {
  it("on arbitrary bytes and any origin", () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 64 }), origin, (b, o) => expectWellFormed(b, o)), { numRuns: 2000 });
  });

  it("on every prefix and one-byte change of the real NOAA formulas", () => {
    const rpns = ["fixtures/noaa-ala-wai-m3/m3.wk3", "fixtures/noaa-ala-wai-m21/m21tab.wk3"].flatMap((p) =>
      parseWk3(new Uint8Array(readFileSync(p))).workbook.sheets.flatMap(({ sheet }) => [...sheet.cells.values()].flatMap((c) => (c.kind === "formula" ? [{ rpn: c.rpn, o: { col: c.col, row: c.row, sheet: 0 } }] : []))),
    );
    expect(rpns.length).toBe(683);
    fc.assert(
      fc.property(fc.constantFrom(...rpns), fc.nat(), fc.integer({ min: 0, max: 255 }), ({ rpn, o }, i, byte) => {
        const cut = rpn.subarray(0, i % (rpn.length + 1));
        expectWellFormed(cut, o);
        const changed = Uint8Array.from(rpn);
        changed[i % rpn.length] = byte;
        expectWellFormed(changed, o);
      }),
      { numRuns: 2000 },
    );
  });
});

describe("decodeRpn wk3 round trip", () => {
  it("decodes encoded RPN back to the same tree", () => {
    fc.assert(
      fc.property(expr, origin, fc.boolean(), (e, o, sheetRel) => {
        const r = decodeRpn(encodeRpn3(e, o.sheet, sheetRel), o, "wk3");
        expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
        expect(r.ast).toEqual(e);
      }),
      { numRuns: 1000 },
    );
  });

  it("refuses the same tree written on another sheet when it holds a reference", () => {
    const withRef = expr.filter((e) => JSON.stringify(e).includes('"colAbs"'));
    fc.assert(
      fc.property(withRef, origin, fc.integer({ min: 1, max: 255 }), (e, o, d) => {
        const r = decodeRpn(encodeRpn3(e, (o.sheet + d) % 256), o, "wk3");
        expect(r.ast).toBeNull();
        expect(r.diagnostics.filter((x) => x.severity === "error").map((x) => x.code)).toEqual(["foreign-reference"]);
      }),
      { numRuns: 500 },
    );
  });
});
