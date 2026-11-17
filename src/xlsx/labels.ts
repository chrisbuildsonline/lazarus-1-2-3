// Label alignment, XML-safe text and the stored value of a cached Lotus double
// (requirements 8, 10, 12, 17).
import type { Value } from "../verify/index.ts";

export type Alignment = "left" | "right" | "center" | "fill";

export type PlannedValue =
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "error"; code: "#VALUE!" | "#N/A" }
  | { kind: "none" };

/** Lotus ERR has no stated cause; #VALUE! is the closest Excel error that claims none. */
export const ERR_CODE = "#VALUE!";

const ALIGN: Record<string, Alignment> = { "'": "left", '"': "right", "^": "center", "\\": "fill" };

export function alignmentFor(prefix: string): { alignment: Alignment | null; note: string | null } {
  if (prefix === "") return { alignment: null, note: null };
  const alignment = ALIGN[prefix];
  if (alignment) return { alignment, note: null };
  const kind = prefix === "|" ? "is the Lotus non-printing prefix" : "is not a Lotus prefix";
  return { alignment: null, note: `Label prefix ${prefix} ${kind}; no alignment was set.` };
}

const xmlAllowed = (c: number) =>
  c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || (c >= 0x10000 && c <= 0x10ffff);

/** Replaces every code point XML 1.0 cannot carry (lone surrogates included) with U+FFFD. */
export function sanitizeXmlText(text: string): { text: string; replaced: number } {
  let replaced = 0;
  let out = "";
  for (const ch of text) {
    if (xmlAllowed(ch.codePointAt(0)!)) out += ch;
    else {
      out += "�";
      replaced++;
    }
  }
  return { text: replaced === 0 ? text : out, replaced };
}

export function storedValue(cached: Value | null): PlannedValue {
  if (cached === null || cached.t === "str") return { kind: "none" };
  if (cached.t === "num") return { kind: "number", value: cached.v };
  return { kind: "error", code: cached.t === "err" ? ERR_CODE : "#N/A" };
}
