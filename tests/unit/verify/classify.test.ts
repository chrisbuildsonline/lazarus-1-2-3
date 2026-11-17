import { describe, expect, it } from "vitest";
import { classify, classifySheet, type CellResult } from "../../../src/verify/classify.ts";
import { bin, buildSheet, call, n, ref, type Spec } from "../helpers/build-sheet.ts";
import { err, labelZero, na, num, str, valueFromDouble, volatileFunction, type Outcome, type Value } from "../../../src/verify/value.ts";

const ok = (v: Value): Outcome<Value> => ({ ok: true, v });

describe("classify (requirements 15 to 17, 22 to 25, 27, 28)", () => {
  it("num against num, identical: matched, exact", () => {
    expect(classify(num(7), ok(num(7)))).toMatchObject({ status: "matched", reason: { code: "exact" } });
    expect(classify(num(0), ok(num(-0)))).toMatchObject({ status: "matched", reason: { code: "exact" } });
  });

  it("num against num inside the tolerance: within-tolerance, with the relative difference", () => {
    // 0.1 + 0.2 is 0.30000000000000004, relative difference about 1.9e-16.
    const r = classify(num(0.3), ok(num(0.1 + 0.2)));
    expect(r).toMatchObject({ status: "matched", reason: { code: "within-tolerance" } });
    expect(r.reason.message).toContain("relative difference 1.85e-16");
  });

  it("num against num outside the tolerance: mismatched, value-differs", () => {
    expect(classify(num(1), ok(num(1.0001)))).toMatchObject({ status: "mismatched", reason: { code: "value-differs" } });
  });

  it("err against err and na against na: matched, exact", () => {
    expect(classify(err(), ok(err()))).toMatchObject({ status: "matched", reason: { code: "exact" } });
    expect(classify(na(), ok(na()))).toMatchObject({ status: "matched", reason: { code: "exact" } });
  });

  it("err against a number and na against err: mismatched", () => {
    expect(classify(num(1), ok(err()))).toMatchObject({ status: "mismatched", reason: { code: "value-differs" } });
    expect(classify(err(), ok(num(1)))).toMatchObject({ status: "mismatched", reason: { code: "value-differs" } });
    expect(classify(err(), ok(na()))).toMatchObject({ status: "mismatched", reason: { code: "value-differs" } });
  });

  it("S27: a cached +Infinity reads as ERR and matches a recalculated ERR", () => {
    expect(classify(valueFromDouble(Infinity), ok(err()))).toMatchObject({ status: "matched", reason: { code: "exact" } });
    expect(classify(valueFromDouble(-Infinity), ok(na()))).toMatchObject({ status: "matched", reason: { code: "exact" } });
  });

  it("a string result is string-result", () => {
    expect(classify(num(0), ok(str("Odd")))).toMatchObject({ status: "unverifiable", reason: { code: "string-result" } });
  });

  it("U02: a number with the label flag is undocumented-semantics U02", () => {
    expect(classify(num(0), ok(labelZero()))).toMatchObject({ status: "unverifiable", reason: { code: "undocumented-semantics", rule: "U02" } });
  });

  it("a cached NaN is cached-not-a-number", () => {
    expect(classify(null, ok(num(3)))).toMatchObject({ status: "unverifiable", reason: { code: "cached-not-a-number" } });
  });

  it("an unverifiable outcome keeps its reason, whatever the cached value", () => {
    const u = volatileFunction("NOW");
    expect(classify(null, { ok: false, u })).toEqual({ status: "unverifiable", reason: u });
    expect(classify(num(1), { ok: false, u })).toEqual({ status: "unverifiable", reason: u });
  });
});

const only = (rpn: number[], cached = 0): CellResult => classifySheet(buildSheet({ A1: { rpn, cached } }))[0]!;

