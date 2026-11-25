// Layout, overflow and console (task 37; requirements 4, 75, 76). Every state at 1440x900 and 390x844:
// no horizontal scroll, no console error, no page error, no failed request, and a PNG attached to the
// report. No pixel baseline: fonts differ across machines.
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { files, payload } from "./fixtures/seance-files.ts";

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
] as const;
const PRIVACY = "Files never leave this browser. No upload, no account.";
const ksbase = () => payload("KSBASE.WK1", readFileSync("fixtures/ksbase/KSBASE.WK1"));
const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });

/** Records console errors, page errors and failed requests for the whole test. */
function watchProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  return problems;
}

async function snap(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth, `horizontal scroll on ${name}`).toBeLessThanOrEqual(clientWidth);
}

async function expectInViewport(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
}

/** At 390 the one primary pill sits 16px above the bottom edge. */
async function expectStickyPill(page: Page, name: string) {
  const box = (await page.getByRole("button", { name }).boundingBox())!;
  expect(box.y + box.height).toBeCloseTo(page.viewportSize()!.height - 16, 0);
}

async function raise(page: Page, file: ReturnType<typeof payload>) {
  await page.goto("/");
  await page.locator('input[type="file"][accept]').setInputFiles(file);
  await expect(h1(page, file.name)).toBeVisible();
}

for (const vp of VIEWPORTS) {
  const phone = vp.width < 641;

  test.describe(`at ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: phone });

    test("Summon view", async ({ page }, testInfo) => {
      const problems = watchProblems(page);
      await page.goto("/");
      await expect(h1(page, "Raise a Lotus 1-2-3 file")).toBeVisible();
      await snap(page, testInfo, `summon-${vp.name}`);
      if (phone) await expectStickyPill(page, "Summon the sample");
      else {
        await expectInViewport(page, h1(page, "Raise a Lotus 1-2-3 file"));
        await expectInViewport(page, page.getByRole("button", { name: "Summon the sample" }));
        await expectInViewport(page, page.getByRole("button", { name: /Drop a file or a whole folder here/ }));
        await expectInViewport(page, page.getByText(PRIVACY));
      }
      expect(problems).toEqual([]);
    });

    test("Sheet view of the sample", async ({ page }, testInfo) => {
      const problems = watchProblems(page);
      await page.goto("/");
      await page.getByRole("button", { name: "Summon the sample" }).click();
      await expect(h1(page, "KSBASE.WK1")).toBeVisible();
      await snap(page, testInfo, `sheet-ksbase-${vp.name}`);
      if (phone) await expectStickyPill(page, "Download XLSX");
      else {
        await expectInViewport(page, h1(page, "KSBASE.WK1"));
        await expectInViewport(page, page.getByRole("region", { name: "Totals" }));
        const rowsAboveFold = await page.getByRole("grid").locator('[role="row"]:has([role="gridcell"])').evaluateAll(
          (rows, h) => rows.filter((r) => r.getBoundingClientRect().bottom <= h).length,
          vp.height,
        );
        expect(rowsAboveFold).toBeGreaterThanOrEqual(14);
      }
      // The three downloads run without a console error either (requirement 76).
      for (const name of ["Download XLSX", "Download report (HTML)", "JSON"]) {
        const download = page.waitForEvent("download");
        await page.getByRole("button", { name, exact: true }).click();
        await download;
      }
      expect(problems).toEqual([]);
    });

    test("Sheet view of mixed-status.wk1, then with the cell open", async ({ page }, testInfo) => {
      const problems = watchProblems(page);
      await raise(page, files.mixedStatus());
      await snap(page, testInfo, `sheet-mixed-${vp.name}`);
      if (phone) {
        await page.locator('.status-row[data-address="C1"]').tap();
        await expect(page.getByRole("dialog", { name: "Cell C1" })).toBeVisible();
        // A cell transition the sweep's end replaced is cancelled, not failed: wait without rejecting.
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
        await snap(page, testInfo, `dialog-mixed-${vp.name}`);
      } else {
        await page.locator('[role="gridcell"][aria-label^="C1,"]').click();
        await expect(page.getByRole("complementary", { name: "Cell C1" })).toBeVisible();
        // A cell transition the sweep's end replaced is cancelled, not failed: wait without rejecting.
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
        await snap(page, testInfo, `drawer-mixed-${vp.name}`);
      }
      expect(problems).toEqual([]);
    });

    test("batch with a file that has no formulas", async ({ page }, testInfo) => {
      const problems = watchProblems(page);
      await page.goto("/");
      await page.locator('input[type="file"][accept]').setInputFiles([files.noFormulas(), files.mismatch(), ksbase()]);
      await expect(page.getByRole("heading", { level: 2, name: "3 files" })).toBeVisible();
      const row = page.getByRole("option").filter({ hasText: "constants.wk1" });
      await expect(row.locator(".batch-row__line")).toHaveText("No formulas");
      await expect(page.getByRole("listbox").locator(".pill")).toHaveCount(3);
      // Short names and lines fit the 320px panel whole, with no ellipsis.
      const cut = await page.locator(".batch-row__name, .batch-row__line").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
      expect(cut).toEqual([]);
      await snap(page, testInfo, `batch-${vp.name}`);
      expect(problems).toEqual([]);
    });
  });
}
