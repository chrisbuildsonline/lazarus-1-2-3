// evaluate: walks one Lotus AST over a context that reads cells (design.md "Evaluation").
// Recursion follows the AST only, whose depth the decoder caps at MAX_DEPTH.
import { MAX_DEPTH, OPCODES, type Expr } from "../formula/index.ts";
import { a1 } from "../parser/index.ts";
import { FINANCE, npv } from "./finance.ts";
import { corners, type Corner } from "./graph.ts";
import { LISTS, type ListArg } from "./lists.ts";
import { choose, hlookup, ifValue, vlookup } from "./lookup.ts";
import { MATH } from "./math.ts";
import { binary, unary } from "./ops.ts";
import {
  decodeError,
  dependsOnUnverifiable,
  labelZero,
  num,
  str,
  undocumented,
  unsupportedFunction,
  valueFromDouble,
  volatileFunction,
  type Operand,
  type Outcome,
  type Range,
  type RangeCell,
  type Unverifiable,
  type Value,
} from "./value.ts";

/** One cell as a formula sees it: nothing there, a label, a stored double, or a formula's outcome. */
export type CellRead = { t: "empty" } | { t: "label" } | { t: "number"; v: number } | { t: "formula"; o: Outcome<Value> };

export type RangeItem = { col: number; row: number; read: CellRead };

export type EvalContext = {
  read(col: number, row: number): CellRead;
  /** The cells the sheet holds inside the rectangle (corners already normalised), in row-major order. */
  rangeItems(from: Corner, to: Corner): Iterable<RangeItem>;
};

type Result = Outcome<Operand>;

const ok = (v: Operand): Result => ({ ok: true, v });

/** A cell read as an operand: empty stays empty, a label is a flagged 0 (S01, U02), NaN is U12. */
function operand(col: number, row: number, read: CellRead): Result {
  switch (read.t) {
    case "empty":
      return ok({ t: "empty" });
    case "label":
      return ok(labelZero());
    case "number": {
      const v = valueFromDouble(read.v);
      return v ? ok(v) : { ok: false, u: undocumented("U12", `the special marker stored as the number in ${a1(col, row)}`) };
    }
    case "formula":
      return read.o.ok ? read.o : { ok: false, u: dependsOnUnverifiable(a1(col, row), read.o.u) };
  }
}

function ev(e: Expr, ctx: EvalContext): Result {
  switch (e.type) {
    case "number":
    case "int":
      return ok(num(e.value));
    case "paren":
      return ev(e.inner, ctx);
    case "ref":
      return operand(e.ref.col, e.ref.row, ctx.read(e.ref.col, e.ref.row));
    case "unary": {
      const a = ev(e.arg, ctx);
      return a.ok ? unary(e.op, a.v) : a;
    }
    case "binary": {
      const a = ev(e.left, ctx);
      if (!a.ok) return a;
      const b = ev(e.right, ctx);
      return b.ok ? binary(e.op, a.v, b.v) : b;
    }
    case "string":
      return ok(str(e.value));
    case "range":
      return { ok: false, u: undocumented("U10", "a range where a single value is expected") };
    case "call":
      return call(e.name, e.args, ctx);
  }
}

/** A single reference to an empty cell as the whole result is 0 (S01). */
const value = (v: Operand): Value => (v.t === "empty" ? num(0) : v);
const asValue = (r: Result): Outcome<Value> => (r.ok ? { ok: true, v: value(r.v) } : r);

/** A cell inside a range: its operand, or why the formula there could not be checked. */
function rangeCell(item: RangeItem): RangeCell {
  const r = operand(item.col, item.row, item.read);
  return r.ok ? r.v : { t: "unverifiable", u: r.u };
}

/** The table argument of NPV and the lookups: every cell of the rectangle, row-major; a single value is 1 x 1. */
function table(e: Expr, ctx: EvalContext): Range | Result {
  if (e.type !== "range") {
    const r = ev(e, ctx);
    return r.ok ? { rows: 1, cols: 1, cells: [r.v] } : r;
  }
  const { from, to } = corners(e);
  const rows = to.row - from.row + 1;
  const cols = to.col - from.col + 1;
  const cells: RangeCell[] = Array.from({ length: rows * cols }, () => ({ t: "empty" }));
  for (const item of ctx.rangeItems(from, to)) cells[(item.row - from.row) * cols + item.col - from.col] = rangeCell(item);
  return { rows, cols, cells };
}

