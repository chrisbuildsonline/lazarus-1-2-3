// printLotus: Lotus 1-2-3 formula text in @ syntax for a decoded (Lotus) AST, for display in the
// provenance report (requirement 45). Paren nodes print as written. A tree without paren nodes
// gets parentheses only where Lotus precedence needs them: ^ 7, unary 6, * / 5, + - 4,
// comparisons 3, #NOT# 2, #AND# #OR# & 1, all binary operators left-associative.
// String constants double an embedded quote, so the text stays unambiguous.
import { a1 } from "../parser/index.ts";
import type { BinaryOp, Expr, Ref } from "./ast.ts";

const BINARY: Record<BinaryOp, [string, number]> = {
  pow: ["^", 7],
  mul: ["*", 5],
  div: ["/", 5],
  add: ["+", 4],
  sub: ["-", 4],
  eq: ["=", 3],
  ne: ["<>", 3],
  lt: ["<", 3],
  gt: [">", 3],
  le: ["<=", 3],
  ge: [">=", 3],
  and: ["#AND#", 1],
  or: ["#OR#", 1],
  concat: ["&", 1],
};
const ATOM = 9;

const ref = (r: Ref) => `${r.colAbs ? "$" : ""}${a1(r.col, 0).slice(0, -1)}${r.rowAbs ? "$" : ""}${r.row + 1}`;

const precedence = (e: Expr) => (e.type === "binary" ? BINARY[e.op][1] : e.type === "unary" ? (e.op === "not" ? 2 : 6) : ATOM);

const child = (e: Expr, min: number, strict = false): string => {
  const p = precedence(e);
  const s = printLotus(e);
  return p < min || (strict && p === min) ? `(${s})` : s;
};

export function printLotus(e: Expr): string {
  switch (e.type) {
    case "number":
    case "int":
      return String(e.value);
    case "string":
      return `"${e.value.replaceAll('"', '""')}"`;
    case "ref":
      return ref(e.ref);
    case "range":
      return `${ref(e.from)}..${ref(e.to)}`;
    case "paren":
      return `(${printLotus(e.inner)})`;
    case "unary":
      return e.op === "not" ? `#NOT#${child(e.arg, 2)}` : `${e.op === "neg" ? "-" : "+"}${child(e.arg, 6)}`;
    case "binary": {
      const [symbol, p] = BINARY[e.op];
      return `${child(e.left, p)}${symbol}${child(e.right, p, true)}`;
    }
    case "call":
      return e.args.length === 0 ? `@${e.name}` : `@${e.name}(${e.args.map(printLotus).join(",")})`;
  }
}
