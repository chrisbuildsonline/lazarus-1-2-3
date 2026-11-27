// The real mismatch, one click from the Summon view: NOAA's m21tab.wk3 (1991, public domain) opens
// filtered to Mismatched with V44 in the drawer, the stored value next to ERR and the cause (the file
// no longer holds C44). Expected values come from verifyWorkbookBytes on the fixture, never from the
// page. Also the phone polish on the same screens: the sticky pill never covers the fine print, and
// all four filter tabs fit. Axe at both sizes, no console errors, a PNG of each in e2e/screenshots/.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { verifyWorkbookBytes } from "../src/verify/index.ts";
import { formatNumber } from "../src/ui/model/format-value.ts";

const M21 = "fixtures/noaa-ala-wai-m21/m21tab.wk3";
const [v] = verifyWorkbookBytes(new Uint8Array(readFileSync(M21))).verifications;
const v44 = v!.cells.find((c) => c.address === "V44")!;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });

function watch(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function axe(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const severe = result.violations.filter((x) => x.impact === "serious" || x.impact === "critical");
  expect(severe.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(" ")).join(", ")}`), label).toEqual([]);
}

async function openMismatch(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Open a real mismatch/ }).click();
  await expect(h1(page, "m21tab.wk3")).toBeVisible();
}

test("the engine's view of V44, before the page is asked", () => {
  expect(v!.totals).toMatchObject({ formulas: 8, matched: 7, mismatched: 1, unverifiable: 0 });
  expect(v44.status).toBe("mismatched");
  expect(v44.lotusFormula).toBe("L44/C44");
  expect(v44.recalculated).toEqual({ t: "err" });
  expect(v44.inputs?.find((i) => i.address === "C44")?.kind).toBe("empty");
});

test("1440: one click opens m21tab.wk3 on V44, a red cell beside its cause", async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openMismatch(page);

  // Totals from the engine; the filter starts on Mismatched.
  await expect(page.getByRole("region", { name: "Totals" }).getByRole("img")).toHaveAttribute("aria-label", "7 matched, 1 mismatched, 0 unverifiable");
  await expect(page.getByRole("tab", { name: /^Mismatched/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".sheet__meta")).toContainText("NOAA");

  // The red cell, in view in the grid, selected.
  const cell = page.getByRole("grid").locator('[role="gridcell"][aria-label^="V44,"]');
  await expect(cell).toHaveAttribute("aria-label", /Mismatched$/);
  await expect(cell).toHaveClass(/is-selected/);
  await expect(cell).toBeInViewport();

  // Its cause, in the drawer next to it: stored value, ERR, and why.
  const drawer = page.getByRole("complementary", { name: "Cell V44" });
  await expect(drawer.locator(".pill")).toHaveText("Mismatched");
  await expect(drawer.locator(".stat__value")).toHaveText([formatNumber((v44.cached as { v: number }).v), "ERR"]);
  const cause = drawer.locator(".drawer__cause");
  await expect(cause).toBeInViewport();
  await expect(cause).toContainText("the file no longer holds C44");
  await expect(drawer.locator(".drawer__input.is-missing")).toHaveText(/C44\s*empty/);
  const box = (await cell.boundingBox())!;
  const panel = (await drawer.boundingBox())!;
  expect(box.x + box.width, "the cell is not under the drawer").toBeLessThanOrEqual(panel.x);

  await page.waitForTimeout(2600); // the sweep (at most 2.5 s) ends before the picture
  await axe(page, "mismatch-1440");
  await page.screenshot({ path: "e2e/screenshots/mismatch-1440.png", animations: "disabled" });
  expect(errors).toEqual([]);
});

test("390: the mismatch opens as a sheet with the cause, and the list behind it shows the red row", async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openMismatch(page);

  const dialog = page.getByRole("dialog", { name: "Cell V44" });
  await expect(dialog.locator(".pill")).toHaveText("Mismatched");
  await expect(dialog.locator(".stat__value").nth(1)).toHaveText("ERR");
  await expect(dialog.locator(".drawer__cause")).toContainText("the file no longer holds C44");
  await expect(dialog.locator(".drawer__cause")).toBeInViewport();
  await axe(page, "mismatch-390");
  await page.screenshot({ path: "e2e/screenshots/mismatch-390.png", animations: "disabled" });

  await dialog.getByRole("button", { name: "Back to list" }).click();
  await expect(page.locator('.status-row[data-address="V44"]')).toBeVisible();

  // All four filter tabs fit on the phone: none is cut off at the edge or scrolled away.
  const tabs = page.getByRole("tablist", { name: "Filter by status" }).getByRole("tab");
  await expect(tabs).toHaveCount(4);
  for (const tab of await tabs.all()) {
    const b = (await tab.boundingBox())!;
    expect(b.x, await tab.innerText()).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, await tab.innerText()).toBeLessThanOrEqual(390);
  }
  expect(errors).toEqual([]);
});

test("390: the sticky pill never covers the fine print, and the mismatch sample sits under the title", async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const pill = page.getByRole("button", { name: "Summon the sample" });
  const alt = page.getByRole("button", { name: /Open a real mismatch/ });
  await expect(alt).toBeInViewport();
  expect((await alt.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // At the end of the page, the limits line ends above the pill with room to spare.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const limits = (await page.locator(".summon__limits").boundingBox())!;
  const top = (await pill.boundingBox())!.y;
  expect(limits.y + limits.height, "limits line clears the pill").toBeLessThanOrEqual(top - 16);

  // While scrolling, text passing behind the pill fades into the canvas instead of running under it.
  const veil = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector(".page")!, "::after");
    return { position: s.position, image: s.backgroundImage, events: s.pointerEvents };
  });
  expect(veil.position).toBe("fixed");
  expect(veil.image).toContain("gradient");
  expect(veil.events).toBe("none");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/summon-390-polish.png", animations: "disabled" });
  expect(errors).toEqual([]);
});

test("1440: the mismatch chip sits right under the one pill, above the fold", async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".btn-primary")).toHaveCount(1);
  const pill = (await page.getByRole("button", { name: "Summon the sample" }).boundingBox())!;
  const alt = (await page.getByRole("button", { name: /Open a real mismatch/ }).boundingBox())!;
  expect(alt.y - (pill.y + pill.height), "chip close under the pill").toBeLessThanOrEqual(16);
  expect(Math.abs(alt.x + alt.width / 2 - (pill.x + pill.width / 2)), "centred under the pill").toBeLessThanOrEqual(1);
  await expect(page.locator(".summon__privacy")).toBeVisible();
  await axe(page, "summon-1440");
  await page.screenshot({ path: "test-results/summon-1440-mismatch.png", animations: "disabled" });
  expect(errors).toEqual([]);
});
