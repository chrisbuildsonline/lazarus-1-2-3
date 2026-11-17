// The dependency graph between formula cells (requirements 30 to 33, rule S26). Nothing here
// recurses: the AST walk and the depth-first search keep their own stacks.
import type { Expr } from "../formula/index.ts";
import { cellKey } from "../parser/index.ts";

export type Corner = { col: number; row: number };
export type Rect = { from: Corner; to: Corner };

/** Requirement 41: the two corners as min and max. */
export function corners(r: Rect): Rect {
  return {
    from: { col: Math.min(r.from.col, r.to.col), row: Math.min(r.from.row, r.to.row) },
    to: { col: Math.max(r.from.col, r.to.col), row: Math.max(r.from.row, r.to.row) },
  };
}

export type Precedents = { refs: Corner[]; ranges: Rect[] };

const byKey = (a: Corner, b: Corner) => cellKey(a.col, a.row) - cellKey(b.col, b.row);

const colOf = (key: number) => key % 65536;
const rowOf = (key: number) => Math.floor(key / 65536);

/** The keys in the rectangle that pass `has`, by visiting every cell of it, row-major. */
export function enumerateRange(r: Rect, has: (key: number) => boolean): number[] {
  const out: number[] = [];
  for (let row = r.from.row; row <= r.to.row; row++) {
    for (let col = r.from.col; col <= r.to.col; col++) if (has(cellKey(col, row))) out.push(cellKey(col, row));
  }
  return out;
}

/** The keys in the rectangle, by testing each of `sorted` (ascending keys, so row-major) against it. */
export function filterRange(r: Rect, sorted: readonly number[]): number[] {
  return sorted.filter((k) => colOf(k) >= r.from.col && colOf(k) <= r.to.col && rowOf(k) >= r.from.row && rowOf(k) <= r.to.row);
}

const area = (r: Rect) => (r.to.col - r.from.col + 1) * (r.to.row - r.from.row + 1);

/**
 * One node per formula cell, an edge to each formula cell a reference or range reaches, edges in
 * ascending key order. A range of area A over F formula cells is enumerated when A <= F, and
 * otherwise each formula cell is tested against it, so a sparse full-grid range costs F.
 */
export function buildGraph(formulas: ReadonlyMap<number, Precedents>): Map<number, number[]> {
  const sorted = [...formulas.keys()].sort((a, b) => a - b);
  const graph = new Map<number, number[]>();
  for (const [key, p] of formulas) {
    const edges = new Set<number>();
    for (const r of p.refs) if (formulas.has(cellKey(r.col, r.row))) edges.add(cellKey(r.col, r.row));
    for (const r of p.ranges) {
      for (const k of area(r) <= sorted.length ? enumerateRange(r, (k) => formulas.has(k)) : filterRange(r, sorted)) edges.add(k);
    }
    graph.set(key, [...edges].sort((a, b) => a - b));
  }
  return graph;
}

export type Component = { members: number[]; cycle: boolean };

/**
 * Iterative Tarjan over `graph` (S26). Roots in ascending key order, edges in the ascending order
 * buildGraph gives. A component is emitted only after every component it points to, so the list is
 * a natural order that depends on addresses only. Members are sorted (row-major).
 */
export function naturalOrder(graph: ReadonlyMap<number, readonly number[]>): Component[] {
  const index = new Map<number, number>();
  const low = new Map<number, number>();
  const onStack = new Set<number>();
  const stack: number[] = [];
  const out: Component[] = [];
  const visit = (node: number) => {
    index.set(node, index.size);
    low.set(node, index.get(node)!);
    stack.push(node);
    onStack.add(node);
  };
  for (const root of [...graph.keys()].sort((a, b) => a - b)) {
    if (index.has(root)) continue;
    visit(root);
    const frames = [{ node: root, next: 0 }];
    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      const edges = graph.get(frame.node) ?? [];
      if (frame.next < edges.length) {
        const w = edges[frame.next++]!;
        if (!index.has(w)) {
          visit(w);
          frames.push({ node: w, next: 0 });
        } else if (onStack.has(w)) low.set(frame.node, Math.min(low.get(frame.node)!, index.get(w)!));
        continue;
      }
      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
      if (low.get(frame.node) !== index.get(frame.node)) continue;
      const members: number[] = [];
      for (let w = stack.pop()!; ; w = stack.pop()!) {
        onStack.delete(w);
        members.push(w);
        if (w === frame.node) break;
      }
      // Two or more members, or one cell with an edge to itself, is a circular reference.
      out.push({ members: members.sort((a, b) => a - b), cycle: members.length > 1 || edges.includes(frame.node) });
    }
  }
  return out;
}

/** Every reference and range in the AST, in every branch (requirement 30); no repeats, row-major. */
export function precedents(ast: Expr): Precedents {
  const refs = new Map<number, Corner>();
  const ranges = new Map<string, Rect>();
  const stack: Expr[] = [ast];
  for (let e = stack.pop(); e; e = stack.pop()) {
    if (e.type === "ref") refs.set(cellKey(e.ref.col, e.ref.row), { col: e.ref.col, row: e.ref.row });
    else if (e.type === "range") {
      const r = corners(e);
      const rect = { from: { col: r.from.col, row: r.from.row }, to: { col: r.to.col, row: r.to.row } };
      ranges.set(`${cellKey(rect.from.col, rect.from.row)}:${cellKey(rect.to.col, rect.to.row)}`, rect);
    } else if (e.type === "unary") stack.push(e.arg);
    else if (e.type === "binary") stack.push(e.left, e.right);
    else if (e.type === "paren") stack.push(e.inner);
    else if (e.type === "call") stack.push(...e.args);
  }
  return {
    refs: [...refs.values()].sort(byKey),
    ranges: [...ranges.values()].sort((a, b) => byKey(a.from, b.from) || byKey(a.to, b.to)),
  };
}
