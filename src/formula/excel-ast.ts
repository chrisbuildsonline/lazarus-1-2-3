// toExcelAst: the Lotus AST to the Excel AST. Renames functions, reorders arguments and
// rewrites the Lotus-only operators, adding a diagnostic wherever the meaning may change.
// Recursive, with the decoder's depth cap checked again for hand-built trees.
import { MAX_DEPTH, type Expr } from "./ast.ts";
import { diag, type FormulaDiagnostic } from "./diagnostics.ts";
import { OPCODES } from "./opcodes.ts";

export type TranslateResult = { ast: Expr | null; diagnostics: FormulaDiagnostic[] };

type Rule = {
  excel?: string;
  /** Lotus argument index for each Excel argument. */
  order?: number[];
  /** Wrap in unary minus: Lotus returns the amount, Excel the cash-flow sign. */
  neg?: boolean;
  /** Index of the zero-based argument that gets an explicit +1. */
  base1?: number;
  /** Append TRUE(): Lotus lookups match the largest value not above the key, in sorted order. */
  sorted?: boolean;
  /** semantics-note text, always. */
  note?: string;
  /** semantics-note only when an argument is a range: labels in the range may count differently. */
  rangeNote?: boolean;
  /** Value changes on every recalculation, so the cached value cannot check it. */
  volatile?: boolean;
};

const CASH_FLOW = (note: string): Rule => ({ order: [1, 2, 0], neg: true, note: `${note}; Excel takes rate and term first and returns the cash-flow sign, so the result is negated` });
const LOOKUP: Rule = { base1: 2, sorted: true, note: "Lotus offsets are zero-based and match sorted keys; Excel gets offset+1 and TRUE()" };

const RULES: Record<string, Rule> = {
  SUM: { rangeNote: true },
  MIN: { rangeNote: true },
  MAX: { rangeNote: true },
  AVG: { excel: "AVERAGE", rangeNote: true },
  STD: { excel: "STDEVP", rangeNote: true },
  COUNT: { excel: "COUNTA", note: "Lotus @COUNT counts every non-blank cell; Excel COUNT counts numbers only, so COUNTA" },
  INT: { excel: "TRUNC", note: "Lotus @INT truncates toward zero; Excel INT floors, so TRUNC" },
  MOD: { note: "the sign of the result for negative operands may differ" },
  PMT: CASH_FLOW("Lotus @PMT(principal, rate, term)"),
  PV: CASH_FLOW("Lotus @PV(payment, rate, term)"),
  FV: CASH_FLOW("Lotus @FV(payment, rate, term)"),
  CHOOSE: { base1: 0, note: "Lotus indexes from 0; Excel gets index+1" },
  VLOOKUP: LOOKUP,
  HLOOKUP: LOOKUP,
  NOW: { volatile: true },
  RAND: { volatile: true },
};

/** Functions with no Excel form. */
const NO_EQUIVALENT: Record<string, string> = { ERR: "Lotus @ERR has no Excel equivalent" };

/** Argument count per Lotus function, from the opcode table; "variable" needs at least one. */
const ARITY = new Map(OPCODES.flatMap((e) => (e.kind === "function" ? [[e.name, e.arity] as const] : [])));

export function toExcelAst(ast: Expr, end = 0): TranslateResult {
  const diagnostics: FormulaDiagnostic[] = [];
  let failed = false;
  const fail = (code: "nesting-too-deep" | "no-excel-equivalent", message: string): null => {
    if (!failed) diagnostics.push(diag(code, "error", end, message));
    failed = true;
    return null;
  };

  const call = (name: string, args: Expr[]): Expr | null => {
    if (NO_EQUIVALENT[name]) return fail("no-excel-equivalent", NO_EQUIVALENT[name]);
    const arity = ARITY.get(name);
    if (arity === undefined) return fail("no-excel-equivalent", `function ${name} is not in the opcode table`);
    if (arity === "variable" ? args.length < 1 : args.length !== arity) {
      return fail("no-excel-equivalent", `${name} has ${args.length} arguments, expected ${arity === "variable" ? "at least 1" : arity}`);
    }
    const rule = RULES[name] ?? {};
    const note = rule.note ?? (rule.rangeNote && args.some((a) => a.type === "range") ? "labels and blanks in a range may count differently in Excel" : null);
    if (note) diagnostics.push(diag("semantics-note", "info", end, `${name}: ${note}`));
    if (rule.volatile) diagnostics.push(diag("volatile-function", "warning", end, `${name} is volatile; its cached value cannot be checked`));
    const out: Expr = { type: "call", name: rule.excel ?? name, args: rule.order ? rule.order.map((i) => args[i]!) : args };
    if (rule.base1 !== undefined) {
      out.args[rule.base1] = { type: "binary", op: "add", left: out.args[rule.base1]!, right: { type: "int", value: 1 } };
    }
    if (rule.sorted) out.args.push({ type: "call", name: "TRUE", args: [] });
    return rule.neg ? { type: "unary", op: "neg", arg: out } : out;
  };

  const map = (e: Expr, level: number): Expr | null => {
    if (failed) return null;
    if (level > MAX_DEPTH) return fail("nesting-too-deep", `formula nests deeper than ${MAX_DEPTH} levels`);
    const next = level + 1;
    const all = (xs: Expr[]) => {
      const out = xs.map((x) => map(x, next));
      return out.every((x) => x !== null) ? (out as Expr[]) : null;
    };
    switch (e.type) {
      case "unary": {
        const arg = map(e.arg, next);
        if (!arg) return null;
        return e.op === "not" ? { type: "call", name: "NOT", args: [arg] } : { ...e, arg };
      }
      case "binary": {
        const args = all([e.left, e.right]);
        if (!args) return null;
        const [left, right] = args as [Expr, Expr];
        return e.op === "and" || e.op === "or" ? { type: "call", name: e.op.toUpperCase(), args } : { ...e, left, right };
      }
      case "paren": {
        const inner = map(e.inner, next);
        return inner && { type: "paren", inner };
      }
      case "call": {
        const args = all(e.args);
        return args && call(e.name, args);
      }
      default:
        return e;
    }
  };

  const out = map(ast, 0);
  return { ast: failed ? null : out, diagnostics };
}
