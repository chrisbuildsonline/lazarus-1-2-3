import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readNames } from "../../../src/macro/names.ts";

const framed = fc.array(fc.record({ opcode: fc.constantFrom(0x0b, 0x0f, 0x00, 0x1234), body: fc.uint8Array({ maxLength: 40 }), lie: fc.integer({ min: -3, max: 3 }) }), { maxLength: 20 }).map((records) => {
  const parts = records.map(({ opcode, body, lie }) => {
    const out = new Uint8Array(4 + body.length);
    const view = new DataView(out.buffer);
    view.setUint16(0, opcode, true);
    view.setUint16(2, Math.max(0, body.length + lie), true);
    out.set(body, 4);
    return out;
  });
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) all.set(p, (pos += p.length) - p.length);
  return all;
});

describe("readNames properties", () => {
  it("never throws on arbitrary or framed bytes and leaves the input unchanged", () => {
    fc.assert(
      fc.property(fc.oneof(fc.uint8Array({ maxLength: 300 }), framed), (bytes) => {
        const copy = bytes.slice();
        const r = readNames(bytes);
        expect(bytes).toEqual(copy);
        expect(r.notes.length).toBeLessThanOrEqual(100);
        for (const n of r.names) expect(n.name.length).toBeLessThanOrEqual(16);
      }),
      { numRuns: 500 },
    );
  });
  it("caps notes at 100 for a file of short NAME records", () => {
    const bytes = new Uint8Array(4 * 500);
    for (let i = 0; i < 500; i++) bytes[i * 4] = 0x0b;
    expect(readNames(bytes).notes).toHaveLength(100);
  });
});
