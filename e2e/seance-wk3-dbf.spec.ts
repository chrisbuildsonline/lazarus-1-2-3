// A WK3 drop and a DBF drop (requirements 52 to 60, acceptance 6): sheet tabs, the WK3 formula
// decoded and matched against its stored value, the DBF as-read totals, axe at 1440 and 390, and a PNG of each
// view at both sizes in e2e/screenshots/ (attached to the report as well).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { files } from "./fixtures/seance-files.ts";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
] as const;
const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });

async function raise(page: Page, file: ReturnType<typeof files.wk3>) {
  await page.goto("/");
  await page.locator('input[type="file"][accept]').setInputFiles(file);
  await expect(h1(page, file.name)).toBeVisible();
}

async function check(page: Page, testInfo: TestInfo, label: string) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const severe = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(result.passes.length).toBeGreaterThan(0);
  expect(severe.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`), label).toEqual([]);
  const path = `e2e/screenshots/${label}.png`;
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(label, { path, contentType: "image/png" });
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth, `horizontal scroll on ${label}`).toBeLessThanOrEqual(clientWidth);
}

test("the subtitle names WK3 and dBase and the picker accepts both", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".summon__subtitle")).toContainText("WK3");
  await expect(page.locator(".summon__subtitle")).toContainText("dBase");
  await expect(page.locator('input[type="file"][accept]')).toHaveAttribute("accept", ".wk1,.wks,.wk3,.dbf");
});

test("a WK3 workbook shows sheet tabs and its formula matched against the stored value", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await raise(page, files.wk3());
  await expect(page.locator(".sheet__meta")).toContainText("WK3 · 3 sheets · 1 formulas");
  const tabs = page.getByRole("tablist", { name: "Sheets in this workbook" }).getByRole("tab");
  await expect(tabs).toHaveText(["A", "B", "Totals"]);
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await tabs.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".totals")).toContainText("Matched");
  await page.locator('[role="grid"] [data-col="2"][data-row="1"]').click();
  const drawer = page.locator(".drawer");
  await expect(drawer).toContainText("Raised value matches what the file remembers.");
  await expect(drawer).toContainText("A2+B2");
  await expect(drawer).toContainText("7.5");
  // Choosing another sheet closes the drawer.
  await tabs.nth(0).click();
  await expect(drawer).toHaveCount(0);
  await tabs.nth(2).click();

  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    await check(page, test.info(), `wk3-${vp.name}`);
  }
});

test("a DBF table shows No formulas and the values as read, with no tabs and no proof bar", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await raise(page, files.dbf());
  await expect(page.locator(".sheet__meta")).toContainText("DBF · 0 formulas");
  await expect(page.getByRole("tablist", { name: "Sheets in this workbook" })).toHaveCount(0);
  // 2 field names + 2 live records x 2 fields (the deleted record is not shown).
  await expect(page.locator(".totals")).toContainText("No formulas");
  await expect(page.locator(".totals")).toContainText("6 values shown as read");
  await expect(page.locator(".totals .pill")).toHaveCount(0);
  await expect(page.locator('[role="grid"]')).toContainText("Chair");
  await expect(page.locator('[role="grid"]')).not.toContainText("Old");

  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    // The table is shown as a grid on a phone too: there are no formula cells to list.
    await expect(page.locator('[role="grid"]')).toContainText("Chair");
    await expect(page.getByRole("tablist", { name: "Filter by status" })).toHaveCount(0);
    await check(page, test.info(), `dbf-${vp.name}`);
  }
});
