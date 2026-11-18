// 10-byte x87 extended precision to the nearest double (ties to even), with BigInt so the
// result does not depend on the runtime's float arithmetic. Layout (evidence.md, two sources):
// bytes 0-7 significand u64 with explicit integer bit, bytes 8-9 sign bit and 15-bit exponent
// (bias 16383); value = significand x 2^(exponent - 16383 - 63).

const LSB_BIAS = 16383 + 63;

export function float80ToDouble(bytes: Uint8Array, offset = 0): { value: number; exact: boolean } {
  let sig = 0n;
  for (let i = 7; i >= 0; i--) sig = (sig << 8n) | BigInt(bytes[offset + i] ?? 0);
  const signExp = (bytes[offset + 8] ?? 0) | ((bytes[offset + 9] ?? 0) << 8);
  const negative = (signExp & 0x8000) !== 0;
  const exp = signExp & 0x7fff;
  const signed = (v: number) => (negative ? -v : v);

  if (exp === 0x7fff) {
    const fraction = sig & ((1n << 63n) - 1n);
    return { value: fraction === 0n ? signed(Infinity) : NaN, exact: true };
  }
  if (sig === 0n) return { value: signed(0), exact: true };

  let e2 = exp - LSB_BIAS; // exponent of the significand's lowest bit
  const length = sig.toString(2).length;
  // Keep 53 bits, or fewer where the result is subnormal (lowest bit at 2^-1074).
  const drop = Math.max(length - 53, -1074 - e2);
  let exact = true;
  if (drop > 0) {
    const shift = BigInt(drop);
    const rest = sig & ((1n << shift) - 1n);
    const half = 1n << (shift - 1n);
    sig >>= shift;
    if (rest > half || (rest === half && (sig & 1n) === 1n)) sig += 1n;
    exact = rest === 0n;
    e2 += drop;
  }
  if (sig === 0n) return { value: signed(0), exact: false };
  if (e2 + sig.toString(2).length - 1 > 1023) return { value: signed(Infinity), exact: false };
  // sig <= 2^53 and -1074 <= e2 <= 1023, so 2^e2 is a representable power of two and the product is exact.
  return { value: signed(Number(sig) * 2 ** e2), exact };
}
