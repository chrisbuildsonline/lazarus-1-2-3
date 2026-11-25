// Batch rows for WK3 and DBF files (requirement 57) and the selected sheet in the app state (55).
import { describe, expect, it } from "vitest";
import { appReducer, initialState, type AppState } from "../../../../src/ui/model/app-state.ts";
import { batchRow, type FileItem } from "../../../../src/ui/model/batch-rows.ts";
import { sumTotals } from "../../../../src/ui/model/totals.ts";
import { raiseFixture } from "../../helpers/raised.ts";

const WK3 = "fixtures/wk3-sheets/wk3-sheets.wk3";
const DBF = "fixtures/natural-earth-land/ne_110m_land.dbf";
const item = async (path: string): Promise<FileItem> => ({ id: 0, name: path, path, size: 1, phase: "raised", raised: await raiseFixture(path) });

describe("batchRow for WK3 and DBF", () => {
  it("a WK3 row reads WK3 and sums the totals of all sheets: 3 formulas, 1 matched, 2 unverifiable", async () => {
    const row = batchRow(await item(WK3));
    expect(row.kind).toBe("WK3");
    expect(row.pill).toBe("unverifiable");
    expect(row.line).toBe("33.3% verified");
  });

  it("a DBF row reads DBF with No formulas and the neutral pill, never Matched", async () => {
    const row = batchRow(await item(DBF));
    expect(row).toMatchObject({ kind: "DBF", line: "No formulas", pill: "none" });
  });
});

describe("sumTotals", () => {
  it("adds every count and every reason", () => {
    const a = { formulas: 2, matched: 1, mismatched: 1, unverifiable: 0, exact: 1, withinTolerance: 0, byReason: { exact: 1, "value-differs": 1 } };
    const b = { formulas: 1, matched: 0, mismatched: 0, unverifiable: 1, exact: 0, withinTolerance: 0, byReason: { "wk3-formula-not-decoded": 1 } };
    expect(sumTotals([a, b])).toEqual({ formulas: 3, matched: 1, mismatched: 1, unverifiable: 1, exact: 1, withinTolerance: 0, byReason: { exact: 1, "value-differs": 1, "wk3-formula-not-decoded": 1 } });
  });
});

describe("selectSheet", () => {
  const opened = async (): Promise<AppState> => {
    let s = appReducer(initialState, { type: "summoned", batchId: 1, entries: [{ name: "w.wk3", path: "w.wk3", size: 1 }, { name: "t.dbf", path: "t.dbf", size: 1 }], skipped: [] });
    s = appReducer(s, { type: "raised", batchId: 1, id: 0, file: await raiseFixture(WK3) });
    return appReducer(s, { type: "raised", batchId: 1, id: 1, file: await raiseFixture(DBF) });
  };

  it("starts at the first sheet, selects another, closes the drawer and clamps to the range", async () => {
    let s = await opened();
    expect(s.sheetIndex).toBe(0);
    s = appReducer(s, { type: "openCell", address: "A1" });
    s = appReducer(s, { type: "selectSheet", index: 2 });
    expect(s).toMatchObject({ sheetIndex: 2, cell: null });
    expect(appReducer(s, { type: "selectSheet", index: 9 }).sheetIndex).toBe(2);
    expect(appReducer(s, { type: "selectSheet", index: -3 }).sheetIndex).toBe(0);
  });

  it("goes back to 0 on selectFile and reset", async () => {
    const s = appReducer(await opened(), { type: "selectSheet", index: 1 });
    expect(appReducer(s, { type: "selectFile", id: 1 }).sheetIndex).toBe(0);
    expect(appReducer(s, { type: "reset" }).sheetIndex).toBe(0);
  });
});
