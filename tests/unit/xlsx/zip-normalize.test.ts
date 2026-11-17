// normalizeZipTimestamps (requirement 25, design "ZIP timestamps"). The ZIP is built by hand
// from the PKWARE APPNOTE layout: local header 30 bytes + name + data, central header 46 bytes
// + name, end record 22 bytes.
import { describe, expect, it } from "vitest";
import { normalizeZipTimestamps } from "../../../src/xlsx/zip-normalize.ts";

type Entry = { name: string; data: number[]; time: number; date: number; crc: number };

function buildZip(entries: Entry[]): Uint8Array {
  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 0xff, (v >>> 8) & 0xff);
  const u32 = (v: number) => out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  const name = (s: string) => out.push(...[...s].map((c) => c.charCodeAt(0)));
  const offsets: number[] = [];
  for (const e of entries) {
    offsets.push(out.length);
    u32(0x04034b50); u16(10); u16(0); u16(0); u16(e.time); u16(e.date); u32(e.crc);
    u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0); name(e.name); out.push(...e.data);
  }
  const cd = out.length;
  entries.forEach((e, i) => {
    u32(0x02014b50); u16(20); u16(10); u16(0); u16(0); u16(e.time); u16(e.date); u32(e.crc);
    u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(offsets[i]!); name(e.name);
  });
  const cdSize = out.length - cd;
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length); u32(cdSize); u32(cd); u16(0);
  return new Uint8Array(out);
}

const u16at = (b: Uint8Array, p: number) => b[p]! | (b[p + 1]! << 8);

const entries: Entry[] = [
  { name: "a.txt", data: [1, 2, 3], time: 0x7a3c, date: 0x5a91, crc: 0x12345678 },
  { name: "b/c.xml", data: [9, 8], time: 0x1234, date: 0x4f21, crc: 0x9abcdef0 },
];

describe("normalizeZipTimestamps", () => {
  it("sets time 0x0000 and date 0x0021 in every local and central header, and nothing else", () => {
    const input = buildZip(entries);
    const before = input.slice();
    const out = normalizeZipTimestamps(input)!;
    expect(input).toEqual(before);
    const expected = buildZip(entries.map((e) => ({ ...e, time: 0, date: 0x0021 })));
    expect(out).toEqual(expected);
    // First local header at 0, second after 30 + 5 + 3 bytes; central directory after both.
    expect([u16at(out, 10), u16at(out, 12)]).toEqual([0, 0x21]);
    expect([u16at(out, 38 + 10), u16at(out, 38 + 12)]).toEqual([0, 0x21]);
    const cd = 38 + 30 + 7 + 2;
    expect([u16at(out, cd + 12), u16at(out, cd + 14)]).toEqual([0, 0x21]);
  });

  it("returns null for archives it cannot parse", () => {
    expect(normalizeZipTimestamps(new Uint8Array())).toBeNull();
    expect(normalizeZipTimestamps(new Uint8Array(100))).toBeNull();
    const zip = buildZip(entries);
    const pastEnd = zip.slice();
    // End record starts 22 bytes from the end; central offset at +16.
    new DataView(pastEnd.buffer).setUint32(pastEnd.length - 22 + 16, pastEnd.length + 10, true);
    expect(normalizeZipTimestamps(pastEnd)).toBeNull();
    const badLocal = zip.slice();
    badLocal[38] = 0x00;
    expect(normalizeZipTimestamps(badLocal)).toBeNull();
  });
});
