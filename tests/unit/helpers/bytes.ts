// Small byte builders for parser tests. Valid records come from scripts/lib/wk1-writer.ts;
// these are for joining them and for hand-cut records the writer will not produce.

export function concat(...parts: (Uint8Array | readonly number[])[]): Uint8Array {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrays.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of arrays) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** opcode u16 LE, length u16 LE (the body's length unless given), body. */
export function rawRecord(opcode: number, body: readonly number[], length = body.length): Uint8Array {
  return concat([opcode & 0xff, opcode >> 8, length & 0xff, length >> 8], body);
}
