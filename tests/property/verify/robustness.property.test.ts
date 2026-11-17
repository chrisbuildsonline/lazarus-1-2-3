// verifyBytes and verifySheet never throw and always give a well-formed result (requirement 4):
// arbitrary bytes, mutated wk1/wks fixtures, and formulas built from random token streams.
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { OPCODES } from "../../../src/formula/index.ts";
import { verifyBytes, verifySheet, type SheetVerification } from "../../../src/verify/index.ts";
import { REASON_CODES } from "../../../src/verify/value.ts";
import { buildSheet, type Spec } from "../../unit/helpers/build-sheet.ts";

const STATUSES = new Set(["matched", "mismatched", "unverifiable"]);
const MATCHED = new Set(["exact", "within-tolerance"]);
// The outcome failed, so there is no recalculated value. The spec lists the first four; the other
// three come from a failed outcome too (a cycle, a failed precedent, an undocumented case), except
// U02, which classify sets on a computed label result and so keeps its value.
const NO_VALUE = new Set(["unknown-opcode", "decode-error", "volatile-function", "unsupported-function", "circular-reference", "depends-on-unverifiable", "undocumented-semantics"]);
const noValue = (r: { code: string; rule?: string }) => NO_VALUE.has(r.code) && r.rule !== "U02";

function expectWellFormed(v: SheetVerification): void {
  const t = v.totals;
  expect(t.matched + t.mismatched + t.unverifiable).toBe(t.formulas);
  expect(v.cells.length).toBe(t.formulas);
  expect(t.exact + t.withinTolerance).toBe(t.matched);
  for (const c of v.cells) {
    expect(STATUSES.has(c.status), c.address).toBe(true);
    expect((REASON_CODES as readonly string[]).includes(c.reason.code), c.reason.code).toBe(true);
    expect(c.status === "matched", c.address).toBe(MATCHED.has(c.reason.code));
    expect(c.status === "mismatched", c.address).toBe(c.reason.code === "value-differs");
    expect(c.recalculated === null, `${c.address} ${c.reason.code} ${c.reason.rule}`).toBe(noValue(c.reason));
    expect(c.reason.message.length, c.address).toBeGreaterThan(0);
    expect(c.reason.message).not.toContain("undefined");
    expect(c.candidateOpcodes).toEqual([...new Set(c.candidateOpcodes)].sort((a, b) => a - b));
  }
}

const FIXTURES = ["fixtures/ksbase/KSBASE.WK1", "fixtures/lotus123-wks/testLotus123.wks", "fixtures/libreoffice-wks-functions/gnome647171-1.wks", "fixtures/functions/functions.wk1", "fixtures/mixed/mixed.wk1"].map(
  (path) => new Uint8Array(readFileSync(path)),
);

type Mutation = { kind: "flip" | "insert"; at: number; byte: number } | { kind: "delete" | "truncate"; at: number };

function mutate(bytes: Uint8Array, mutations: Mutation[]): Uint8Array {
  let out = [...bytes];
  for (const m of mutations) {
    const at = out.length === 0 ? 0 : m.at % out.length;
    if (m.kind === "flip") out[at] = (out[at] ?? 0) ^ (m.byte || 1);
    if (m.kind === "insert") out.splice(at, 0, m.byte);
    if (m.kind === "delete") out.splice(at, 1);
    if (m.kind === "truncate") out = out.slice(0, at);
  }
  return Uint8Array.from(out);
}

const mutation: fc.Arbitrary<Mutation> = fc.oneof(
  fc.record({ kind: fc.constantFrom("flip" as const, "insert" as const), at: fc.nat(), byte: fc.integer({ min: 0, max: 255 }) }),
  fc.record({ kind: fc.constantFrom("delete" as const, "truncate" as const), at: fc.nat() }),
);

const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const f64 = (x: number) => [...new Uint8Array(new Float64Array([x]).buffer)];
const cell = fc.integer({ min: 0, max: 3 });

/** One token of the opcode table with plausible operand bytes, or a raw byte. */
const token: fc.Arbitrary<number[]> = fc.oneof(
  fc.constantFrom(...OPCODES).chain((e): fc.Arbitrary<number[]> => {
    if (e.kind === "operand" && e.name === "NUM") return fc.double().map((x) => [e.opcode, ...f64(x)]);
    if (e.kind === "operand" && e.name === "REF") return fc.tuple(cell, cell).map(([c, r]) => [e.opcode, ...le16(c), ...le16(r)]);
    if (e.kind === "operand" && e.name === "RANGE") return fc.tuple(cell, cell, cell, cell).map(([a, b, c, d]) => [e.opcode, ...le16(a), ...le16(b), ...le16(c), ...le16(d)]);
    if (e.kind === "operand" && e.name === "INT") return fc.integer({ min: -32768, max: 32767 }).map((x) => [e.opcode, ...le16(x)]);
    if (e.kind === "operand" && e.name === "STRING") return fc.constant([e.opcode, 0x61, 0x00]);
    if (e.kind === "function" && e.arity === "variable") return fc.integer({ min: 0, max: 4 }).map((n) => [e.opcode, n]);
    return fc.constant([e.opcode]);
  }),
  fc.integer({ min: 0, max: 255 }).map((b) => [b]),
);

const rpn = fc.array(token, { maxLength: 12 }).map((tokens) => [...tokens.flat(), 0x03]);
const cached = fc.oneof(fc.double(), fc.constantFrom(Infinity, -Infinity, NaN, 0));
const input = fc.oneof(fc.double(), fc.constant("label"));

describe("robustness (requirement 4)", () => {
  it("arbitrary bytes never throw and give a well-formed result", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
        expectWellFormed(verifyBytes(bytes).verification);
      }),
    );
  });

  it("mutated wk1/wks fixtures (flips, truncation, insertion, deletion) never throw", () => {
    fc.assert(
      fc.property(fc.constantFrom(...FIXTURES), fc.array(mutation, { minLength: 1, maxLength: 6 }), (bytes, ms) => {
        expectWellFormed(verifyBytes(mutate(bytes, ms)).verification);
      }),
      { numRuns: 200 },
    );
  });

  it("formulas built from random token streams never throw", () => {
    const reached = new Set<string>();
    fc.assert(
      fc.property(fc.array(rpn, { minLength: 1, maxLength: 4 }), fc.array(cached, { minLength: 4, maxLength: 4 }), fc.array(input, { minLength: 4, maxLength: 4 }), (streams, caches, inputs) => {
        const specs: Record<string, Spec> = {};
        inputs.forEach((x, i) => (specs[`A${i + 1}`] = x));
        streams.forEach((s, i) => (specs[`B${i + 1}`] = { rpn: s, cached: caches[i]! }));
        const v = verifySheet(buildSheet(specs));
        expectWellFormed(v);
        for (const c of v.cells) reached.add(c.reason.code);
      }),
      { numRuns: 500 },
    );
    // The streams get past the decoder, not only into decode errors.
    expect(reached.has("decode-error")).toBe(true);
    expect([...reached].some((code) => !NO_VALUE.has(code))).toBe(true);
  });
});
