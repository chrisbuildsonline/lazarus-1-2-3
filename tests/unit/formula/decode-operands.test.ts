// Operand tokens with literal bytes. Opcodes from evidence.md: 0x00 number (KSBASE.WK1 O3),
// 0x05 integer (KSBASE.WK1 O3), 0x06 string (gnome647171-1.wks A5).
import { describe, expect, it } from "vitest";
import { decodeRpn } from "../../../src/formula/decode.ts";

const O = { col: 0, row: 0 };
const run = (...b: number[]) => decodeRpn(new Uint8Array(b), O);
const errors = (r: ReturnType<typeof run>) => r.diagnostics.filter((d) => d.severity === "error");

describe("number token 0x00", () => {
  it("reads 0.5, 0 and the largest double little-endian", () => {
    expect(run(0x00, 0, 0, 0, 0, 0, 0, 0xe0, 0x3f, 0x03).ast).toEqual({ type: "number", value: 0.5 });
    expect(run(0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0x03).ast).toEqual({ type: "number", value: 0 });
    expect(run(0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xef, 0x7f, 0x03).ast).toEqual({ type: "number", value: Number.MAX_VALUE });
  });

  it("reports a cut double as truncated-stream at the token offset", () => {
    const r = run(0x05, 0x01, 0x00, 0x00, 0x00, 0x00, 0xe0);
    expect(r.ast).toBeNull();
    expect(errors(r)).toMatchObject([{ code: "truncated-stream", offset: 3, opcode: 0x00 }]);
    expect(errors(r)[0]!.message).toMatch(/0x00 at offset 3/);
  });

  it("reports NaN and infinity as non-finite-constant", () => {
    const nan = run(0x00, 0, 0, 0, 0, 0, 0, 0xf8, 0x7f, 0x03);
    expect(nan.ast).toBeNull();
    expect(errors(nan)).toMatchObject([{ code: "non-finite-constant", offset: 0, opcode: 0x00 }]);
    const inf = run(0x00, 0, 0, 0, 0, 0, 0, 0xf0, 0x7f, 0x03);
    expect(errors(inf)).toMatchObject([{ code: "non-finite-constant" }]);
  });
});

describe("integer token 0x05", () => {
  it("reads signed 16-bit values and keeps them as int nodes", () => {
    expect(run(0x05, 0x00, 0x00, 0x03).ast).toEqual({ type: "int", value: 0 });
    expect(run(0x05, 0xff, 0xff, 0x03).ast).toEqual({ type: "int", value: -1 });
    expect(run(0x05, 0xff, 0x7f, 0x03).ast).toEqual({ type: "int", value: 32767 });
    expect(run(0x05, 0x00, 0x80, 0x03).ast).toEqual({ type: "int", value: -32768 });
  });

  it("reports a cut int as truncated-stream at the token offset", () => {
    const r = run(0x05, 0x01);
    expect(errors(r)).toMatchObject([{ code: "truncated-stream", offset: 0, opcode: 0x05 }]);
  });
});

describe("string token 0x06", () => {
  it("reads an empty string", () => {
    expect(run(0x06, 0x00, 0x03).ast).toEqual({ type: "string", value: "" });
  });

  it("reads gnome647171-1.wks A5's literal bytes", () => {
    expect(run(0x06, 0x4f, 0x64, 0x64, 0x00, 0x03).ast).toEqual({ type: "string", value: "Odd" });
  });

  it("keeps a double quote as is", () => {
    expect(run(0x06, 0x22, 0x61, 0x22, 0x00, 0x03).ast).toEqual({ type: "string", value: '"a"' });
  });

  it("reads bytes at 0x80 and above as Latin-1", () => {
    expect(run(0x06, 0xe9, 0xff, 0x80, 0x00, 0x03).ast).toEqual({ type: "string", value: "éÿ\u0080" });
  });

  it("reports a string with no NUL as truncated-stream at the token offset", () => {
    const r = run(0x05, 0x01, 0x00, 0x06, 0x41, 0x42);
    expect(r.ast).toBeNull();
    expect(errors(r)).toMatchObject([{ code: "truncated-stream", offset: 3, opcode: 0x06 }]);
  });
});