/** A list function argument: one listed item, kept even when it failed, so COUNT can count it (S04). */
function listArg(e: Expr, ctx: EvalContext): ListArg {
  if (e.type === "range") {
    const { from, to } = corners(e);
    return { range: true, cells: [...ctx.rangeItems(from, to)].map(rangeCell) };
  }
  const r = ev(e, ctx);
  return { range: false, cell: r.ok ? r.v : { t: "unverifiable", u: r.u } };
}

/** Arities are checked by `check` before the walk, so every argument read here exists. */
function call(name: string, args: readonly Expr[], ctx: EvalContext): Result {
  const arg = (i: number) => args[i]!;
  const branch = (e: Expr) => () => asValue(ev(e, ctx));
  if (name === "IF" || name === "CHOOSE") {
    const x = ev(arg(0), ctx);
    if (!x.ok) return x;
    return name === "IF" ? ifValue(x.v, branch(arg(1)), branch(arg(2))) : choose(x.v, args.slice(1).map(branch));
  }
  if (name === "NPV" || name === "VLOOKUP" || name === "HLOOKUP") {
    const x = ev(arg(0), ctx);
    if (!x.ok) return x;
    const t = table(arg(1), ctx);
    if (!("rows" in t)) return t;
    if (name === "NPV") return npv(x.v, t);
    const k = ev(arg(2), ctx);
    if (!k.ok) return k;
    return (name === "VLOOKUP" ? vlookup : hlookup)(x.v, t, k.v);
  }
  const list = LISTS[name];
  if (list) return list(args.map((e) => listArg(e, ctx)));
  const fn = NUMBER_FUNCTIONS[name];
  if (!fn) return { ok: false, u: unsupportedFunction(name) };
  const values: Operand[] = [];
  for (const e of args) {
    const r = ev(e, ctx);
    if (!r.ok) return r;
    values.push(r.v);
  }
  return fn(values);
}

const NUMBER_FUNCTIONS = { ...MATH, ...FINANCE };

/** S25: functions whose value changes on every recalculation. */
export const VOLATILE: ReadonlySet<string> = new Set(["NOW", "RAND"]);

/** Every function name the engine evaluates. */
export const FUNCTIONS: ReadonlySet<string> = new Set([...Object.keys(NUMBER_FUNCTIONS), ...Object.keys(LISTS), "IF", "CHOOSE", "NPV", "VLOOKUP", "HLOOKUP"]);

const ARITY = new Map(OPCODES.flatMap((e) => (e.kind === "function" ? [[e.name, e.arity] as const] : [])));

/**
 * The static checks over the whole AST before any value is computed (S25, requirement 64): a
 * volatile call anywhere, else the first call the engine cannot evaluate or whose argument count
 * does not fit its opcode. Iterative, so it is safe on any tree.
 */
function check(expr: Expr): Unverifiable | null {
  let found: Unverifiable | null = null;
  const stack: [Expr, number][] = [[expr, 0]];
  for (let top = stack.pop(); top; top = stack.pop()) {
    const [e, depth] = top;
    // Requirement 6: the walk below recurses along the AST, so a deeper tree stops here.
    if (depth > MAX_DEPTH) return decodeError("nesting-too-deep", `formula nests deeper than ${MAX_DEPTH} levels`);
    const children = e.type === "unary" ? [e.arg] : e.type === "binary" ? [e.left, e.right] : e.type === "paren" ? [e.inner] : e.type === "call" ? e.args : [];
    for (const c of children) stack.push([c, depth + 1]);
    if (e.type !== "call") continue;
    if (VOLATILE.has(e.name)) return volatileFunction(e.name);
    const arity = ARITY.get(e.name);
    const fits = typeof arity === "number" ? e.args.length === arity : e.name !== "CHOOSE" || e.args.length > 0;
    if (!FUNCTIONS.has(e.name)) found ??= unsupportedFunction(e.name);
    else if (!fits) found ??= decodeError("argument-count", `@${e.name} has ${e.args.length} arguments`);
  }
  return found;
}

export function evaluate(expr: Expr, ctx: EvalContext): Outcome<Value> {
  const stop = check(expr);
  return stop ? { ok: false, u: stop } : asValue(ev(expr, ctx));
}
