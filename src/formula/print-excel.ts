// printExcel: Excel formula text (no leading =) for an Excel AST. Parentheses come from the
// tree: a child binding looser than its parent, or a right child binding equally (every Excel
// binary operator is left-associative), is wrapped. Unary minus binds tighter than ^ in Excel,
// so Lotus -(a^b) keeps its parentheses.
import { a1 } from "../parser/index.ts";
import { MAX_DEPTH, type BinaryOp, type Expr, type Ref } from "./ast.ts";
import { diag, type FormulaDiagnostic } from "./diagnostics.ts";

export type PrintResult = { text: string | null; diagnostics: FormulaDiagnostic[] };

const ref = (r: Ref) => `${r.colAbs ? "$" : ""}${a1(r.col, 0).slice(0, -1)}${r.rowAbs ? "$" : ""}${r.row + 1}`;

/** Excel symbol and precedence (higher binds tighter). and/or have none: toExcelAst makes them calls. */
const BINARY: Partial<Record<BinaryOp, [string, number]>> = {
  pow: ["^", 5],
  mul: ["*", 4],
  div: ["/", 4],
  add: ["+", 3],
  sub: ["-", 3],
  concat: ["&", 2],
  eq: ["=", 1],
  ne: ["<>", 1],
  lt: ["<", 1],
  gt: [">", 1],
  le: ["<=", 1],
  ge: [">=", 1],
};
const MAX_STRING = 255;
const UNARY = 6;
const ATOM = 9;

const precedence = (e: Expr) => (e.type === "binary" ? (BINARY[e.op]?.[1] ?? ATOM) : e.type === "unary" ? UNARY : ATOM);

/** `end` is the offset later-stage diagnostics carry: the length of the rpn they came from. */
export function printExcel(ast: Expr, end = 0): PrintResult {
  const diagnostics: FormulaDiagnostic[] = [];

  const number = (v: number): string => {
    const s = String(v === 0 ? 0 : v).toUpperCase();
    const digits = s.replace(/^-/, "").replace(/E.*$/, "").replace(".", "").replace(/^0+/, "").replace(/0+$/, "");
    if (digits.length > 15) {
      diagnostics.push(diag("constant-precision", "info", end, `constant ${s} has ${digits.length} significant digits; Excel reads 15`));
    }
    return s;
  };

  let failed = false;
  const fail = (code: "nesting-too-deep" | "no-excel-equivalent" | "excel-limit", message: string): string => {
    if (!failed) diagnostics.push(diag(code, "error", end, message));
    failed = true;
    return "";
  };

  /** Prints `e` as a child that must bind at least `min` tightly (strictly, if `strict`). */
  const child = (e: Expr, level: number, min: number, strict = false): string => {
    const p = precedence(e);
    const s = print(e, level);
    return p < min || (strict && p === min) ? `(${s})` : s;
  };

  const print = (e: Expr, level: number): string => {
    if (failed) return "";
    if (level > MAX_DEPTH) return fail("nesting-too-deep", `formula nests deeper than ${MAX_DEPTH} levels`);
    const next = level + 1;
    switch (e.type) {
      case "number":
        return number(e.value);
      case "int":
        return String(e.value);
      case "string":
        if (e.value.length > MAX_STRING) return fail("excel-limit", `string constant has ${e.value.length} characters; Excel allows ${MAX_STRING}`);
        return `"${e.value.replaceAll('"', '""')}"`;
      case "ref":
        return ref(e.ref);
      case "range":
        return `${ref(e.from)}:${ref(e.to)}`;
      case "paren":
        return `(${print(e.inner, next)})`;
      case "unary":
        if (e.op === "not") return fail("no-excel-equivalent", "NOT operator left in the tree; Excel has only the NOT() call");
        return `${e.op === "neg" ? "-" : "+"}${child(e.arg, next, UNARY)}`;
      case "binary": {
        const b = BINARY[e.op];
        if (!b) return fail("no-excel-equivalent", `${e.op} operator left in the tree; Excel has only the ${e.op.toUpperCase()}() call`);
        return `${child(e.left, next, b[1])}${b[0]}${child(e.right, next, b[1], true)}`;
      }
      case "call":
        return `${e.name}(${e.args.map((a) => print(a, next)).join(",")})`;
    }
  };

  const text = print(ast, 0);
  return { text: failed ? null : text, diagnostics };
}
