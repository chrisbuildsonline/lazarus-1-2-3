// Test-only: a recursive-descent parser for the Excel formula text our printer emits, used as an
// independent check on src/formula/print-excel.ts (which it must not import). Excel precedence,
// loosest first: comparisons, &, + -, * /, ^, unary - +. Binary operators are left-associative.
// Parentheses become paren nodes; every numeric literal is a number node. No whitespace, no =.
import type { BinaryOp, Expr, Ref } from "../../../src/formula/ast.ts";

export type ParseResult = { ok: true; ast: Expr } | { ok: false; error: string };

const LEVELS: [string, BinaryOp][][] = [
  [["<>", "ne"], ["<=", "le"], [">=", "ge"], ["=", "eq"], ["<", "lt"], [">", "gt"]],
  [["&", "concat"]],
  [["+", "add"], ["-", "sub"]],
  [["*", "mul"], ["/", "div"]],
  [["^", "pow"]],
];

class ParseError extends Error {}

export function parseExcel(text: string): ParseResult {
  let pos = 0;
  const fail = (what: string): never => {
    throw new ParseError(`${what} at ${pos} in ${JSON.stringify(text)}`);
  };
  const eat = (s: string) => (text.startsWith(s, pos) ? ((pos += s.length), true) : false);
  const match = (re: RegExp) => {
    const m = re.exec(text.slice(pos));
    if (m) pos += m[0].length;
    return m;
  };

  const binary = (level: number): Expr => {
    if (level === LEVELS.length) return unary();
    let left = binary(level + 1);
    for (;;) {
      const op = LEVELS[level]!.find(([sym]) => eat(sym));
      if (!op) return left;
      left = { type: "binary", op: op[1], left, right: binary(level + 1) };
    }
  };

  const unary = (): Expr => {
    if (eat("-")) return { type: "unary", op: "neg", arg: unary() };
    if (eat("+")) return { type: "unary", op: "plus", arg: unary() };
    return primary();
  };

  const cell = (): Ref | null => {
    const m = match(/^(\$?)([A-Z]+)(\$?)([1-9][0-9]*)/);
    if (!m) return null;
    const col = [...m[2]!].reduce((c, ch) => c * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    const row = Number(m[4]) - 1;
    if (col > 255 || row > 8191) fail(`cell ${m[0]} outside the grid`);
    return { col, row, colAbs: m[1] === "$", rowAbs: m[3] === "$" };
  };

  const primary = (): Expr => {
    const num = match(/^[0-9]+(\.[0-9]+)?(E[+-]?[0-9]+)?/);
    if (num) return { type: "number", value: Number(num[0]) };
    if (eat('"')) {
      let value = "";
      for (;;) {
        if (pos >= text.length) fail("unterminated string");
        if (eat('""')) value += '"';
        else if (eat('"')) return { type: "string", value };
        else value += text[pos++];
      }
    }
    if (eat("(")) {
      const inner = binary(0);
      if (!eat(")")) fail("missing )");
      return { type: "paren", inner };
    }
    const name = match(/^([A-Z][A-Z0-9.]*)\(/);
    if (name) {
      const args: Expr[] = [];
      if (!eat(")")) {
        do args.push(binary(0));
        while (eat(","));
        if (!eat(")")) fail("missing ) after arguments");
      }
      return { type: "call", name: name[1]!, args };
    }
    const from = cell();
    if (from) {
      if (!eat(":")) return { type: "ref", ref: from };
      const to = cell();
      return to ? { type: "range", from, to } : fail("range without a second corner");
    }
    return fail("expected an operand");
  };

  try {
    const ast = binary(0);
    if (pos !== text.length) fail("unexpected text");
    return { ok: true, ast };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message };
    throw e;
  }
}
