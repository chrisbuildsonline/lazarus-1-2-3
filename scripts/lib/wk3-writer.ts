// Encoders for the WK3 records of the synthetic fixtures and tests. Layouts from
// .kiro/steering/lotus-format.md (WK3): opcode u16, length u16, body; address row u16, sheet u8, col u8.
// Independent of src/parser.

export const WK3_VERSION = 0x1000;

export function record(opcode: number, body: readonly number[] | Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + body.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, opcode, true);
  view.setUint16(2, body.length, true);
  out.set(body, 4);
  return out;
}

const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const address = (sheet: number, col: number, row: number) => [...u16(row), sheet & 0xff, col & 0xff];
const latin1 = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** BOF: version word, sub-version 0x0004, then 22 zero bytes (26 in all). */
export function bof(version = WK3_VERSION): Uint8Array {
  return record(0x0000, [...u16(version), ...u16(0x0004), ...new Array<number>(22).fill(0)]);
}

export function eof(): Uint8Array {
  return record(0x0001, []);
}

/** A double as 10-byte extended precision (exact: every double fits). */
export function encode80(d: number): Uint8Array {
  const out = new Uint8Array(10);
  const bits = new DataView(new Float64Array([d]).buffer).getBigUint64(0, true);
  const negative = bits >> 63n === 1n;
  const e = Number((bits >> 52n) & 0x7ffn);
  const m = bits & ((1n << 52n) - 1n);
  let sig: bigint;
  let exp: number;
  if (e === 0x7ff) {
    exp = 0x7fff;
    sig = (1n << 63n) | (m === 0n ? 0n : 1n << 62n);
  } else if (e === 0 && m === 0n) {
    exp = 0;
    sig = 0n;
  } else if (e === 0) {
    const length = m.toString(2).length;
    sig = m << BigInt(64 - length);
    exp = -1074 + length - 1 + 16383;
  } else {
    sig = ((1n << 52n) | m) << 11n;
    exp = e - 1023 + 16383;
  }
  return raw80(sig, (negative ? 0x8000 : 0) | exp, out);
}

/** 10 bytes from a raw significand and sign+exponent word, for values a double cannot hold. */
export function raw80(sig: bigint, signExp: number, out = new Uint8Array(10)): Uint8Array {
  for (let i = 0; i < 8; i++) out[i] = Number((sig >> BigInt(8 * i)) & 0xffn);
  out[8] = signExp & 0xff;
  out[9] = (signExp >> 8) & 0xff;
  return out;
}

export function label(sheet: number, col: number, row: number, prefix: string, text: string): Uint8Array {
  return record(0x0016, [...address(sheet, col, row), ...latin1(prefix), ...latin1(text), 0]);
}

/** NUMBER: a double (encoded exactly) or 10 raw bytes. */
export function number80(sheet: number, col: number, row: number, value: number | Uint8Array): Uint8Array {
  return record(0x0017, [...address(sheet, col, row), ...(typeof value === "number" ? encode80(value) : value)]);
}

/** SMALLNUM with the raw packed word. */
export function small(sheet: number, col: number, row: number, word: number): Uint8Array {
  return record(0x0018, [...address(sheet, col, row), ...u16(word & 0xffff)]);
}

/** Packed word for an integer from -16384 to 16383 (bit 0 clear). */
export const smallInt = (n: number) => (n << 1) & 0xffff;

export function formula80(sheet: number, col: number, row: number, cached: number | Uint8Array, rpn: readonly number[]): Uint8Array {
  return record(0x0019, [...address(sheet, col, row), ...(typeof cached === "number" ? encode80(cached) : cached), ...rpn]);
}

/** Record 0x1B subtype 14000: sheet u16, name, NUL. */
export function sheetName(sheet: number, name: string): Uint8Array {
  return record(0x001b, [...u16(14000), ...u16(sheet), ...latin1(name), 0]);
}

export function writeWk3(records: readonly Uint8Array[], version = WK3_VERSION): Uint8Array {
  const parts = [bof(version), ...records, eof()];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
