// Accessibility (task 36; requirements 67 to 72). axe with the WCAG 2.0/2.1 A and AA tags and
// best-practice on every view of this feature, under reduced motion; the Sheet view once more with
// motion after the solidify animation ends. Zero serious or critical violations; lesser ones are
// printed and attached. No rule is disabled.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { files, payload } from "./fixtures/seance-files.ts";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const ksbase = () => payload("KSBASE.WK1", readFileSync("fixtures/ksbase/KSBASE.WK1"));
const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });

async function scan(page: Page, testInfo: TestInfo, label: string) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const lesser = result.violations.filter((v) => v.impact !== "serious" && v.impact !== "critical");
  const severe = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = (vs: typeof result.violations) => vs.map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  if (lesser.length > 0) console.log(`[axe ${label}] lesser findings:\n${summary(lesser).join("\n")}`);
  await testInfo.attach(`axe-${label}.json`, { body: JSON.stringify(result.violations, null, 2), contentType: "application/json" });
  expect(result.passes.length, `axe ran rules on ${label}`).toBeGreaterThan(0);
  expect(summary(severe), `serious or critical axe violations on ${label}`).toEqual([]);
}

async function sample(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Summon the sample" }).click();
  await expect(h1(page, "KSBASE.WK1")).toBeVisible();
}

async function raise(page: Page, file: ReturnType<typeof payload>) {
  await page.goto("/");
  await page.locator('input[type="file"][accept]').setInputFiles(file);
  await expect(h1(page, file.name)).toBeVisible();
}

/** Presses Tab until the target holds focus, so :focus-visible comes from the keyboard. */
async function tabTo(page: Page, target: Locator, max = 80) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab never reached the target");
}

/** The computed box-shadow that --focus-ring resolves to. */
const focusRing = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.boxShadow = "var(--focus-ring)";
    document.body.append(probe);
    const value = getComputedStyle(probe).boxShadow;
    probe.remove();
    return value;
  });

async function expectRing(page: Page, target: Locator) {
  await tabTo(page, target);
  expect(await target.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
  expect(await target.evaluate((el) => getComputedStyle(el).boxShadow)).toBe(await focusRing(page));
}

test.describe("axe under reduced motion", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("Summon view", async ({ page }, testInfo) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await expect(h1(page, "Raise a Lotus 1-2-3 file")).toBeVisible();
    await scan(page, testInfo, "summon");
  });

  test("failed-file view", async ({ page }, testInfo) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.locator('input[type="file"][accept]').setInputFiles(files.corrupt());
    await expect(page.getByRole("heading", { name: "This file could not be raised." })).toBeVisible();
    await scan(page, testInfo, "failed");
  });

  test("Sheet view at 1440, then with the drawer open", async ({ page }, testInfo) => {
    await page.setViewportSize(DESKTOP);
    await raise(page, files.mixedStatus());
    await scan(page, testInfo, "sheet-1440");
    await page.locator('[role="gridcell"][aria-label^="C1,"]').click();
    await expect(page.getByRole("complementary", { name: "Cell C1" })).toBeVisible();
    await scan(page, testInfo, "drawer-1440");
  });

  test("Sheet view at 390, then with the dialog open", async ({ page }, testInfo) => {
    await page.setViewportSize(PHONE);
    await raise(page, files.mixedStatus());
    await scan(page, testInfo, "sheet-390");
    await page.locator('.status-row[data-address="C1"]').click();
    await expect(page.getByRole("dialog", { name: "Cell C1" })).toBeVisible();
    await scan(page, testInfo, "dialog-390");
  });

  test("batch view", async ({ page }, testInfo) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.locator('input[type="file"][accept]').setInputFiles([files.notLotus(), files.mismatch(), ksbase(), files.corrupt()]);
    await expect(page.getByRole("heading", { level: 2, name: "3 files" })).toBeVisible();
    await expect(page.getByRole("listbox").locator(".pill")).toHaveCount(3);
    await scan(page, testInfo, "batch");
  });
});

