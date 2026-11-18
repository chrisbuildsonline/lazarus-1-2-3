// The grid's view of a raised file: used range, display text, alignment and accessible names (requirements 33 to 35).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWk1, type Cell } from "../../../../src/parser/index.ts";
import { buildGridModel, cellLabel, columnLetters, type DisplayCell } from "../../../../src/ui/model/grid-model.ts";
import { cellResult as result, handBuilt, raiseFixture } from "../../helpers/raised.ts";

const KSBASE = "fixtures/ksbase/KSBASE.WK1";

const formula = (col: number, row: number, cached: number): Cell => ({ kind: "formula", col, row, cached, rpn: new Uint8Array([3]) });
const label = (col: number, row: number, prefix: string, text: string): Cell => ({ kind: "label", col, row, prefix, text });

describe("buildGridModel on KSBASE", () => {
  it("covers every parsed cell as its used range, not the declared dimensions", async () => {
    const model = buildGridModel(await raiseFixture(KSBASE));
    const cells = [...parseWk1(new Uint8Array(readFileSync(KSBASE))).sheet.cells.values()];
    expect(model.cols).toBe(Math.max(...cells.map((c) => c.col)) + 1);
    expect(model.rows).toBe(Math.max(...cells.map((c) => c.row)) + 1);
    for (const c of cells) expect(model.at(c.col, c.row).kind).not.toBe("empty");
  });

  it("gives label text, formatted numbers and formula status (manifest values)", async () => {
    const model = buildGridModel(await raiseFixture(KSBASE));
    expect(model.at(0, 0)).toMatchObject({ kind: "label", text: "OBSERV" });
    expect(model.at(1, 2)).toMatchObject({ kind: "number", text: "35,249", align: "right", status: null });
    // O3: formula with cached 0.25153768659966846 (manifest).
    expect(model.at(14, 2)).toMatchObject({ kind: "formula", status: "matched", text: "0.25153768659966846" });
  });

  it("shares one object for every empty cell", async () => {
    const model = buildGridModel(await raiseFixture(KSBASE));
    expect(model.at(25, 98).kind).toBe("empty");
    expect(model.at(25, 98)).toBe(model.at(300, 9000));
  });

  it("has one status per formula cell: the count equals verification.totals.formulas", async () => {
    const file = await raiseFixture(KSBASE);
    const model = buildGridModel(file);
    let withStatus = 0;
    for (let row = 0; row < model.rows; row++) for (let col = 0; col < model.cols; col++) if (model.at(col, row).kind === "formula" && model.at(col, row).status !== null) withStatus++;
    expect(withStatus).toBe(file.sheets[0]!.verification.totals.formulas);
    expect(model.formulaCells).toBe(file.sheets[0]!.verification.cells);
  });

  it("names cells for assistive technology", async () => {
    const model = buildGridModel(await raiseFixture(KSBASE));
    expect(cellLabel("A1", model.at(0, 0))).toBe("A1, OBSERV");
    expect(cellLabel("B3", model.at(1, 2))).toBe("B3, 35,249");
    expect(cellLabel("O3", model.at(14, 2))).toBe("O3, 0.25153768659966846, Matched");
    expect(cellLabel("Z99", model.at(25, 98))).toBe("Z99, empty");
  });
});

describe("hand-built sheets", () => {
  it("a formula cell with no stored value reads 'no stored value'", () => {
    const model = buildGridModel(handBuilt([formula(1, 1, NaN)], [result(1, 1, "B2", "unverifiable", null)]));
    expect(cellLabel("B2", model.at(1, 1))).toBe("B2, no stored value, Unverifiable");
  });

  it("maps label prefixes to alignment", () => {
    const cells = [label(0, 0, "'", "a"), label(1, 0, '"', "b"), label(2, 0, "^", "c"), label(3, 0, "\\", "d"), label(4, 0, "|", "e")];
    const model = buildGridModel(handBuilt(cells, []));
    expect([0, 1, 2, 3, 4].map((c) => (model.at(c, 0) as DisplayCell).align)).toEqual(["left", "right", "center", "left", "left"]);
  });

  it("rowsWithStatus lists the rows that hold a cell of that status", () => {
    const file = handBuilt(
      [formula(2, 0, 6), formula(2, 4, 1), formula(3, 4, 1)],
      [result(2, 0, "C1", "matched", 6), result(2, 4, "C5", "mismatched", 1), result(3, 4, "D5", "mismatched", 1)],
    );
    const model = buildGridModel(file);
    expect(model.rowsWithStatus("mismatched")).toEqual([4]);
    expect(model.rowsWithStatus("matched")).toEqual([0]);
    expect(model.rowsWithStatus("unverifiable")).toEqual([]);
  });
});

describe("columnLetters", () => {
  it("names columns like Lotus", () => {
    expect([0, 25, 26, 255].map(columnLetters)).toEqual(["A", "Z", "AA", "IV"]);
  });
});
