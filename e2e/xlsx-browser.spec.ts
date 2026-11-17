// The writer and the report renderer run in a browser (requirements 3, 4, 53): bundle a test-only
// entry with Vite into a temp folder, run it in Chromium on a blank page, and read the workbook it
// returns back with exceljs here.
import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
import { a1 } from "../src/parser/index.ts";
import { readXlsx } from "../tests/unit/helpers/xlsx-readback.ts";
import { CELLS, FORMULAS } from "./fixtures/xlsx-sheet.ts";

const outDir = mkdtempSync(join(tmpdir(), "lazarus-e2e-bundle-"));
test.afterAll(() => rmSync(outDir, { recursive: true, force: true }));

test("writeXlsx and renderReportHtml run in Chromium with no network request", async ({ page }) => {
  test.setTimeout(120_000);
  // The repo's vite.config.ts, so whatever it records for exceljs applies here too.
  await build({
    configFile: resolve("vite.config.ts"),
    logLevel: "warn",
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      lib: { entry: resolve("e2e/fixtures/xlsx-entry.ts"), name: "LazarusE2E", formats: ["iife"], fileName: () => "entry.js" },
    },
  });
  const bundle = readFileSync(join(outDir, "entry.js"), "utf8");

  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setContent("<!doctype html><title>bundle</title>");
  await page.addScriptTag({ content: bundle });
  const got = await page.evaluate(() => (globalThis as unknown as { LazarusE2E: { run: () => Promise<{ plain: boolean; bytes: number[]; notes: number; html: string }> } }).LazarusE2E.run());

  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  expect(got.plain).toBe(true);
  expect(got.notes).toBe(0);
  expect(got.html.startsWith("<!doctype html>")).toBe(true);
  expect(got.html).toContain("BOOK.WK1");
  expect(got.html).toContain("@SUM(A1..B1)");
  expect(got.html).not.toContain("<script");

  const bytes = Uint8Array.from(got.bytes);
  expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("PK");
  const back = await readXlsx(bytes);
  expect(back.sheetNames).toEqual(["Sheet1"]);
  expect([...back.cells.keys()].sort()).toEqual(CELLS.map((c) => a1(c.col, c.row)).sort());
  for (const c of CELLS) {
    const cell = back.cells.get(a1(c.col, c.row))!;
    if (c.kind === "number" || c.kind === "integer") expect(Object.is(cell.value, c.value), a1(c.col, c.row)).toBe(true);
    if (c.kind === "label") {
      expect(cell.value).toBe(c.text);
      expect(cell.alignment).toBe("center");
    }
    if (c.kind === "formula") {
      expect(cell.formula).toBe(FORMULAS[a1(c.col, c.row)]!.excel);
      expect(Object.is(cell.result, c.cached)).toBe(true);
    }
  }
});
