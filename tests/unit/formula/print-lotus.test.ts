// printLotus: Lotus @ syntax for a decoded AST (requirement 45). Spellings from
// .kiro/steering/lotus-format.md and the names in src/formula/opcodes.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeRpn, printLotus, type Expr, type Ref } from "../../../src/formula/index.ts";
import { parseWk1 } from "../../../src/parser/index.ts";

const r = (col: number, row: number, abs = false): Ref => ({ col, row, colAbs: abs, rowAbs: abs });
const ref = (col: number, row: number, abs = false): Expr => ({ type: "ref", ref: r(col, row, abs) });
const n = (value: number): Expr => ({ type: "number", value });
const bin = (op: Extract<Expr, { type: "binary" }>["op"], left: Expr, right: Expr): Expr => ({ type: "binary", op, left, right });

describe("printLotus", () => {
  it("prints calls, ranges and references", () => {
    expect(printLotus({ type: "call", name: "SUM", args: [{ type: "range", from: r(0, 0), to: r(2, 2) }] })).toBe("@SUM(A1..C3)");
    expect(printLotus(ref(0, 0, true))).toBe("$A$1");
    expect(printLotus({ type: "call", name: "PI", args: [] })).toBe("@PI");
    expect(printLotus({ type: "call", name: "IF", args: [bin("gt", ref(0, 0), n(0)), { type: "int", value: 1 }, { type: "int", value: 0 }] })).toBe("@IF(A1>0,1,0)");
  });

  it("prints operators with Lotus spellings", () => {
    expect(printLotus(bin("add", ref(0, 0), bin("mul", ref(1, 1), n(2))))).toBe("A1+B2*2");
    expect(printLotus({ type: "unary", op: "not", arg: ref(0, 0) })).toBe("#NOT#A1");
    expect(printLotus(bin("and", ref(0, 0), ref(1, 0)))).toBe("A1#AND#B1");
    expect(printLotus(bin("or", ref(0, 0), ref(1, 0)))).toBe("A1#OR#B1");
    expect(printLotus(bin("concat", { type: "string", value: "text" }, ref(0, 0)))).toBe('"text"&A1');
    expect(printLotus(bin("mul", { type: "paren", inner: bin("add", ref(0, 0), n(1)) }, n(2)))).toBe("(A1+1)*2");
    expect(printLotus(bin("ne", ref(0, 0), { type: "unary", op: "neg", arg: n(1) }))).toBe("A1<>-1");
    expect(printLotus(bin("le", bin("pow", ref(0, 0), n(2)), bin("div", n(1), n(4))))).toBe("A1^2<=1/4");
  });

  it("adds parentheses only when the tree needs them and has no paren node", () => {
    expect(printLotus(bin("mul", bin("add", ref(0, 0), n(1)), n(2)))).toBe("(A1+1)*2");
    expect(printLotus(bin("sub", n(1), bin("sub", n(2), n(3))))).toBe("1-(2-3)");
  });

  it("doubles embedded quotes in string constants", () => {
    expect(printLotus({ type: "string", value: 'say "hi"' })).toBe('"say ""hi"""');
  });

  it("never throws and never starts with = on every wk1/wks fixture formula", () => {
    const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; format: string }[] };
    let printed = 0;
    for (const f of manifest.fixtures.filter((x) => x.format === "wk1" || x.format === "wks")) {
      const { sheet } = parseWk1(new Uint8Array(readFileSync(f.path)));
      for (const c of sheet.cells.values()) {
        if (c.kind !== "formula") continue;
        const { ast } = decodeRpn(c.rpn, { col: c.col, row: c.row });
        if (!ast) continue;
        const text = printLotus(ast);
        expect(text.startsWith("=")).toBe(false);
        expect(text.length).toBeGreaterThan(0);
        printed++;
      }
    }
    expect(printed).toBeGreaterThan(160);
  });
});
