// The formula AST. One type serves both the Lotus AST (what the decoder returns) and the
// Excel AST (after toExcelAst: Excel function names, no and/or/not operator nodes).

/** The formula cell's own address, 0-based. Relative references resolve against it. */
export type Origin = { col: number; row: number };

/** A resolved cell reference, 0-based, with the absolute flag of each axis. */
export type Ref = { col: number; row: number; colAbs: boolean; rowAbs: boolean };

export type BinaryOp =
  | "add"
  | "sub"
  | "mul"
  | "div"
  | "pow"
  | "eq"
  | "ne"
  | "lt"
  | "gt"
  | "le"
  | "ge"
  | "and"
  | "or"
  | "concat";

export type UnaryOp = "neg" | "plus" | "not";

export type Expr =
  | { type: "number"; value: number }
  | { type: "int"; value: number }
  | { type: "string"; value: string }
  | { type: "ref"; ref: Ref }
  | { type: "range"; from: Ref; to: Ref }
  | { type: "unary"; op: UnaryOp; arg: Expr }
  | { type: "binary"; op: BinaryOp; left: Expr; right: Expr }
  | { type: "paren"; inner: Expr }
  | { type: "call"; name: string; args: Expr[] };

/** Deepest tree the decoder builds; translate and print recurse at most this far. */
export const MAX_DEPTH = 256;
