// Probe of every row of the design.md "exceljs usage" table against the installed exceljs.
// Findings (exceljs 4.4.0, run under the Vitest runner):
// - a formula result of 0 is written (<v>0</v>) and read back by `cell.result`, but `cell.value`
//   drops it on read; a formula without a result reads back with result undefined.
// - -0 written as a number reads back as 0 with Object.is(-0, back) false: XLSX keeps `0`.
//   Requirement 7 (Object.is) therefore cannot hold for -0; the writer tests compare -0 with ===.
// - 0.1 reads back as exactly 0.1.
// - writeBuffer returns a Node Buffer here; new Uint8Array(buffer) copies the same bytes.
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

async function roundTrip(fill: (ws: ExcelJS.Worksheet) => void): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  fill(wb.addWorksheet("Sheet1"));
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  return back.getWorksheet("Sheet1")!;
}

describe("exceljs probe", () => {
  it("keeps a formula result of 0 and leaves a missing result undefined", async () => {
    const ws = await roundTrip((s) => {
      s.getCell("A1").value = { formula: "B1-B1", result: 0 };
      s.getCell("A2").value = { formula: "B1+1" };
    });
    // The file holds <v>0</v>, but reading `cell.value` drops a falsy result (Cell._copyModel
    // copies only truthy fields). `cell.result` keeps it, so the read-back helper uses that.
    expect(ws.getCell("A1").value).toEqual({ formula: "B1-B1" });
    expect(ws.getCell("A1").result).toBe(0);
    const a2 = ws.getCell("A2").value as ExcelJS.CellFormulaValue;
    expect(a2.formula).toBe("B1+1");
    expect(a2.result).toBeUndefined();
  });

  it("keeps error values, as a value and as a formula result", async () => {
    const ws = await roundTrip((s) => {
      s.getCell("A1").value = { error: "#N/A" } as ExcelJS.CellErrorValue;
      s.getCell("A2").value = { formula: "B1", result: { error: "#VALUE!" } } as ExcelJS.CellFormulaValue;
    });
    expect(ws.getCell("A1").value).toEqual({ error: "#N/A" });
    expect((ws.getCell("A2").value as ExcelJS.CellFormulaValue).result).toEqual({ error: "#VALUE!" });
  });

  it("keeps horizontal alignment including fill, and notes", async () => {
    const ws = await roundTrip((s) => {
      for (const [i, h] of (["left", "right", "center", "fill"] as const).entries()) {
        const c = s.getCell(1, i + 1);
        c.value = "x";
        c.alignment = { horizontal: h };
      }
      s.getCell("A2").value = 5;
      s.getCell("A2").note = "a note";
    });
    expect([1, 2, 3, 4].map((c) => ws.getCell(1, c).alignment?.horizontal)).toEqual(["left", "right", "center", "fill"]);
    expect(ws.getCell("A2").value).toBe(5);
    const note = ws.getCell("A2").note;
    const text = typeof note === "string" ? note : note.texts?.map((t) => t.text).join("");
    expect(text).toBe("a note");
  });

  it("keeps a string that starts with = as a string", async () => {
    const ws = await roundTrip((s) => {
      s.getCell("A1").value = "=SUM(A1)";
    });
    expect(ws.getCell("A1").value).toBe("=SUM(A1)");
    expect(ws.getCell("A1").formula).toBeUndefined();
  });

  it("keeps 0.1 exactly and turns -0 into 0", async () => {
    const ws = await roundTrip((s) => {
      s.getCell("A1").value = 0.1;
      s.getCell("A2").value = -0;
    });
    expect(ws.getCell("A1").value).toBe(0.1);
    expect(ws.getCell("A2").value).toBe(0);
    expect(Object.is(ws.getCell("A2").value, -0)).toBe(false);
  });

  it("gives writeBuffer bytes that a Uint8Array copy keeps", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Sheet1").getCell("A1").value = 1;
    const buffer = await wb.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer);
    expect([...bytes]).toEqual([...new Uint8Array(buffer as ArrayBuffer)]);
    expect(bytes.length).toBe(buffer.byteLength);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});
