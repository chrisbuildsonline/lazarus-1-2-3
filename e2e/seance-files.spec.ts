// Drop and pick files (task 29; requirements 6 to 13, 15, 20 to 24, 58, 61). Expected names and
// counts come from fixtures/manifest.json, the fixtures folder and e2e/fixtures/seance-files.ts.
import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWk1 } from "../src/parser/index.ts";
import { corruptWk1, files, payload, type Payload } from "./fixtures/seance-files.ts";

const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string }[] };
const LOTUS = /\.wk[1s]$/i;
const base = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const fixture = (path: string) => payload(base(path), readFileSync(path));

const pickerInput = (page: Page) => page.locator('input[type="file"][accept]');
const folderInput = (page: Page) => page.locator('input[type="file"][webkitdirectory]');
const rowNames = (page: Page) => page.getByRole("listbox").locator(".batch-row__name");

/** A synthetic drop: Chromium only lets a page-built DataTransfer carry `files` (task 3 probe, finding d). */
async function drop(page: Page, target: string, parts: readonly Payload[]): Promise<{ dragover: boolean; drop: boolean }> {
  const wire = parts.map((p) => ({ name: p.name, bytes: [...p.buffer] }));
  return page.evaluate(
    ({ target, wire }) => {
      const dt = new DataTransfer();
      for (const f of wire) dt.items.add(new File([new Uint8Array(f.bytes)], f.name));
      const el = document.querySelector(target)!;
      const fire = (type: string) => el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
      // dispatchEvent returns false when a listener cancelled the default (the browser opening the file).
      return { dragover: !fire("dragover"), drop: !fire("drop") };
    },
    { target, wire },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Raise a Lotus 1-2-3 file" })).toBeVisible();
});

test("(a) a file dropped on the zone shows its sheet", async ({ page }) => {
  await drop(page, ".dropzone", [fixture("fixtures/formulas/formulas.wk1")]);
  await expect(page.getByRole("heading", { level: 1, name: "formulas.wk1" })).toBeVisible();
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("(b) three picked files show the batch list in path order", async ({ page }) => {
  const picked = ["fixtures/labels/labels.wk1", "fixtures/dates/dates.wk1", "fixtures/formulas/formulas.wk1"];
  await pickerInput(page).setInputFiles(picked.map(fixture));
  await expect(page.getByRole("heading", { level: 2, name: "3 files" })).toBeVisible();
  await expect(rowNames(page)).toHaveText(["dates.wk1", "formulas.wk1", "labels.wk1"]);
  await expect(page.getByRole("heading", { level: 1, name: "dates.wk1" })).toBeVisible();
});

test("(c) the fixtures folder gives one row per WK1 and WKS file and a skipped line", async ({ page }) => {
  const expected = manifest.fixtures.map((f) => f.path).filter((p) => LOTUS.test(p)).sort();
  const all = readdirSync("fixtures", { recursive: true, withFileTypes: true }).filter((d) => d.isFile());
  const skipped = all.filter((d) => !LOTUS.test(d.name));
  // The DBF and every LICENSE.txt are among the skipped ones.
  expect(skipped.map((d) => d.name)).toEqual(expect.arrayContaining(["ne_110m_land.dbf", "LICENSE.txt"]));
  expect(all.length - skipped.length).toBe(expected.length);

  await folderInput(page).setInputFiles("fixtures");
  await expect(page.getByRole("heading", { level: 2, name: `${expected.length} files` })).toBeVisible();
  await expect(rowNames(page)).toHaveText(expected.map(base));
  await expect(page.locator(".batch__skipped")).toHaveText(`${skipped.length} files skipped: not WK1 or WKS.`);
});

test("(d) a text file alone shows the calm unsupported panel", async ({ page }) => {
  await pickerInput(page).setInputFiles(files.notLotus());
  await expect(page.getByRole("heading", { level: 2, name: "This is not a WK1 or WKS file this version can read." })).toBeVisible();
  await expect(page.locator(".panel")).toContainText(".wk1");
  await expect(page.locator(".panel")).toContainText(".wks");
  await expect(page.locator(".btn-primary")).toHaveText("Choose another file");
  await expect(page.locator(".btn-primary")).toHaveCount(1);
  await expect(page.locator(".pill--danger, .panel--danger")).toHaveCount(0);
});

test("(e) a corrupt file shows the error panel with diagnostics", async ({ page }) => {
  await pickerInput(page).setInputFiles(files.corrupt());
  const panel = page.getByRole("alert");
  await expect(panel.getByRole("heading", { level: 2, name: "This file could not be raised." })).toBeVisible();
  await expect(panel.locator(".pill--danger")).toHaveText("Could not raise");
  const [diagnostic, ...rest] = parseWk1(corruptWk1()).diagnostics;
  expect(rest).toEqual([]);
  await expect(panel.locator(".mono-block__line")).toHaveText([`offset 0x${diagnostic!.offset.toString(16).padStart(4, "0").toUpperCase()}  ${diagnostic!.message}`]);
  await expect(page.locator(".btn-primary")).toHaveText("Try another file");
});

test("(f) a drop beside the zone is cancelled and the page stays", async ({ page }) => {
  const url = page.url();
  const cancelled = await drop(page, ".summon__foot", [files.notLotus()]);
  expect(cancelled).toEqual({ dragover: true, drop: true });
  expect(page.url()).toBe(url);
  await expect(page.locator("h1")).toHaveCount(1);
});

test("(g) a second summon while the first batch runs shows only the second batch", async ({ page }) => {
  const ksbase = readFileSync("fixtures/ksbase/KSBASE.WK1");
  const many = Array.from({ length: 40 }, (_, i) => payload(`k${String(i).padStart(2, "0")}.wk1`, ksbase));
  await pickerInput(page).setInputFiles(many);
  await expect(page.getByRole("heading", { level: 1, name: "k00.wk1" })).toBeVisible();
  // The first batch is still running: some rows wait or raise.
  await expect(page.locator('.batch-row[aria-busy="true"]').first()).toBeVisible();

  await drop(page, "main", [files.mismatch()]);
  await expect(page.getByRole("heading", { level: 1, name: "mismatch.wk1" })).toBeVisible();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  // Nothing of the first batch comes back later.
  await page.waitForTimeout(1500);
  await expect(page.getByRole("heading", { level: 1, name: "mismatch.wk1" })).toBeVisible();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByText("k39.wk1")).toHaveCount(0);
});
