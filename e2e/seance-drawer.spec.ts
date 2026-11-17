// Grid keyboard and the cell drawer (task 30; requirements 38, 42 to 49). Expected strings come from
// fixtures/manifest.json, parseWk1, translateFormula and printLotus, and the bytes of mismatch.wk1.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { columnLetters } from "../src/ui/model/grid-model.ts";
import { LAYOUT } from "../src/ui/model/layout.ts";
import { printLotus, translateFormula } from "../src/formula/index.ts";
import { parseWk1 } from "../src/parser/index.ts";
import { verifyBytes } from "../src/verify/index.ts";
import { files, mismatchWk1 } from "./fixtures/seance-files.ts";

const KSBASE = "fixtures/ksbase/KSBASE.WK1";
const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; expectedValues: { cell: string; cached: number }[] }[] };
const o3Cached = manifest.fixtures.find((f) => f.path === KSBASE)!.expectedValues.find((c) => c.cell === "O3")!.cached;
const sheet = parseWk1(new Uint8Array(readFileSync(KSBASE))).sheet;
const o3 = [...sheet.cells.values()].find((c) => c.col === 14 && c.row === 2)!;
if (o3.kind !== "formula") throw new Error("O3 is not a formula in KSBASE.WK1");
const o3Excel = translateFormula(o3.rpn, { col: 14, row: 2 });
const o3Lotus = printLotus(o3Excel.ast!);

const focused = (page: Page) => page.locator(":focus");
const grid = (page: Page) => page.getByRole("grid");
const drawer = (page: Page) => page.getByRole("complementary");
const cellAt = (page: Page, address: string) => grid(page).locator(`[role="gridcell"][aria-label^="${address},"], [role="gridcell"][aria-label="${address}"]`);

async function focusedAddress(page: Page): Promise<string> {
  const name = (await focused(page).getAttribute("aria-label")) ?? "";
  return name.split(",")[0]!;
}

async function openKsbase(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Summon the sample" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "KSBASE.WK1" })).toBeVisible();
}

async function tabToGrid(page: Page): Promise<Locator> {
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if ((await focused(page).getAttribute("role")) === "gridcell") return focused(page);
  }
  throw new Error("Tab never reached the grid");
}

test("the grid is one tab stop and the arrows, Home, End and PageDown move the focus", async ({ page }) => {
  await openKsbase(page);
  await tabToGrid(page);
  expect(await focusedAddress(page)).toBe("A1");

  await page.keyboard.press("ArrowRight");
  expect(await focusedAddress(page)).toBe("B1");
  await page.keyboard.press("ArrowDown");
  expect(await focusedAddress(page)).toBe("B2");
  await page.keyboard.press("ArrowLeft");
  expect(await focusedAddress(page)).toBe("A2");
  await page.keyboard.press("ArrowUp");
  expect(await focusedAddress(page)).toBe("A1");

  const colCount = Number(await grid(page).getAttribute("aria-colcount"));
  await page.keyboard.press("End");
  expect(await focusedAddress(page)).toBe(`${columnLetters(colCount - 2)}1`);
  await page.keyboard.press("Home");
  expect(await focusedAddress(page)).toBe("A1");

  const pageRows = await grid(page).evaluate((el, l) => Math.floor((el.clientHeight - l.headerHeight) / l.rowHeight), LAYOUT);
  await page.keyboard.press("PageDown");
  expect(await focusedAddress(page)).toBe(`A${1 + pageRows}`);
  await expect(focused(page)).toBeInViewport();
});