describe("decode failures (requirements 66 to 69)", () => {
  it("an unknown opcode is unknown-opcode with 0x%02X and the offset, and no recalculated value", () => {
    // NUM 1.0 (opcode 0x00 and 8 bytes), then 0xFF at offset 9.
    const r = only([0x00, 0, 0, 0, 0, 0, 0, 0xf0, 0x3f, 0xff, 0x03]);
    expect(r).toMatchObject({ status: "unverifiable", recalculated: null, reason: { code: "unknown-opcode" } });
    expect(r.reason.message).toContain("opcode 0xFF at offset 9");
  });

  it("each other decoder error is decode-error with the decoder's code", () => {
    const cases: [number[], string][] = [
      [[0x00, 0, 0], "truncated-stream"],
      [[0x09, 0x03], "stack-underflow"],
      // REF one column left of A1: column word 0xBFFF (relative -1), row word 0x8000 (relative 0).
      [[0x01, 0xff, 0xbf, 0x00, 0x80, 0x03], "reference-out-of-grid"],
    ];
    for (const [rpn, code] of cases) {
      const r = only(rpn);
      expect(r, code).toMatchObject({ status: "unverifiable", recalculated: null, reason: { code: "decode-error" } });
      expect(r.reason.message, code).toContain(code);
    }
  });

  it("a stream with unconfirmed-opcode warnings is evaluated and lists them sorted, without repeats", () => {
    // (1 - 2) - -3 = 2 uses sub (0x0A, candidate) twice and neg (0x08, candidate).
    const f = bin("sub", bin("sub", n(1), n(2)), { type: "unary", op: "neg", arg: n(3) });
    const r = classifySheet(buildSheet({ A1: { f, cached: 2 } }))[0]!;
    expect(r).toMatchObject({ status: "matched", recalculated: num(2), candidateOpcodes: [0x08, 0x0a] });
  });

  it("a stream of confirmed opcodes has an empty candidate list", () => {
    expect(classifySheet(buildSheet({ A1: { f: bin("add", n(1), n(2)), cached: 3 } }))[0]).toMatchObject({ status: "matched", candidateOpcodes: [] });
  });

  it("a cached NaN is cached-not-a-number and still shows the recalculated value", () => {
    const r = classifySheet(buildSheet({ A1: { f: bin("add", n(1), n(2)), cached: Number.NaN } }))[0]!;
    expect(r).toMatchObject({ status: "unverifiable", cached: null, recalculated: num(3), reason: { code: "cached-not-a-number" } });
  });
});

describe("formula and inputs (requirements 14, 35, 66)", () => {
  const byAddress = (specs: Record<string, Spec>) => new Map(classifySheet(buildSheet(specs)).map((r) => [r.address, r]));

  it("a mismatched result carries the Excel text and its direct precedents", () => {
    // A2 = A1 + 1 = 2, but the file stores 99.
    const r = byAddress({ A1: 1, A2: { f: bin("add", ref("A1"), n(1)), cached: 99 } }).get("A2")!;
    expect(r.status).toBe("mismatched");
    expect(r.formula).toBe("$A$1+1");
    expect(r.inputs).toEqual([{ address: "A1", kind: "number", value: num(1), cached: num(1) }]);
    expect(r.inputsOmitted).toBeUndefined();
  });

  it("formula is null when the translation fails", () => {
    // @ERR has no Excel form; it recalculates to ERR against a stored 0.
    const r = byAddress({ A1: { f: call("ERR"), cached: 0 } }).get("A1")!;
    expect(r).toMatchObject({ status: "mismatched", formula: null, recalculated: err() });
  });

  it("inputs lists the first 20 direct precedents and counts the rest", () => {
    const specs: Record<string, Spec> = {};
    for (let i = 1; i <= 25; i++) specs[`A${i}`] = i;
    specs["B1"] = { f: call("SUM", ...Array.from({ length: 25 }, (_, i) => ref(`A${25 - i}`))), cached: 0 };
    const r = byAddress(specs).get("B1")!;
    expect(r.status).toBe("mismatched");
    expect(r.inputs?.map((x) => x.address)).toEqual(Array.from({ length: 20 }, (_, i) => `A${i + 1}`));
    expect(r.inputsOmitted).toBe(5);
  });

  it("a dependent of a mismatched cell uses the recalculated value and shows the cached one", () => {
    // A2 recalculates to 2 (stored 5); A3 = A2 * 10 recalculates to 20 (stored 50).
    const m = byAddress({ A1: 1, A2: { f: bin("add", ref("A1"), n(1)), cached: 5 }, A3: { f: bin("mul", ref("A2"), n(10)), cached: 50 } });
    expect(m.get("A3")).toMatchObject({ status: "mismatched", recalculated: num(20) });
    expect(m.get("A3")!.inputs).toEqual([{ address: "A2", kind: "formula", value: num(2), cached: num(5) }]);
  });

  it("inputs name labels and empty cells by kind", () => {
    const r = byAddress({ A1: "x", B1: { f: bin("add", ref("A1"), ref("C1")), cached: 1 } }).get("B1")!;
    expect(r.inputs).toEqual([
      { address: "A1", kind: "label", value: null, cached: null },
      { address: "C1", kind: "empty", value: null, cached: null },
    ]);
  });

  it("an unverifiable cell carries formula but no inputs, a matched one no inputs", () => {
    const m = byAddress({ A1: { f: bin("add", ref("A1"), n(1)), cached: 1 }, B1: { f: n(2), cached: 2 } });
    expect(m.get("A1")).toMatchObject({ status: "unverifiable", formula: "$A$1+1" });
    expect(m.get("A1")!.inputs).toBeUndefined();
    expect(m.get("B1")!.inputs).toBeUndefined();
  });
});
