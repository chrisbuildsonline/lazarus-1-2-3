// Reference (0x01) and range (0x02) tokens with literal words. Bit 15 set = relative.
// KSBASE.WK1 writes column -5 as fb bf and row -1 as ff bf; testLotus123.wks writes column -2
// as fe 80 (no sign extension above bit 7), which the reserved-bit check reports.
import { describe, expect, it } from "vitest";
import { decodeRpn } from "../../../src/formula/decode.ts";

type Origin = { col: number; row: number };
const run = (origin: Origin, ...b: number[]) => decodeRpn(new Uint8Array([...b, 0x03]), origin);
const ref = (col: number, row: number, colAbs: boolean, rowAbs: boolean) => ({ col, row, colAbs, rowAbs });
const codes = (r: ReturnType<typeof run>) => r.diagnostics.map((d) => d.code);

describe("cell reference token 0x01", () => {
  it("reads an absolute reference", () => {
    expect(run({ col: 7, row: 7 }, 0x01, 0x02, 0x00, 0x04, 0x00).ast).toEqual({ type: "ref", ref: ref(2, 4, true, true) });
  });

  it("resolves a relative reference with positive offsets", () => {
    expect(run({ col: 3, row: 3 }, 0x01, 0x01, 0x80, 0x02, 0x80).ast).toEqual({ type: "ref", ref: ref(4, 5, false, false) });
  });

  it("resolves KSBASE-style negative offsets: column 0xBFFB = -5, row 0xBFFF = -1", () => {
    const r = run({ col: 14, row: 2 }, 0x01, 0xfb, 0xbf, 0xff, 0xbf);
    expect(r.ast).toEqual({ type: "ref", ref: ref(9, 1, false, false) });
    expect(r.diagnostics).toEqual([]);
  });

  it("keeps mixed flags per axis", () => {
    expect(run({ col: 5, row: 5 }, 0x01, 0x02, 0x00, 0xff, 0xbf).ast).toEqual({ type: "ref", ref: ref(2, 4, true, false) });
    expect(run({ col: 5, row: 5 }, 0x01, 0xff, 0xbf, 0x02, 0x00).ast).toEqual({ type: "ref", ref: ref(4, 2, false, true) });
  });

  it("resolves offset 0 at A1 and at IV8192", () => {
    expect(run({ col: 0, row: 0 }, 0x01, 0x00, 0x80, 0x00, 0x80).ast).toEqual({ type: "ref", ref: ref(0, 0, false, false) });
    expect(run({ col: 255, row: 8191 }, 0x01, 0x00, 0x80, 0x00, 0x80).ast).toEqual({ type: "ref", ref: ref(255, 8191, false, false) });
  });

  it("reads the largest absolute column and row", () => {
    expect(run({ col: 0, row: 0 }, 0x01, 0xff, 0x00, 0xff, 0x1f).ast).toEqual({ type: "ref", ref: ref(255, 8191, true, true) });
  });

  it("reports a reference that leaves the grid on each side, at the token offset", () => {
    const left = run({ col: 0, row: 5 }, 0x05, 0x00, 0x00, 0x01, 0xff, 0xbf, 0x00, 0x80, 0x09);
    expect(left.ast).toBeNull();
    expect(left.diagnostics).toMatchObject([{ code: "reference-out-of-grid", severity: "error", offset: 3, opcode: 0x01 }]);
    expect(codes(run({ col: 255, row: 5 }, 0x01, 0x01, 0x80, 0x00, 0x80))).toEqual(["reference-out-of-grid"]);
    expect(codes(run({ col: 5, row: 0 }, 0x01, 0x00, 0x80, 0xff, 0xbf))).toEqual(["reference-out-of-grid"]);
    expect(codes(run({ col: 5, row: 8191 }, 0x01, 0x00, 0x80, 0x01, 0x80))).toEqual(["reference-out-of-grid"]);
  });

  it("warns on reserved bits and still decodes", () => {
    // absolute column with bit 8 set
    const abs = run({ col: 0, row: 0 }, 0x01, 0x03, 0x01, 0x00, 0x00);
    expect(abs.ast).toEqual({ type: "ref", ref: ref(3, 0, true, true) });
    expect(abs.diagnostics).toMatchObject([{ code: "reserved-bits-set", severity: "warning", offset: 0, opcode: 0x01 }]);
    // testLotus123.wks C2: column -2 written as 0x80FE
    const wks = run({ col: 2, row: 1 }, 0x01, 0xfe, 0x80, 0x00, 0x80);
    expect(wks.ast).toEqual({ type: "ref", ref: ref(0, 1, false, false) });
    expect(codes(wks)).toEqual(["reserved-bits-set"]);
    // absolute row with bit 13 set
    expect(codes(run({ col: 0, row: 0 }, 0x01, 0x00, 0x00, 0x00, 0x20))).toEqual(["reserved-bits-set"]);
  });

  it("reports a cut reference as truncated-stream", () => {
    const r = decodeRpn(new Uint8Array([0x01, 0x00, 0x80, 0x00]), { col: 0, row: 0 });
    expect(r.diagnostics).toMatchObject([{ code: "truncated-stream", offset: 0, opcode: 0x01 }]);
  });
});

describe("range token 0x02", () => {
  it("reads absolute corners", () => {
    expect(run({ col: 9, row: 9 }, 0x02, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00).ast).toEqual({
      type: "range",
      from: ref(0, 0, true, true),
      to: ref(1, 1, true, true),
    });
  });

  it("resolves relative corners: gnome647171-1.wks A2 is A1..B1", () => {
    expect(run({ col: 0, row: 1 }, 0x02, 0x00, 0x80, 0xff, 0xbf, 0x01, 0x80, 0xff, 0xbf).ast).toEqual({
      type: "range",
      from: ref(0, 0, false, false),
      to: ref(1, 0, false, false),
    });
  });

  it("keeps mixed flags on each corner", () => {
    expect(run({ col: 4, row: 4 }, 0x02, 0x00, 0x00, 0xff, 0xbf, 0x01, 0x80, 0x09, 0x00).ast).toEqual({
      type: "range",
      from: ref(0, 3, true, false),
      to: ref(5, 9, false, true),
    });
  });

  it("reports a cut range as truncated-stream", () => {
    const r = decodeRpn(new Uint8Array([0x02, 0x00, 0x00, 0x00, 0x00, 0x01]), { col: 0, row: 0 });
    expect(r.diagnostics).toMatchObject([{ code: "truncated-stream", offset: 0, opcode: 0x02 }]);
  });
});
