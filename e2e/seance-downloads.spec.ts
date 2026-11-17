// Downloads (task 32; requirements 32, 52 to 57). Expected values come from fixtures/manifest.json,
// tests/differential/verify/golden.json, package.json, parseWk1 and the bytes of mismatch.wk1.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { a1, parseWk1 } from "../src/parser/index.ts";
import { readXlsx } from "../tests/unit/helpers/xlsx-readback.ts";
import { files } from "./fixtures/seance-files.ts";

const KSBASE = "fixtures/ksbase/KSBASE.WK1";
type Entry = { path: string; sha256: string; counts: { cells: number }; expectedValues: { cell: string; cached: number | string }[] };
const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: Entry[] };
const golden = JSON.parse(readFileSync("tests/differential/verify/golden.json", "utf8")) as Record<string, unknown>;
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
const entry = manifest.fixtures.find((f) => f.path === KSBASE)!;
const o3Cached = entry.expectedValues.find((c) => c.cell === "O3")!.cached;
const lotusAddresses = new Set([...parseWk1(new Uint8Array(readFileSync(KSBASE))).sheet.cells.values()].map((c) => a1(c.col, c.row)));

async function save(page: Page, name: string): Promise<{ file: string; bytes: Buffer }> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name, exact: true }).click()]);
  const path = await download.path();
  return { file: download.suggestedFilename(), bytes: readFileSync(path) };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("KSBASE: the workbook, the two reports, the toast and byte-equal repeats", async ({ page }) => {
  await page.getByRole("button", { name: "Summon the sample" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "KSBASE.WK1" })).toBeVisible();

  const xlsx = await save(page, "Download XLSX");
  expect(xlsx.file).toBe("KSBASE.xlsx");
  await expect(page.getByRole("status").filter({ hasText: "Download started: KSBASE.xlsx" })).toBeVisible();
  // The button is back from "Preparing…" once the download started.
  await expect(page.getByRole("button", { name: "Download XLSX", exact: true })).not.toHaveAttribute("aria-disabled", "true");

  const back = await readXlsx(new Uint8Array(xlsx.bytes));
  expect(back.cells.size).toBe(entry.counts.cells);
  for (const address of back.cells.keys()) expect(lotusAddresses.has(address), address).toBe(true);
  const o3 = back.cells.get("O3")!;
  expect(o3.formula).not.toBeNull();
  expect(o3.result).toBe(o3Cached);
  expect(String(o3.result)).toBe("0.25153768659966846");

  const again = await save(page, "Download XLSX");
  expect(Buffer.compare(again.bytes, xlsx.bytes)).toBe(0);

  const html = await save(page, "Download report (HTML)");
  expect(html.file).toBe("KSBASE.report.html");
  const text = html.bytes.toString("utf8");
  expect(text).toContain("KSBASE.WK1");
  expect(text).toContain(entry.sha256);
  expect(text).not.toContain("<script");

  const json = await save(page, "JSON");
  expect(json.file).toBe("KSBASE.report.json");
  const report = JSON.parse(json.bytes.toString("utf8")) as { totals: Record<string, unknown>; source: { sha256: string }; tool: { version: string } };
  // golden.json also holds groups and candidate opcodes; the totals are its Totals fields.
  const g = golden[KSBASE] as Record<string, unknown>;
  const keys = ["formulas", "matched", "mismatched", "unverifiable", "exact", "withinTolerance", "byReason"];
  expect(Object.keys(report.totals).sort()).toEqual([...keys].sort());
  expect(report.totals).toEqual(Object.fromEntries(keys.map((k) => [k, g[k]])));
  expect(report.source.sha256).toBe(entry.sha256);
  expect(report.tool.version).toBe(version);
});

test("mismatch.wk1: the workbook keeps the stored 6 in C1, not the raised 5", async ({ page }) => {
  await page.locator('input[type="file"][accept]').setInputFiles(files.mismatch());
  await expect(page.getByRole("heading", { level: 1, name: "mismatch.wk1" })).toBeVisible();
  const xlsx = await save(page, "Download XLSX");
  expect(xlsx.file).toBe("mismatch.xlsx");
  const c1 = (await readXlsx(new Uint8Array(xlsx.bytes))).cells.get("C1")!;
  expect(c1.formula).not.toBeNull();
  expect(c1.result).toBe(6);
});
