import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { a1, cellsInRowMajorOrder, parseWk1, parseWorkbook, type Sheet } from "../../../src/parser/index.ts";
import { verifySheet, verifyWorkbook } from "../../../src/verify/index.ts";
import { writeXlsx } from "../../../src/xlsx/index.ts";
import { excelSheetName } from "../../../src/xlsx/sheet-names.ts";
import { readXlsx } from "../helpers/xlsx-readback.ts";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const read = (path: string) => new Uint8Array(readFileSync(path));

// Hashes of writeXlsx({ sheet, verification }) recorded by this test on the code before
// multi-sheet writing was added (commit 0edbd6e).
const BEFORE: Record<string, string> = {
  "fixtures/ksbase/KSBASE.WK1": "ad9bfca9eee062515775909bfa8e8c9c10a6947651c5a3ac3f2163b4b87505c7",
  "fixtures/mixed/mixed.wk1": "cd22fa5c8a905a2e208b1e0340ef960158919d36120dcc64eef449190c532731",
};

describe("one-sheet WK1 output is byte-identical to the output before multi-sheet writing", () => {
  for (const [path, hash] of Object.entries(BEFORE)) {
    it(path, async () => {
      const { sheet } = parseWk1(read(path));
      const verification = verifySheet(sheet, path);
      expect(sha((await writeXlsx({ sheet, verification })).bytes)).toBe(hash);
      // The same sheet as a one-sheet workbook named Sheet1 gives the same bytes.
      expect(sha((await writeXlsx({ sheets: [{ name: "Sheet1", sheet, verification }] })).bytes)).toBe(hash);
    });
  }
});

/** Every cell's expected read-back value: labels as text, numbers and formula results as numbers. */
const expectedValues = (sheet: Sheet) => new Map(cellsInRowMajorOrder(sheet).map((c) => [a1(c.col, c.row), c.kind === "label" ? c.text : c.kind === "formula" ? c.cached : c.value]));

describe("a three-sheet WK3 workbook", () => {
  it("reads back with three worksheets, their names, every cell and no extra cell", async () => {
    const { workbook } = parseWorkbook(read("fixtures/wk3-sheets/wk3-sheets.wk3"));
    const verifications = verifyWorkbook(workbook, "wk3-sheets.wk3");
    const input = { sheets: workbook.sheets.map((s, i) => ({ name: s.name, sheet: s.sheet, verification: verifications[i]! })) };
    const { bytes, notes } = await writeXlsx(input);
    const back = await readXlsx(bytes);
    expect(back.sheetNames).toEqual(["A", "B", "Totals"]);
    workbook.sheets.forEach((s, i) => {
      const got = new Map([...back.sheets[i]!.values].map(([k, v]) => [k, v.value]));
      expect(got).toEqual(expectedValues(s.sheet));
    });
    // Totals!C2 is decoded: the Excel formula with the stored value. D2 reads sheet B: stored value, no formula, and the note.
    expect(back.sheets[2]!.values.get("C2")).toEqual({ value: 60.5, formula: "A1+B1+C1" });
    expect(back.sheets[2]!.values.get("D2")).toEqual({ value: 1, formula: null });
    expect(notes).toContainEqual(expect.objectContaining({ sheet: "Totals", address: "D2", code: "wk3-formula-not-translated" }));
    expect(notes.filter((n) => n.code === "wk3-formula-not-translated").map((n) => n.address)).toEqual(["D2"]);
  });

  it("writes the DBF table as it was read, labels and numbers", async () => {
    const { workbook } = parseWorkbook(read("fixtures/natural-earth-land/ne_110m_land.dbf"));
    const [verification] = verifyWorkbook(workbook, "land.dbf");
    const sheet = workbook.sheets[0]!;
    const back = await readXlsx((await writeXlsx({ sheets: [{ name: sheet.name, sheet: sheet.sheet, verification: verification! }] })).bytes);
    expect(back.sheetNames).toEqual(["Table"]);
    expect(new Map([...back.sheets[0]!.values].map(([k, v]) => [k, v.value]))).toEqual(expectedValues(sheet.sheet));
  });
});

describe("excelSheetName", () => {
  it("keeps a valid unique name", () => {
    expect(excelSheetName("Totals", new Set())).toEqual({ name: "Totals", changed: false });
  });

  it("replaces the characters Excel forbids", () => {
    expect(excelSheetName("a[b]:c*d?e/f\\g", new Set())).toEqual({ name: "a_b__c_d_e_f_g", changed: true });
  });

  it("cuts a name to 31 characters", () => {
    const r = excelSheetName("x".repeat(40), new Set());
    expect(r).toEqual({ name: "x".repeat(31), changed: true });
  });

  it("makes names that differ only by case unique, and records the taken name", () => {
    const taken = new Set<string>();
    expect(excelSheetName("Data", taken).name).toBe("Data");
    expect(excelSheetName("DATA", taken)).toEqual({ name: "DATA (2)", changed: true });
    expect(excelSheetName("data", taken)).toEqual({ name: "data (3)", changed: true });
    expect([...taken]).toEqual(["data", "data (2)", "data (3)"]);
  });

  it("gives a blank or apostrophe-edged name a usable one", () => {
    expect(excelSheetName("", new Set()).name).toBe("Sheet");
    expect(excelSheetName("'q'", new Set())).toEqual({ name: "q", changed: true });
  });
});

describe("writeXlsx notes a changed sheet name", () => {
  it("names with [, 40 characters and a case collision are fixed and noted", async () => {
    const { workbook } = parseWorkbook(read("fixtures/mixed/mixed.wk1"));
    const sheet = workbook.sheets[0]!.sheet;
    const verification = verifyWorkbook(workbook, "m")[0]!;
    const names = ["[x]", "y".repeat(40), "Same", "SAME"];
    const { bytes, notes } = await writeXlsx({ sheets: names.map((name) => ({ name, sheet, verification })) });
    expect((await readXlsx(bytes)).sheetNames).toEqual(["_x_", "y".repeat(31), "Same", "SAME (2)"]);
    expect(notes.filter((n) => n.code === "sheet-name-changed").map((n) => n.sheet)).toEqual(["_x_", "y".repeat(31), "SAME (2)"]);
  });
});
