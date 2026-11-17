// Independent evaluator for the opcodes the synthetic specs use, with the Lotus definitions of
// each function (zero-based CHOOSE and lookup offsets, truncating @INT, @PMT(principal, rate,
// term), @PV and @FV(payment, rate, term)). Relative references set bit 15 and store a signed
// offset in the low 14 bits. A range is its values row by row plus its width.
// It imports nothing from src/verify or src/formula, so it stays independent of the engine.
type Value = { v: number[]; cols: number };
export const FIXED: Record<number, [number, (...a: number[]) => number]> = {
  0x21: [1, Math.abs],
  0x22: [1, Math.trunc],
  0x23: [1, Math.sqrt],
  0x26: [0, () => Math.PI],
  0x34: [0, () => 1],
  0x36: [3, (y, m, d) => (Date.UTC(1900 + y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000],
  0x38: [3, (p, r, n) => (p * r) / (1 - (1 + r) ** -n)],
  0x39: [3, (pmt, r, n) => (pmt * (1 - (1 + r) ** -n)) / r],
  0x3a: [3, (pmt, r, n) => (pmt * ((1 + r) ** n - 1)) / r],
  0x3f: [2, (x, d) => Math.round(x * 10 ** d) / 10 ** d],
};
export const VARIABLE: Record<number, (all: number[]) => number> = {
  0x50: (a) => a.reduce((s, v) => s + v, 0),
  0x51: (a) => a.reduce((s, v) => s + v, 0) / a.length,
  0x53: (a) => Math.min(...a),
  0x54: (a) => Math.max(...a),
};

export function evalRpn(rpn: Uint8Array, col: number, row: number, valueAt: (col: number, row: number) => number): number {
  const view = new DataView(rpn.buffer, rpn.byteOffset, rpn.byteLength);
  const coord = (here: number, w: number) => (w & 0x8000 ? here + ((w << 18) >> 18) : w & 0x3fff);
  const word = (p: number) => view.getUint16(p, true);
  const stack: Value[] = [];
  const pop = () => stack.pop() ?? { v: [], cols: 0 };
  const num = () => pop().v[0] ?? NaN;
  const push = (x: number) => stack.push({ v: [x], cols: 1 });
  for (let p = 0; p < rpn.length; ) {
    const op = rpn[p++]!;
    if (op === 0x00) (push(view.getFloat64(p, true)), (p += 8));
    else if (op === 0x01) (push(valueAt(coord(col, word(p)), coord(row, word(p + 2)))), (p += 4));
    else if (op === 0x02) {
      const [c1, r1, c2, r2] = [coord(col, word(p)), coord(row, word(p + 2)), coord(col, word(p + 4)), coord(row, word(p + 6))];
      const v = [];
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) v.push(valueAt(c, r));
      stack.push({ v, cols: c2 - c1 + 1 });
      p += 8;
    } else if (op === 0x03) return num();
    else if (op === 0x05) (push(view.getInt16(p, true)), (p += 2));
    else if (op === 0x09 || op === 0x0b) {
      const b = num();
      const a = num();
      push(op === 0x09 ? a + b : a * b);
    } else if (FIXED[op]) {
      const [n, f] = FIXED[op];
      push(f(...Array.from({ length: n }, num).reverse()));
    } else if (VARIABLE[op]) {
      push(VARIABLE[op](Array.from({ length: rpn[p++] ?? 0 }, pop).flatMap((x) => x.v)));
    } else if (op === 0x30) {
      const args = Array.from({ length: rpn[p++] ?? 0 }, num).reverse();
      push(args[1 + args[0]!] ?? NaN);
    } else if (op === 0x56) {
      const flows = pop().v;
      const rate = num();
      push(flows.reduce((s, v, i) => s + v / (1 + rate) ** (i + 1), 0));
    } else if (op === 0x55 || op === 0x5a) {
      const offset = num();
      const { v, cols } = pop();
      const key = num();
      const rows = v.length / cols;
      const at = (i: number, k: number) => (op === 0x55 ? v[i * cols + k] : v[k * cols + i])!;
      let hit = -1;
      for (let i = 0; i < (op === 0x55 ? rows : cols); i++) if (at(i, 0) <= key) hit = i;
      push(hit < 0 ? NaN : at(hit, offset));
    } else if (op !== 0x04) throw new Error(`unexpected opcode ${op}`);
  }
  throw new Error("no return token");
}
