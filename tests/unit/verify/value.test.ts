import { describe, expect, it } from "vitest";
import {
  REASON_CODES,
  circularReference,
  cachedNotANumber,
  decodeError,
  dependsOnUnverifiable,
  err,
  matchedReason,
  mismatchedReason,
  na,
  num,
  str,
  stringResult,
  undocumented,
  unknownOpcode,
  unsupportedFunction,
  unverifiable,
  valueFromDouble,
  volatileFunction,
  wk3FormulaNotDecoded,
  type Unverifiable,
  type UnverifiableCode,
} from "../../../src/verify/value.ts";

// S27 (WSFF2 NUMBER record): sign 0, exponent 7FF, fraction 0 (+Infinity) is ERR; sign 1 (-Infinity)
// is NA; any other 7FF pattern (NaN) is special and not a number.

describe("valueFromDouble", () => {
  it("S27: +Infinity reads as ERR", () => {
    expect(valueFromDouble(Infinity)).toEqual({ t: "err" });
  });

  it("S27: -Infinity reads as NA", () => {
    expect(valueFromDouble(-Infinity)).toEqual({ t: "na" });
  });

  it("S27: NaN reads as null", () => {
    expect(valueFromDouble(NaN)).toBeNull();
  });

  it("S27: finite doubles read as numbers, -0 kept as -0", () => {
    for (const d of [0, 1.5, -2.25, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE]) {
      expect(valueFromDouble(d), String(d)).toEqual({ t: "num", v: d });
    }
    const z = valueFromDouble(-0);
    expect(z?.t).toBe("num");
    expect(z?.t === "num" && Object.is(z.v, -0)).toBe(true);
  });
});

describe("constructors", () => {
  it("build plain values", () => {
    expect(num(3)).toEqual({ t: "num", v: 3 });
    expect(err()).toEqual({ t: "err" });
    expect(na()).toEqual({ t: "na" });
    expect(str("Odd")).toEqual({ t: "str", v: "Odd" });
  });

  it("give a new object each time, so no caller can change a shared one", () => {
    expect(err()).not.toBe(err());
    expect(na()).not.toBe(na());
  });
});

describe("reason codes", () => {
  it("are the closed set of requirement 17, no more and no fewer", () => {
    expect([...REASON_CODES]).toEqual([
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
      "wk3-formula-not-decoded",
    ]);
  });

  // One sample per unverifiable code. The key type makes the compiler demand an entry for any new code.
  const samples: Record<UnverifiableCode, Unverifiable> = {
    "unknown-opcode": unknownOpcode(0x7a, 12),
    "decode-error": decodeError("truncated-stream", "formula ends without a return token (at offset 4)"),
    "unsupported-function": unsupportedFunction("IRR"),
    "volatile-function": volatileFunction("NOW"),
    "circular-reference": circularReference(["A1", "B1"]),
    "depends-on-unverifiable": dependsOnUnverifiable("C3", volatileFunction("RAND")),
    "string-result": stringResult(),
    "cached-not-a-number": cachedNotANumber(),
    "undocumented-semantics": undocumented("U04", "0 raised to the power 0"),
    "wk3-formula-not-decoded": wk3FormulaNotDecoded(),
  };

  it("each unverifiable code has a sample, so a new code fails until it gets one", () => {
    expect(Object.keys(samples).sort()).toEqual(REASON_CODES.filter((c) => !["exact", "within-tolerance", "value-differs"].includes(c)).sort());
  });

  for (const [code, u] of Object.entries(samples)) {
    it(`${code}: the helper sets the code and writes a plain, complete message`, () => {
      expect(u.code).toBe(code);
      expect(u.message.length).toBeGreaterThan(20);
      expect(u.message).not.toMatch(/undefined|null|NaN|\[object/);
    });
  }

  it("unknown-opcode names the opcode as 0x%02X and the offset in decimal", () => {
    expect(unknownOpcode(0x7a, 12).message).toContain("opcode 0x7A at offset 12");
    expect(unknownOpcode(0x05, 3).message).toContain("opcode 0x05 at offset 3");
  });

  it("decode-error carries the decoder's code and message", () => {
    const u = decodeError("stack-underflow", "token needs 2 operands, the stack holds 1 (opcode 0x09 at offset 3)");
    expect(u.message).toContain("stack-underflow");
    expect(u.message).toContain("opcode 0x09 at offset 3");
  });

  it("volatile-function and unsupported-function name the function with its @", () => {
    expect(volatileFunction("NOW").message).toContain("@NOW");
    expect(unsupportedFunction("IRR").message).toContain("@IRR");
  });

  it("circular-reference names up to 8 cells, then a count", () => {
    expect(circularReference(["A1"]).message).toContain("A1");
    const ten = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"];
    const m = circularReference(ten).message;
    expect(m).toContain("A1, A2, A3, A4, A5, A6, A7, A8 and 2 more");
    expect(m).toContain("10 cells");
    expect(m).not.toContain("A9");
  });

  it("depends-on-unverifiable names the precedent and its reason", () => {
    const u = dependsOnUnverifiable("C3", circularReference(["C3", "C4"]));
    expect(u.message).toContain("C3");
    expect(u.message).toContain("circular-reference");
  });

  it("undocumented-semantics carries the rule id", () => {
    const u = undocumented("U08", "a calculation with both ERR and NA in it");
    expect(u.rule).toBe("U08");
    expect(u.message).toContain("U08");
  });

  it("unverifiable builds the object from its parts, leaving out a missing rule", () => {
    expect(unverifiable("string-result", undefined, "text")).toEqual({ code: "string-result", message: "text" });
    expect(unverifiable("undocumented-semantics", "U03", "half")).toEqual({ code: "undocumented-semantics", rule: "U03", message: "half" });
  });
});

describe("matched and mismatched reasons", () => {
  it("identical doubles are exact, -0 against 0 too", () => {
    expect(matchedReason(0.75, 0.75).code).toBe("exact");
    expect(matchedReason(-0, 0).code).toBe("exact");
  });

  it("a difference inside the tolerance is within-tolerance and states the relative difference", () => {
    // |1 - 1.0000000000002| / 1.0000000000002 is about 2.0e-13.
    const r = matchedReason(1, 1.0000000000002);
    expect(r.code).toBe("within-tolerance");
    expect(r.message).toMatch(/2\.0\d*e-13/);
  });

  it("a mismatch shows both values in words", () => {
    const r = mismatchedReason(num(10), num(12));
    expect(r.code).toBe("value-differs");
    expect(r.message).toContain("10");
    expect(r.message).toContain("12");
    expect(mismatchedReason(err(), num(1)).message).toContain("ERR");
    expect(mismatchedReason(num(1), na()).message).toContain("NA");
  });
});
