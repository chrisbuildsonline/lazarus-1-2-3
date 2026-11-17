import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verifyBytes } from "../../../src/verify/index.ts";
import { handleVerifyRequest } from "../../../src/workers/verify-protocol.ts";

/** The file's bytes as their own ArrayBuffer, the way a page posts them. */
function buffer(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

const FIXTURES = ["fixtures/mixed/mixed.wk1", "fixtures/ksbase/KSBASE.WK1", "fixtures/lotus123-wks/testLotus123.wks", "fixtures/libreoffice-wks-functions/gnome647171-1.wks"];

describe("handleVerifyRequest (requirements 7, 9, 11)", () => {
  it("answers a fixture with a result that has the same id and the same data as verifyBytes", () => {
    const bytes = buffer("fixtures/mixed/mixed.wk1");
    const r = handleVerifyRequest({ type: "verify", id: 41, name: "mixed.wk1", bytes });
    expect(r).toEqual({ type: "result", id: 41, result: verifyBytes(new Uint8Array(bytes), "mixed.wk1") });
  });

  it("answers garbage bytes with a result that carries the parser diagnostics", () => {
    const r = handleVerifyRequest({ type: "verify", id: 2, bytes: new Uint8Array([9, 9, 9]).buffer });
    expect(r.type).toBe("result");
    if (r.type === "result") {
      expect(r.id).toBe(2);
      expect(r.result.diagnostics.length).toBeGreaterThan(0);
      expect(r.result.verification.cells).toEqual([]);
    }
  });

  it("answers a malformed request with an error, keeping the id when it is readable", () => {
    const bytes = new ArrayBuffer(4);
    expect(handleVerifyRequest({ type: "verify", bytes })).toMatchObject({ type: "error", id: null });
    expect(handleVerifyRequest({ type: "verify", id: 1.5, bytes })).toMatchObject({ type: "error", id: null });
    expect(handleVerifyRequest({ type: "verify", id: 7 })).toMatchObject({ type: "error", id: 7 });
    expect(handleVerifyRequest({ type: "verify", id: 7, bytes: [1, 2] })).toMatchObject({ type: "error", id: 7 });
    expect(handleVerifyRequest({ type: "other", id: 7, bytes })).toMatchObject({ type: "error", id: 7 });
    expect(handleVerifyRequest({ type: "verify", id: 7, name: 3, bytes })).toMatchObject({ type: "error", id: 7 });
    expect(handleVerifyRequest(null)).toMatchObject({ type: "error", id: null });
    expect(handleVerifyRequest("verify")).toMatchObject({ type: "error", id: null });
  });

  it("error responses carry a message", () => {
    const r = handleVerifyRequest({ type: "verify", id: 7 });
    expect(r.type === "error" && r.message.length > 0).toBe(true);
  });

  for (const path of FIXTURES) {
    it(`the result for ${path} survives structuredClone and JSON unchanged`, () => {
      const r = handleVerifyRequest({ type: "verify", id: 1, name: path, bytes: buffer(path) });
      expect(r.type).toBe("result");
      expect(structuredClone(r)).toEqual(r);
      const text = JSON.stringify(r);
      expect(text).not.toMatch(/Infinity|NaN/);
      expect(JSON.parse(text)).toEqual(r);
    });
  }

  it("turns an exception inside the core into an error response", () => {
    const r = handleVerifyRequest({ type: "verify", id: 5, bytes: new ArrayBuffer(0) }, () => {
      throw new Error("core failed");
    });
    expect(r).toEqual({ type: "error", id: 5, message: expect.stringContaining("core failed") });
  });
});
