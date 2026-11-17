// Label alignment, XML-safe text and stored values (requirements 8, 10, 12, 17).
import { describe, expect, it } from "vitest";
import { alignmentFor, escapeOoxmlText, sanitizeXmlText, storedValue } from "../../../src/xlsx/labels.ts";

describe("alignmentFor", () => {
  it("maps the four aligning prefixes", () => {
    expect(["'", '"', "^", "\\"].map((p) => alignmentFor(p).alignment)).toEqual(["left", "right", "center", "fill"]);
    expect(["'", '"', "^", "\\"].map((p) => alignmentFor(p).note)).toEqual([null, null, null, null]);
  });

  it("gives no alignment and a note naming the prefix for | and an unknown byte", () => {
    for (const p of ["|", "x"]) {
      const r = alignmentFor(p);
      expect(r.alignment).toBeNull();
      expect(r.note).toContain(`Label prefix ${p}`);
    }
  });

  it("gives no alignment and no note for an empty prefix", () => {
    expect(alignmentFor("")).toEqual({ alignment: null, note: null });
  });
});

describe("sanitizeXmlText", () => {
  it("keeps text XML 1.0 can carry", () => {
    for (const s of ["a\tb\nc\rd", "ordinary text", "emoji \u{1F600}", "�", ""]) expect(sanitizeXmlText(s)).toEqual({ text: s, replaced: 0 });
  });

  it("replaces each character XML 1.0 cannot carry with U+FFFD and counts them", () => {
    expect(sanitizeXmlText("a\u0000b\u0001c\u000Bd￾e￿")).toEqual({ text: "a�b�c�d�e�", replaced: 5 });
    expect(sanitizeXmlText("x\uD800y\uDC00")).toEqual({ text: "x�y�", replaced: 2 });
  });
});

describe("escapeOoxmlText", () => {
  it("escapes the underscore of every _xHHHH_ sequence and nothing else", () => {
    expect(escapeOoxmlText("_x0041_")).toBe("_x005F_x0041_");
    expect(escapeOoxmlText("a_x00e9_b_x12_")).toBe("a_x005F_x00e9_b_x12_");
    expect(escapeOoxmlText("plain_text")).toBe("plain_text");
  });
});

describe("storedValue", () => {
  it("maps cached values to planned values", () => {
    expect(storedValue({ t: "num", v: 3.5 })).toEqual({ kind: "number", value: 3.5 });
    expect(storedValue({ t: "err" })).toEqual({ kind: "error", code: "#VALUE!" });
    expect(storedValue({ t: "na" })).toEqual({ kind: "error", code: "#N/A" });
    expect(storedValue({ t: "str", v: "x" })).toEqual({ kind: "none" });
    expect(storedValue(null)).toEqual({ kind: "none" });
  });
});
