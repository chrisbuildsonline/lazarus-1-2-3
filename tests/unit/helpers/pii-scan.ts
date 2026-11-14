// Byte-level PII scanner for fixture files. Bytes are decoded as latin1 so every
// byte maps to one char and binary data cannot break the decode.

export type PiiKind = "email" | "phone" | "ssn" | "card";
export type PiiHit = { kind: PiiKind; text: string };
/** A reviewed false positive: the file it occurs in, the exact matched text, and why it is not PII. */
export type AllowEntry = { path: string; text: string; reason: string };

const PATTERNS: { kind: PiiKind; re: RegExp }[] = [
  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  {
    kind: "phone",
    re: /(?<!\d)(?:\(\d{3}\) ?\d{3}-\d{4}|\d{3}[-.]\d{3}[-.]\d{4})(?!\d)|\+\d(?:[ -]?\d){8,14}(?!\d)/g,
  },
  { kind: "ssn", re: /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g },
  { kind: "card", re: /(?<!\d[ -]?)(?:\d{13,19}|\d{4}(?:[ -]\d{4}){2,3}(?:[ -]\d{1,3})?)(?![\d])/g },
];

export function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length > 0 && sum % 10 === 0;
}

export function scanBytes(bytes: Uint8Array): PiiHit[] {
  const text = new TextDecoder("latin1").decode(bytes);
  const hits: PiiHit[] = [];
  for (const { kind, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (kind === "card") {
        const digits = m[0].replace(/[ -]/g, "");
        if (digits.length < 13 || digits.length > 19 || !luhn(digits)) continue;
      }
      hits.push({ kind, text: m[0] });
    }
  }
  return hits;
}