test("Enter on O3 opens the drawer, arrows move it, Escape and the close button return focus", async ({ page }) => {
  await openKsbase(page);
  await tabToGrid(page);

  // Enter on a label opens nothing.
  await page.keyboard.press("Enter");
  await expect(drawer(page)).toHaveCount(0);

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  for (let i = 0; i < 14; i++) await page.keyboard.press("ArrowRight");
  expect(await focusedAddress(page)).toBe("O3");
  await page.keyboard.press("Enter");

  const panel = drawer(page);
  await expect(panel).toHaveAccessibleName("Cell O3");
  await expect(panel.locator(".drawer__address")).toHaveText("O3");
  await expect(panel.locator(".pill")).toHaveText("Matched");
  await expect(panel).toContainText("Raised value matches what the file remembers.");
  await expect(panel.locator(".drawer__formula .mono-block")).toHaveText([o3Lotus, o3Excel.excel!]);
  await expect(panel.locator(".stat__label")).toHaveText(["Remembered (cached in the file)", "Raised (recalculated)"]);
  await expect(panel.locator(".stat__value")).toHaveText([String(o3Cached), String(o3Cached)]);
  expect(await focusedAddress(page)).toBe("O3");
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: "Cell O3 details open, Matched" })).toHaveCount(1);

  // The drawer follows the focused formula cell: N3 is one too.
  await page.keyboard.press("ArrowLeft");
  await expect(drawer(page)).toHaveAccessibleName("Cell N3");
  await page.keyboard.press("ArrowRight");
  await expect(drawer(page)).toHaveAccessibleName("Cell O3");

  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")?.split(",")[0])).toBe("O3");

  // Tab from the cell reaches the drawer's close button; it closes and focus goes back to the cell.
  await page.keyboard.press("Enter");
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(focused(page)).toHaveAccessibleName("Close cell details");
  await page.keyboard.press("Enter");
  await expect(drawer(page)).toHaveCount(0);
  expect(await focusedAddress(page)).toBe("O3");

  // A click on a formula cell opens it too.
  await cellAt(page, "N3").click();
  await expect(drawer(page)).toHaveAccessibleName("Cell N3");
});

test("the grid sizes equal LAYOUT", async ({ page }) => {
  await openKsbase(page);
  const sizes = await page.evaluate(() => ({
    row: document.querySelector(".grid__row")!.getBoundingClientRect().height,
    head: document.querySelector(".grid__head")!.getBoundingClientRect().height,
    col: document.querySelector('[role="gridcell"][aria-colindex="2"]')!.getBoundingClientRect().width,
    rowHead: document.querySelector(".grid__rowhead")!.getBoundingClientRect().width,
  }));
  expect(sizes).toEqual({ row: LAYOUT.rowHeight, head: LAYOUT.headerHeight, col: LAYOUT.colWidth, rowHead: LAYOUT.rowHeaderWidth });
});

test("a mismatched cell shows both values, the difference, the tolerance and its inputs", async ({ page }) => {
  const result = verifyBytes(mismatchWk1());
  const c1 = result.verification.cells.find((c) => c.address === "C1")!;
  expect(c1.status).toBe("mismatched");
  const num = (v: typeof c1.cached) => (v?.t === "num" ? v.v : NaN);
  const [cached, raised] = [num(c1.cached), num(c1.recalculated)];
  expect([cached, raised]).toEqual([6, 5]);
  const { relative, absolute } = result.verification.tolerance;

  await page.goto("/");
  await page.locator('input[type="file"][accept]').setInputFiles(files.mismatch());
  await expect(page.getByRole("heading", { level: 1, name: "mismatch.wk1" })).toBeVisible();
  const cell = cellAt(page, "C1");
  await expect(cell).toHaveClass(/cell--mismatched/);
  await cell.click();

  const panel = drawer(page);
  await expect(panel).toHaveAccessibleName("Cell C1");
  await expect(panel.locator(".stat__value")).toHaveText([String(cached), String(raised)]);
  await expect(panel.locator(".drawer__difference")).toHaveText(`Differs by ${raised - cached}. Tolerance ${relative} relative, ${absolute} absolute.`);
  await expect(panel.locator(".drawer__input dt")).toHaveText(["A1", "B1"]);
});
