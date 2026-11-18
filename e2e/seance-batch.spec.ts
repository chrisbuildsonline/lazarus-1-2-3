// The batch (task 33; requirements 58 to 61). Expected names, reasons and counts come from the
// fixtures, parseWk1 and e2e/fixtures/seance-files.ts.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseWk1 } from "../src/parser/index.ts";
import { corruptWk1, files, payload } from "./fixtures/seance-files.ts";

const ksbase = () => payload("KSBASE.WK1", readFileSync("fixtures/ksbase/KSBASE.WK1"));
const corruptReason = parseWk1(corruptWk1()).diagnostics.find((d) => d.severity === "error")!.message;

const list = (page: Page) => page.getByRole("listbox");
const row = (page: Page, name: string) => list(page).getByRole("option").filter({ has: page.locator(".batch-row__name", { hasText: name }) });
const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });

async function summonBatch(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"][accept]').setInputFiles([files.notLotus(), files.mismatch(), ksbase(), files.corrupt()]);
  await expect(page.getByRole("heading", { level: 2, name: "3 files" })).toBeVisible();
  // The first raised file opens on its own.
  await expect(h1(page, "KSBASE.WK1")).toBeVisible();
  await expect(row(page, "mismatch.wk1").locator(".pill")).toBeVisible();
}

test("rows, pills, the skipped line, choosing a row and downloads of the chosen file", async ({ page }) => {
  await summonBatch(page);
  await expect(list(page).locator(".batch-row__name")).toHaveText(["KSBASE.WK1", "corrupt.wk1", "mismatch.wk1"]);

  const k = row(page, "KSBASE.WK1");
  await expect(k.locator(".batch-row__line")).toHaveText("100.0% verified");
  await expect(k.locator(".pill.pill--matched")).toHaveText("Matched");
  await expect(k).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "mismatch.wk1").locator(".pill.pill--mismatched")).toHaveText("Mismatched");
  const c = row(page, "corrupt.wk1");
  await expect(c.locator(".pill.pill--danger")).toHaveText("Failed");
  await expect(c.locator(".batch-row__line")).toHaveText(`Could not raise: ${corruptReason}`);
  await expect(page.locator(".batch__skipped")).toHaveText("1 file skipped: not a Lotus or dBase file.");

  // Open a drawer on KSBASE, then choose the mismatch row: its sheet opens and the drawer closes.
  const grid = page.getByRole("grid");
  await grid.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await grid.locator('[role="gridcell"][aria-label^="O3,"]').click();
  await expect(page.getByRole("complementary")).toHaveCount(1);
  await row(page, "mismatch.wk1").click();
  await expect(h1(page, "mismatch.wk1")).toBeVisible();
  await expect(row(page, "mismatch.wk1")).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "mismatch.wk1")).toHaveClass(/is-selected/);
  await expect(k).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("complementary")).toHaveCount(0);

  // Downloads act on the selected file.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download XLSX", exact: true }).click()]);
  expect(download.suggestedFilename()).toBe("mismatch.xlsx");
});

test("the list works with Up, Down and Enter and keeps the focus", async ({ page }) => {
  await summonBatch(page);
  await row(page, "KSBASE.WK1").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(row(page, "mismatch.wk1")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(h1(page, "mismatch.wk1")).toBeVisible();
  await expect(row(page, "mismatch.wk1")).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "mismatch.wk1")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(row(page, "KSBASE.WK1")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(h1(page, "KSBASE.WK1")).toBeVisible();
  await expect(row(page, "KSBASE.WK1")).toBeFocused();
});

test("a single file over 32 MiB names the size limit, not the extensions", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"][accept]').setInputFiles({ name: "BIG.WK1", mimeType: "application/octet-stream", buffer: Buffer.alloc(32 * 1024 * 1024 + 1) });
  await expect(page.getByRole("heading", { level: 2, name: "1 file skipped: larger than 32 MiB." })).toBeVisible();
  await expect(page.getByText("not a Lotus or dBase file")).toHaveCount(0);
});

test("at 390 the batch list is its own block above the totals and Back to files returns to it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await summonBatch(page);
  const totals = page.getByRole("region", { name: "Totals" });
  const listBox = (await page.locator(".batch").boundingBox())!;
  const totalsBox = (await totals.boundingBox())!;
  expect(listBox.y + listBox.height).toBeLessThanOrEqual(totalsBox.y);
  expect(listBox.width).toBeGreaterThan(300);

  await row(page, "mismatch.wk1").click();
  await expect(h1(page, "mismatch.wk1")).toBeVisible();
  const back = page.getByRole("button", { name: "Back to files" });
  await back.scrollIntoViewIfNeeded();
  await back.click();
  await expect(row(page, "mismatch.wk1")).toBeFocused();
  await expect(row(page, "mismatch.wk1")).toBeInViewport();
});
