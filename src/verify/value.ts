// Values the engine computes with, and how a stored double reads as one (rule S27).

export type Value =
  | { t: "num"; v: number; label?: true } // label: the number 0 came straight from a label cell (rule U02)
  | { t: "str"; v: string }
  | { t: "err" }
  | { t: "na" };

/** A value, or an empty cell read through a single reference. How it converts depends on where it is used. */
export type Operand = Value | { t: "empty" };

export const num = (v: number): Value => ({ t: "num", v });
/** A label cell read as a value: the number 0, flagged so a bare label result becomes U02. */
export const labelZero = (): Value => ({ t: "num", v: 0, label: true });
export const empty = (): Operand => ({ t: "empty" });
export const str = (v: string): Value => ({ t: "str", v });
export const err = (): Value => ({ t: "err" });
export const na = (): Value => ({ t: "na" });

/** S27: +Infinity is ERR, -Infinity is NA, NaN is a special pattern and not a number (null). */
export function valueFromDouble(d: number): Value | null {
  if (Number.isNaN(d)) return null;
  if (d === Infinity) return err();
  if (d === -Infinity) return na();
  return num(d);
}

/** The closed set of reason codes (requirement 17): matched, mismatched, then unverifiable. */
export const REASON_CODES = [
  "exact",
  "within-tolerance",
  "value-differs",
  "unknown-opcode",
  "decode-error",
  "unsupported-function",
  "volatile-function",
  "circular-reference",
  "depends-on-unverifiable",
  "string-result",
  "cached-not-a-number",
  "undocumented-semantics",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];
export type UnverifiableCode = Exclude<ReasonCode, "exact" | "within-tolerance" | "value-differs">;
export type Reason = { code: ReasonCode; rule?: string; message: string };
export type Unverifiable = { code: UnverifiableCode; rule?: string; message: string };
export type Outcome<T> = { ok: true; v: T } | { ok: false; u: Unverifiable };

// Messages are for estate executors and archivists: plain words first, technical detail in brackets.

export function unverifiable(code: UnverifiableCode, rule: string | undefined, message: string): Unverifiable {
  return rule === undefined ? { code, message } : { code, rule, message };
}

const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;

export const unknownOpcode = (opcode: number, offset: number): Unverifiable =>
  unverifiable("unknown-opcode", undefined, `This formula contains a code this program does not recognise yet, so it cannot be recalculated (opcode ${hex(opcode)} at offset ${offset}).`);

export const decodeError = (decoderCode: string, decoderMessage: string): Unverifiable =>
  unverifiable("decode-error", undefined, `The stored formula could not be read back in full, so it cannot be recalculated (${decoderCode}: ${decoderMessage}).`);

export const unsupportedFunction = (name: string): Unverifiable =>
  unverifiable("unsupported-function", undefined, `This formula uses @${name}, which this program cannot recalculate yet, so it cannot be checked against the stored number.`);

export const volatileFunction = (name: string): Unverifiable =>
  unverifiable("volatile-function", "S25", `This formula uses @${name}, which gives a different answer every time it is calculated. It cannot be checked against the stored number.`);

const MAX_LISTED = 8;

export function circularReference(addresses: readonly string[]): Unverifiable {
  const shown = addresses.slice(0, MAX_LISTED).join(", ");
  const more = addresses.length > MAX_LISTED ? ` and ${addresses.length - MAX_LISTED} more` : "";
  const cells = addresses.length === 1 ? "a cell that refers to itself" : `${addresses.length} cells that refer to each other`;
  return unverifiable("circular-reference", "S26", `This formula is part of a circular reference, ${cells} (${shown}${more}). 1-2-3 flags these itself, and there is no settled value to check.`);
}

export const dependsOnUnverifiable = (address: string, cause: Unverifiable): Unverifiable =>
  unverifiable("depends-on-unverifiable", undefined, `This formula needs the value of ${address}, which could not be checked, so this one cannot be checked either (${address}: ${cause.code}${cause.rule ? ` ${cause.rule}` : ""}).`);

export const stringResult = (): Unverifiable =>
  unverifiable("string-result", undefined, "This formula gives text. The text 1-2-3 stored for it is not read yet, so the two cannot be compared.");

export const cachedNotANumber = (): Unverifiable =>
  unverifiable("cached-not-a-number", undefined, "The value stored for this formula is a special marker, not a number, so there is nothing to compare the recalculated value with.");

export const undocumented = (rule: string, what: string): Unverifiable =>
  unverifiable("undocumented-semantics", rule, `The 1-2-3 documentation does not say what ${what} gives, so this formula cannot be checked (rule ${rule}).`);

/** For a pair the caller has found equal within the tolerance. */
export function matchedReason(cached: number, recalculated: number): Reason {
  if (cached === recalculated) return { code: "exact", message: "The recalculated value equals the stored value exactly." };
  const relative = Math.abs(cached - recalculated) / Math.max(Math.abs(cached), Math.abs(recalculated));
  return {
    code: "within-tolerance",
    message: `The recalculated value ${recalculated} matches the stored value ${cached} within the tolerance (relative difference ${relative.toExponential(2)}).`,
  };
}

const show = (v: Value): string => (v.t === "num" ? String(v.v) : v.t === "str" ? `"${v.v}"` : v.t === "err" ? "ERR" : "NA");

export const mismatchedReason = (cached: Value, recalculated: Value): Reason => ({
  code: "value-differs",
  message: `Recalculating this formula gives ${show(recalculated)}, but the file stores ${show(cached)}.`,
});