test("Sheet view with motion, after the solidify animation ends", async ({ page }, testInfo) => {
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await sample(page);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  await scan(page, testInfo, "sheet-motion");
});

test("keyboard focus shows the focus ring on each kind of control", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  await expectRing(page, page.getByRole("button", { name: "Summon the sample" }));
  await expectRing(page, page.getByRole("button", { name: "Choose file" }));
  // Keyboard alone (requirement 69): Enter opens the picker, and the chosen file is raised.
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles(files.mixedStatus());
  await expect(h1(page, "mixed-status.wk1")).toBeVisible();

  // The filters are one tab stop (roving tabindex): Tab reaches the selected one, arrows move on.
  await expectRing(page, page.getByRole("tab", { selected: true }));
  await page.keyboard.press("ArrowRight");
  const next = page.getByRole("tab", { name: /^Matched/ });
  await expect(next).toBeFocused();
  expect(await next.evaluate((el) => getComputedStyle(el).boxShadow)).toBe(await focusRing(page));
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true");
  const grid = page.getByRole("grid");
  await expectRing(page, grid.locator('[role="gridcell"][tabindex="0"]'));
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(grid.locator('[role="gridcell"][aria-label^="C1,"]')).toBeFocused();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("complementary", { name: "Cell C1" });
  await expect(drawer).toBeVisible();
  await expectRing(page, drawer.getByRole("button", { name: "Close cell details" }));
  await expectRing(page, page.getByRole("button", { name: "Download XLSX" }));
  const download = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  expect((await download).suggestedFilename()).toBe("mixed-status.xlsx");
});

test("every status reads as text in the grid, the drawer and the batch rows", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  await page.locator('input[type="file"][accept]').setInputFiles([files.mixedStatus(), files.corrupt()]);
  await expect(h1(page, "mixed-status.wk1")).toBeVisible();
  for (const [address, status] of [["C1", "Mismatched"], ["D1", "Unverifiable"], ["A2", "Matched"]] as const) {
    await expect(page.locator(`[role="gridcell"][aria-label^="${address},"]`)).toHaveAccessibleName(new RegExp(`, ${status}$`));
  }
  await page.locator('[role="gridcell"][aria-label^="C1,"]').click();
  await expect(page.getByRole("complementary", { name: "Cell C1" }).locator(".pill")).toHaveText("Mismatched");
  const options = page.getByRole("listbox").getByRole("option");
  await expect(options.filter({ hasText: "mixed-status.wk1" })).toHaveAccessibleName(/Mismatched/);
  await expect(options.filter({ hasText: "corrupt.wk1" })).toHaveAccessibleName(/Failed/);
});

test.describe("on a phone", () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test("statuses in the list carry text, controls are 44px, the pill is 48px", async ({ page }) => {
    await page.goto("/");
    const tooSmall = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("button, a[href], input:not([type=file]), [role=tab], [role=option]")]
          .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden")
          .filter((el) => el.getBoundingClientRect().height < 44)
          .map((el) => `${el.tagName} ${el.className} "${el.textContent?.trim()}" ${el.getBoundingClientRect().height}px`),
      );
    expect(await tooSmall()).toEqual([]);
    const primary = page.getByRole("button", { name: "Summon the sample" });
    expect((await primary.boundingBox())!.height).toBe(48);

    await page.locator('input[type="file"][accept]').setInputFiles(files.mixedStatus());
    await expect(h1(page, "mixed-status.wk1")).toBeVisible();
    expect(await tooSmall()).toEqual([]);
    expect((await page.getByRole("button", { name: "Download XLSX" }).boundingBox())!.height).toBe(48);
    await expect(page.locator('.status-row[data-address="C1"]')).toHaveAccessibleName(/, Mismatched$/);
    await expect(page.locator('.status-row[data-address="D1"]')).toHaveAccessibleName(/, Unverifiable$/);

    await page.locator('.status-row[data-address="C1"]').tap();
    const dialog = page.getByRole("dialog", { name: "Cell C1" });
    await expect(dialog.locator(".pill")).toHaveText("Mismatched");
    expect(await tooSmall()).toEqual([]);
  });
});
