import { describe, expect, it } from "vitest";
import { decodeRpn } from "../../../src/formula/decode.ts";

const O = { col: 0, row: 0 };
const codes = (r: { diagnostics: { code: string }[] }) => r.diagnostics.map((d) => d.code);
const bytes = (...b: number[]) => new Uint8Array(b);

describe("decodeRpn: stream shape", () => {
  it("reports truncated-stream at 0 for an empty array", () => {
    const r = decodeRpn(bytes(), O);
    expect(r.ast).toBeNull();
    expect(r.diagnostics).toMatchObject([{ code: "truncated-stream", severity: "error", offset: 0 }]);
  });

  it("reports stack-imbalance with zero nodes for a lone return token", () => {
    const r = decodeRpn(bytes(0x03), O);
    expect(r.ast).toBeNull();
    expect(r.diagnostics).toMatchObject([{ code: "stack-imbalance", severity: "error", offset: 0, opcode: 0x03 }]);
    expect(r.diagnostics[0]!.message).toContain("0 nodes");
  });

  it("reports truncated-stream at the end when the return token is missing", () => {
    // int 7, no return
    const r = decodeRpn(bytes(0x05, 0x07, 0x00), O);
    expect(r.ast).toBeNull();
    expect(r.diagnostics).toMatchObject([{ code: "truncated-stream", severity: "error", offset: 3 }]);
  });

  it("decodes and reports trailing-bytes when bytes follow the return token", () => {
    const r = decodeRpn(bytes(0x05, 0x07, 0x00, 0x03, 0xaa, 0xbb), O);
    expect(r.ast).toEqual({ type: "int", value: 7 });
    expect(r.diagnostics).toMatchObject([{ code: "trailing-bytes", severity: "info", offset: 4 }]);
    expect(r.diagnostics[0]!.message).toContain("2 bytes");
    expect(r.bytesRead).toBe(4);
  });

  it("does not mutate the input", () => {
    const input = bytes(0x05, 0x07, 0x00, 0x03);
    decodeRpn(input, O);
    expect([...input]).toEqual([0x05, 0x07, 0x00, 0x03]);
  });

  it("has no error-free result without a tree", () => {
    expect(codes(decodeRpn(bytes(0x05, 0x01, 0x00, 0x03), O))).toEqual([]);
  });
});

describe("decodeRpn: unknown and candidate opcodes", () => {
  it("stops at an unknown opcode, names it and its offset, and records it", () => {
    // 0x07 is "unused" in WSFF5 and a NOP in LO: not in the table.
    const r = decodeRpn(bytes(0x05, 0x01, 0x00, 0x07, 0x05, 0x02, 0x00, 0x03), O);
    expect(r.ast).toBeNull();
    expect(r.unknown).toEqual({ opcode: 0x07, offset: 3 });
    expect(r.bytesRead).toBe(4);
    expect(r.diagnostics).toMatchObject([{ code: "unknown-opcode", severity: "error", offset: 3, opcode: 0x07 }]);
    expect(r.diagnostics[0]!.message).toContain("0x07");
    expect(r.diagnostics[0]!.message).toContain("offset 3");
  });

  it("warns once per candidate opcode and still decodes", () => {
    // 1 - 1 - 1 with 0x0A (subtract, candidate) twice
    const r = decodeRpn(bytes(0x05, 0x01, 0x00, 0x05, 0x01, 0x00, 0x0a, 0x05, 0x01, 0x00, 0x0a, 0x03), O);
    expect(r.ast).not.toBeNull();
    expect(r.diagnostics).toMatchObject([{ code: "unconfirmed-opcode", severity: "warning", offset: 6, opcode: 0x0a }]);
  });

  it("gives no warning for a confirmed opcode", () => {
    expect(codes(decodeRpn(bytes(0x05, 0x01, 0x00, 0x05, 0x01, 0x00, 0x09, 0x03), O))).toEqual([]);
  });
});

// KSBASE.WK1 O3, bytes from evidence.md: @IF(N3=1,0.5*(J3+J4),@FALSE)
const KSBASE_O3 = [
  0x01, 0xff, 0xbf, 0x00, 0x80, 0x05, 0x01, 0x00, 0x0e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe0, 0x3f,
  0x01, 0xfb, 0xbf, 0x00, 0x80, 0x01, 0xfb, 0xbf, 0x01, 0x80, 0x09, 0x04, 0x0b, 0x33, 0x3b, 0x03,
];
const O3 = { col: 14, row: 2 };
const rel = (col: number, row: number) => ({ type: "ref", ref: { col, row, colAbs: false, rowAbs: false } });

describe("decodeRpn: a real formula, cut and unbalanced", () => {
  it("decodes KSBASE.WK1 O3 whole", () => {
    const r = decodeRpn(new Uint8Array(KSBASE_O3), O3);
    expect(r.diagnostics).toEqual([]);
    expect(r.ast).toEqual({
      type: "call",
      name: "IF",
      args: [
        { type: "binary", op: "eq", left: rel(13, 2), right: { type: "int", value: 1 } },
        {
          type: "binary",
          op: "mul",
          left: { type: "number", value: 0.5 },
          right: { type: "paren", inner: { type: "binary", op: "add", left: rel(9, 2), right: rel(9, 3) } },
        },
        { type: "call", name: "FALSE", args: [] },
      ],
    });
  });

  it("never throws and always errors with no tree when cut at any length", () => {
    for (let n = 0; n < KSBASE_O3.length; n++) {
      const r = decodeRpn(new Uint8Array(KSBASE_O3.slice(0, n)), O3);
      expect(r.ast, `cut at ${n}`).toBeNull();
      expect(r.diagnostics.some((d) => d.severity === "error"), `cut at ${n}`).toBe(true);
    }
  });

  it("reports stack-imbalance with the depth when two nodes reach the return token", () => {
    const r = decodeRpn(bytes(0x05, 0x01, 0x00, 0x05, 0x02, 0x00, 0x03), O);
    expect(r.ast).toBeNull();
    expect(r.diagnostics).toMatchObject([{ code: "stack-imbalance", offset: 6, opcode: 0x03 }]);
    expect(r.diagnostics[0]!.message).toContain("2 nodes");
  });
});

describe("decodeRpn: nesting depth", () => {
  const negates = (n: number) => new Uint8Array([0x05, 0x01, 0x00, ...new Array<number>(n).fill(0x08), 0x03]);

  it("decodes 256 nested negates", () => {
    const r = decodeRpn(negates(256), O);
    expect(r.ast).not.toBeNull();
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("stops at the 257th nested negate with nesting-too-deep", () => {
    const r = decodeRpn(negates(257), O);
    expect(r.ast).toBeNull();
    expect(r.diagnostics.filter((d) => d.severity === "error")).toMatchObject([{ code: "nesting-too-deep", offset: 3 + 256, opcode: 0x08 }]);
  });
});
