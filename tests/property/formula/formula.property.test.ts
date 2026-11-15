import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseWk1 } from "../../../src/parser/index.ts";
import type { BinaryOp, Expr, Origin, Ref } from "../../../src/formula/ast.ts";
import { OPCODES } from "../../../src/formula/opcodes.ts";
import { decodeRpn, isUnverifiable, printExcel, toExcelAst, translateFormula, type FormulaTranslation } from "../../../src/formula/index.ts";
import { concat } from "../../unit/helpers/bytes.ts";
import { parseExcel } from "../../unit/helpers/excel-parse.ts";
import { encodeRpn } from "../../unit/helpers/rpn-encode.ts";

/** int becomes number (text cannot tell them apart) and paren nodes go (a presentation fact). */
function normalize(e: Expr): Expr {
  switch (e.type) {
    case "int":
      return { type: "number", value: e.value };
    case "paren":
      return normalize(e.inner);
    case "unary":
      return { ...e, arg: normalize(e.arg) };
    case "binary":
      return { ...e, left: normalize(e.left), right: normalize(e.right) };
    case "call":
      return { ...e, args: e.args.map(normalize) };
    default:
      return e;
  }
}

// Generators. Constants are finite, non-negative and never -0: a leading - reads back as unary neg.
const latin1 = fc.oneof(fc.integer({ min: 0x20, max: 0x7e }), fc.integer({ min: 0xa0, max: 0xff })).map((c) => String.fromCharCode(c));
const number = fc.double({ min: 0, noNaN: true, noDefaultInfinity: true }).map((v): Expr => ({ type: "number", value: v === 0 ? 0 : v }));
const int = fc.integer({ min: 0, max: 32767 }).map((value): Expr => ({ type: "int", value }));
const string = fc.string({ unit: fc.oneof(latin1, fc.constant('"')), maxLength: 20 }).map((value): Expr => ({ type: "string", value }));

/** A ref that a relative word can encode from `o` and that stays in the grid. */
const cell = (o: Origin): fc.Arbitrary<Ref> =>
  fc.record({ colAbs: fc.boolean(), rowAbs: fc.boolean() }).chain(({ colAbs, rowAbs }) =>
    fc.record({
      col: colAbs ? fc.integer({ min: 0, max: 255 }) : fc.integer({ min: Math.max(0, o.col - 128), max: Math.min(255, o.col + 127) }),
      row: rowAbs ? fc.integer({ min: 0, max: 8191 }) : fc.integer({ min: Math.max(0, o.row - 4096), max: Math.min(8191, o.row + 4095) }),
      colAbs: fc.constant(colAbs),
      rowAbs: fc.constant(rowAbs),
    }),
  );

const EXCEL_BINARY: BinaryOp[] = ["add", "sub", "mul", "div", "pow", "eq", "ne", "lt", "gt", "le", "ge", "concat"];
const EXCEL_CALLS: [string, number | "variable"][] = [
  ["SUM", "variable"], ["AVERAGE", "variable"], ["COUNTA", "variable"], ["STDEVP", "variable"], ["CHOOSE", "variable"],
  ["TRUNC", 1], ["ABS", 1], ["NOT", 1], ["MOD", 2], ["ROUND", 2], ["AND", 2], ["OR", 2], ["NPV", 2], ["IF", 3], ["DATE", 3],
  ["PMT", 3], ["PV", 3], ["FV", 3], ["VLOOKUP", 4], ["HLOOKUP", 4], ["NA", 0], ["TRUE", 0], ["FALSE", 0], ["PI", 0], ["NOW", 0], ["RAND", 0],
];
/** Lotus functions from the opcode table, without ERR (it has no Excel form). */
const LOTUS_CALLS: [string, number | "variable"][] = OPCODES.flatMap((e) => (e.kind === "function" && e.name !== "ERR" ? [[e.name, e.arity] as [string, number | "variable"]] : []));

function exprs(o: Origin, binaryOps: BinaryOp[], unaryOps: ("neg" | "plus" | "not")[], calls: [string, number | "variable"][]) {
  return fc.letrec<{ e: Expr }>((tie) => {
    const sub = tie("e");
    const leaf = fc.oneof(
      number,
      int,
      string,
      cell(o).map((ref): Expr => ({ type: "ref", ref })),
      fc.tuple(cell(o), cell(o)).map(([from, to]): Expr => ({ type: "range", from, to })),
    );
    const call = fc.constantFrom(...calls).chain(([name, arity]) =>
      fc.array(sub, arity === "variable" ? { minLength: 1, maxLength: 4 } : { minLength: arity, maxLength: arity }).map((args): Expr => ({ type: "call", name, args })),
    );
    return {
      e: fc.oneof(
        { depthSize: "small", maxDepth: 6 },
        leaf,
        fc.tuple(fc.constantFrom(...unaryOps), sub).map(([op, arg]): Expr => ({ type: "unary", op, arg })),
        fc.tuple(fc.constantFrom(...binaryOps), sub, sub).map(([op, left, right]): Expr => ({ type: "binary", op, left, right })),
        sub.map((inner): Expr => ({ type: "paren", inner })),
        call,
      ),
    };
  }).e;
}

const origin = fc.record({ col: fc.integer({ min: 0, max: 255 }), row: fc.integer({ min: 0, max: 8191 }) });
const excelExpr = origin.chain((o) => exprs(o, EXCEL_BINARY, ["neg", "plus"], EXCEL_CALLS));
const lotusCase = origin.chain((o) => exprs(o, [...EXCEL_BINARY, "and", "or"], ["neg", "plus", "not"], LOTUS_CALLS).map((e) => ({ o, e })));

