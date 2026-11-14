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
