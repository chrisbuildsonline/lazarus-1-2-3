// translateFormula chains decode, toExcelAst and printExcel and sets status (requirements 5 to
// 7, 29, 30, 38, 45). Byte arrays are literal; opcodes from src/formula/opcodes.ts sources.
import { describe, expect, it } from "vitest";
import type { FormulaDiagnostic } from "../../../src/formula/diagnostics.ts";
import { isUnverifiable, translateFormula } from "../../../src/formula/translate.ts";

const O = { col: 0, row: 0 };
const run = (...b: number[]) => translateFormula(new Uint8Array(b), O);
const latin = (s: string) => [...s].map((c) => c.charCodeAt(0));
const str = (s: string) => [0x06, ...latin(s), 0x00];
const d = (severity: FormulaDiagnostic["severity"], code: FormulaDiagnostic["code"]): FormulaDiagnostic => ({ severity, code, offset: 0, message: "" });

describe("isUnverifiable", () => {
  it("is true for any error and for a volatile-function warning, false otherwise", () => {
    expect(isUnverifiable([])).toBe(false);
    expect(isUnverifiable([d("info", "semantics-note"), d("warning", "unconfirmed-opcode"), d("info", "constant-precision")])).toBe(false);
    expect(isUnverifiable([d("warning", "volatile-function")])).toBe(true);
    expect(isUnverifiable([d("error", "stack-underflow")])).toBe(true);
  });
});

describe("translateFormula", () => {
  it("translates formulas.wk1 A2 (+A1+B1, written at A2) to A1+B1 with status ok", () => {
    const t = translateFormula(new Uint8Array([0x01, 0x00, 0x80, 0xff, 0xbf, 0x01, 0x01, 0x80, 0xff, 0xbf, 0x09, 0x03]), { col: 0, row: 1 });
    expect(t).toEqual({
      status: "ok",
      ast: {
        type: "binary",
        op: "add",
        left: { type: "ref", ref: { col: 0, row: 0, colAbs: false, rowAbs: false } },
        right: { type: "ref", ref: { col: 1, row: 0, colAbs: false, rowAbs: false } },
      },
      excel: "A1+B1",
      diagnostics: [],
      unknown: null,
    });
  });

  it("returns unverifiable, no ast, no excel and the unknown opcode on a decode error", () => {
    const t = run(0x05, 0x01, 0x00, 0xff, 0x03);
    expect(t.status).toBe("unverifiable");
    expect(t.ast).toBeNull();
    expect(t.excel).toBeNull();
    expect(t.unknown).toEqual({ opcode: 0xff, offset: 3 });
    expect(t.diagnostics).toMatchObject([{ code: "unknown-opcode", severity: "error", offset: 3, opcode: 0xff }]);
  });

  it("keeps a semantics-note as status ok, with the note at the end of the rpn", () => {
    // @COUNT(1): 0x52 with count byte 1, a confirmed opcode.
    const t = run(0x05, 0x01, 0x00, 0x52, 0x01, 0x03);
    expect(t.status).toBe("ok");
    expect(t.excel).toBe("COUNTA(1)");
    expect(t.diagnostics).toMatchObject([{ code: "semantics-note", severity: "info", offset: 6 }]);
  });

  it("marks NOW and RAND unverifiable with a volatile-function warning and keeps the text", () => {
    for (const [opcode, name] of [[0x37, "NOW"], [0x35, "RAND"]] as const) {
      const t = run(opcode, 0x03);
      expect(t.status).toBe("unverifiable");
      expect(t.excel).toBe(`${name}()`);
      expect(t.ast).toEqual({ type: "call", name, args: [] });
      expect(t.diagnostics.filter((x) => x.code === "volatile-function")).toMatchObject([{ severity: "warning", offset: 2 }]);
      expect(t.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
    }
  });

  it("keeps the Lotus ast for ERR but gives no excel text", () => {
    const t = run(0x20, 0x03);
    expect(t.status).toBe("unverifiable");
    expect(t.ast).toEqual({ type: "call", name: "ERR", args: [] });
    expect(t.excel).toBeNull();
    expect(t.diagnostics).toContainEqual(expect.objectContaining({ code: "no-excel-equivalent", severity: "error", offset: 2 }));
  });

  it("allows a 255-character string and refuses 256 with excel-limit", () => {
    expect(run(...str("a".repeat(255)), 0x03)).toMatchObject({ status: "ok", excel: `"${"a".repeat(255)}"` });
    const t = run(...str("a".repeat(256)), 0x03);
    expect(t).toMatchObject({ status: "unverifiable", ast: null, excel: null });
    expect(t.diagnostics).toMatchObject([{ code: "excel-limit", severity: "error", offset: 259 }]);
  });

  it("counts doubled quotes toward the string limit as Excel does: the value, not the quoting", () => {
    expect(run(...str('"'.repeat(200)), 0x03).status).toBe("ok");
  });

  it("refuses formula text over 8192 characters with excel-limit", () => {
    // 40 strings of 250 characters joined by &: 40 * 252 + 39 = 10119 characters.
    const part = str("b".repeat(250));
    const bytes = [...part];
    for (let i = 1; i < 40; i++) bytes.push(...part, 0x18);
    const t = run(...bytes, 0x03);
    expect(t).toMatchObject({ status: "unverifiable", ast: null, excel: null });
    expect(t.diagnostics.filter((x) => x.severity === "error")).toMatchObject([{ code: "excel-limit" }]);
    expect(t.diagnostics.find((x) => x.code === "excel-limit")!.message).toContain("10119");
  });

  it("does not mutate the input array", () => {
    const rpn = new Uint8Array([0x05, 0x01, 0x00, 0x08, 0x03]);
    translateFormula(rpn, O);
    expect([...rpn]).toEqual([0x05, 0x01, 0x00, 0x08, 0x03]);
  });
});