function expectWellFormed(t: FormulaTranslation, length: number): void {
  const errors = t.diagnostics.filter((d) => d.severity === "error");
  expect(t.status).toBe(isUnverifiable(t.diagnostics) ? "unverifiable" : "ok");
  if (t.status === "ok") {
    expect(t.excel).not.toBeNull();
    expect(errors).toEqual([]);
  }
  if (errors.length) {
    expect(t.status).toBe("unverifiable");
    expect(t.excel).toBeNull();
    if (errors.some((d) => d.code !== "no-excel-equivalent")) expect(t.ast).toBeNull();
  }
  for (const d of t.diagnostics) {
    expect(d.offset).toBeGreaterThanOrEqual(0);
    expect(d.offset).toBeLessThanOrEqual(length);
    expect(d.message).toContain(`offset ${d.offset}`);
    if (d.opcode !== undefined) expect(d.message).toContain(`0x${d.opcode.toString(16).toUpperCase().padStart(2, "0")}`);
  }
}

describe("formula round trips", () => {
  it("re-parses printed Excel text to the same tree", () => {
    fc.assert(
      fc.property(excelExpr, (x) => {
        const p = printExcel(x);
        expect(p.text).not.toBeNull();
        const back = parseExcel(p.text!);
        expect(back.ok, `${p.text} ${back.ok ? "" : back.error}`).toBe(true);
        if (back.ok) expect(normalize(back.ast)).toEqual(normalize(x));
      }),
      { numRuns: 1000 },
    );
  });

  it("re-parses the printed translation of a Lotus tree to the translated tree", () => {
    fc.assert(
      fc.property(lotusCase, ({ e }) => {
        const x = toExcelAst(e);
        expect(x.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
        const p = printExcel(x.ast!);
        const back = parseExcel(p.text!);
        expect(back.ok, `${p.text} ${back.ok ? "" : back.error}`).toBe(true);
        if (back.ok) expect(normalize(back.ast)).toEqual(normalize(x.ast!));
      }),
      { numRuns: 1000 },
    );
  });

  it("decodes encoded RPN back to the same Lotus tree", () => {
    fc.assert(
      fc.property(lotusCase, ({ o, e }) => {
        const r = decodeRpn(encodeRpn(e, o), o);
        expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
        expect(r.ast).toEqual(e);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("translateFormula never throws", () => {
  const anyOrigin = fc.record({ col: fc.integer({ min: 0, max: 65535 }), row: fc.integer({ min: 0, max: 65535 }) });

  it("on arbitrary bytes and any origin, and returns a well-formed result", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), anyOrigin, (bytes, o) => {
        expectWellFormed(translateFormula(bytes, o), bytes.length);
      }),
      { numRuns: 2000 },
    );
  });

  it("on streams built from table opcodes with random operand bytes", () => {
    const opcodes = OPCODES.map((e) => e.opcode).filter((op) => op !== 0x03);
    const token = fc.tuple(fc.constantFrom(...opcodes), fc.uint8Array({ maxLength: 9 })).map(([op, rest]) => [op, ...rest]);
    fc.assert(
      fc.property(fc.array(token, { maxLength: 60 }), fc.boolean(), anyOrigin, (tokens, ret, o) => {
        const bytes = Uint8Array.from([...tokens.flat(), ...(ret ? [0x03] : [])]);
        expectWellFormed(translateFormula(bytes, o), bytes.length);
      }),
      { numRuns: 2000 },
    );
  });

  describe("on mutated real fixture formulas", () => {
    const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; format: string }[] };
    const formulas = manifest.fixtures
      .filter((e) => e.format === "wk1" || e.format === "wks")
      .flatMap((e) => [...parseWk1(new Uint8Array(readFileSync(e.path))).sheet.cells.values()])
      .flatMap((c) => (c.kind === "formula" ? [{ rpn: c.rpn, o: { col: c.col, row: c.row } }] : []));

    it("has formulas to mutate", () => {
      expect(formulas.length).toBeGreaterThan(0);
    });

    it("with flips, truncation, insertion and deletion", () => {
      const mutation = fc.record({
        pick: fc.nat(),
        flips: fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 })), { maxLength: 4 }),
        insert: fc.option(fc.tuple(fc.nat(), fc.uint8Array({ minLength: 1, maxLength: 8 }))),
        remove: fc.option(fc.tuple(fc.nat(), fc.integer({ min: 1, max: 8 }))),
        cut: fc.option(fc.nat()),
      });
      fc.assert(
        fc.property(mutation, (m) => {
          const f = formulas[m.pick % formulas.length]!;
          let bytes: Uint8Array = f.rpn.slice();
          for (const [at, value] of m.flips) bytes[at % bytes.length] = value;
          if (m.insert) {
            const at = m.insert[0] % (bytes.length + 1);
            bytes = concat(bytes.subarray(0, at), m.insert[1], bytes.subarray(at));
          }
          if (m.remove) {
            const at = m.remove[0] % (bytes.length + 1);
            bytes = concat(bytes.subarray(0, at), bytes.subarray(at + m.remove[1]));
          }
          if (m.cut !== null) bytes = bytes.subarray(0, m.cut % (bytes.length + 1));
          expectWellFormed(translateFormula(bytes, f.o), bytes.length);
        }),
        { numRuns: 2000 },
      );
    });
  });

  it("returns nesting-too-deep for 60 000 negates after one operand, without overflowing", () => {
    const bytes = new Uint8Array(3 + 60_000 + 1).fill(0x08);
    bytes.set([0x05, 0x01, 0x00]);
    bytes[bytes.length - 1] = 0x03;
    const t = translateFormula(bytes, { col: 0, row: 0 });
    expectWellFormed(t, bytes.length);
    expect(t.diagnostics.filter((d) => d.severity === "error")).toMatchObject([{ code: "nesting-too-deep", offset: 3 + 256 }]);
  });
});
