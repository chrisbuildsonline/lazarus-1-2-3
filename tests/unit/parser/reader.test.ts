import { describe, expect, it } from "vitest";
import { ByteReader } from "../../../src/parser/reader.ts";

const BYTES = new Uint8Array([0x01, 0x02, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f]);

describe("ByteReader", () => {
  it("reads little-endian values and advances pos", () => {
    const r = new ByteReader(BYTES);
    expect(r.u8()).toBe(0x01);
    expect(r.pos).toBe(1);
    expect(r.u8()).toBe(0x02);
    expect(r.i16()).toBe(-2);
    expect(r.pos).toBe(4);
    expect(r.f64()).toBe(1.5);
    expect(r.pos).toBe(12);
    expect(new ByteReader(BYTES).u16()).toBe(0x0201);
    expect(new ByteReader(BYTES, 2).u16()).toBe(0xfffe);
  });

  it("returns a copy from slice", () => {
    const r = new ByteReader(BYTES);
    const s = r.slice(3);
    expect(s).toEqual(new Uint8Array([0x01, 0x02, 0xfe]));
    expect(r.pos).toBe(3);
    s![0] = 0x99;
    expect(BYTES[0]).toBe(0x01);
    expect(new ByteReader(BYTES).slice(0)).toEqual(new Uint8Array(0));
  });

  it("returns null and leaves pos unchanged when a read would pass end", () => {
    const reads: [string, (r: ByteReader) => unknown, number][] = [
      ["u8", (r) => r.u8(), 1],
      ["u16", (r) => r.u16(), 2],
      ["i16", (r) => r.i16(), 2],
      ["f64", (r) => r.f64(), 8],
      ["slice", (r) => r.slice(4), 4],
      ["sub", (r) => r.sub(4), 4],
    ];
    for (const [name, read, size] of reads) {
      for (let left = 0; left < size; left++) {
        const r = new ByteReader(BYTES, BYTES.length - left);
        const before = r.pos;
        expect(read(r), `${name} with ${left} left`).toBeNull();
        expect(r.pos, name).toBe(before);
      }
    }
  });

  it("stops at an end set before the array's end", () => {
    const r = new ByteReader(BYTES, 0, 3);
    expect(r.u16()).toBe(0x0201);
    expect(r.u16()).toBeNull();
    expect(r.u8()).toBe(0xfe);
    expect(r.u8()).toBeNull();
    expect(r.remaining()).toBe(0);
  });

  it("does not trust an end past the array", () => {
    const r = new ByteReader(BYTES, 10, 1000);
    expect(r.remaining()).toBe(2);
    expect(r.f64()).toBeNull();
  });

  it("gives a sub-reader that cannot read past its own end", () => {
    const r = new ByteReader(BYTES);
    r.u8();
    const sub = r.sub(3)!;
    expect(r.pos).toBe(4);
    expect(sub.pos).toBe(1);
    expect(sub.end).toBe(4);
    expect(sub.u8()).toBe(0x02);
    expect(sub.u16()).toBe(0xfffe);
    expect(sub.u8()).toBeNull();
    expect(sub.f64()).toBeNull();
    expect(sub.slice(1)).toBeNull();
  });

  it("works on a subarray with a non-zero byteOffset", () => {
    const view = BYTES.subarray(2, 12);
    expect(view.byteOffset).toBe(2);
    const r = new ByteReader(view);
    expect(r.end).toBe(10);
    expect(r.i16()).toBe(-2);
    expect(r.f64()).toBe(1.5);
    expect(r.u8()).toBeNull();
    expect(new ByteReader(view).slice(2)).toEqual(new Uint8Array([0xfe, 0xff]));
  });
});
