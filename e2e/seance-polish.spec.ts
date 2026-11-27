// F19, the polish from jury run 158. At 390 the sticky pill covers no line of text, at first view or at
// the end of the scroll; the phone drawer is a bottom sheet that leaves the red row in view above it
// (V44 of NOAA's m21tab.wk3, with the cause C44 empty); a grid value cut by an ellipsis shows in full
// on hover and on keyboard focus. Expected values come from verifyWorkbookBytes, never the page.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { verifyWorkbookBytes } from "../src/verify/index.ts";
import { formatNumber } from "../src/ui/model/format-value.ts";

const M21 = "fixtures/noaa-ala-wai-m21/m21tab.wk3";
const [v] = verifyWorkbookBytes(new Uint8Array(readFileSync(M21))).verifications;
const v44 = v!.cells.find((c) => c.address === "V44")!;
const V44_REMEMBERED = formatNumber((v44.cached as { v: number }).v);
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
/** The jury's phone and ours. */
const PHONES = [
  { width: 390, height: 844 },
  { width: 375, height: 812 },
];
/** The veil above the pill (DESIGN.md 4.1): text inside it fades out, so it counts as covered. */
const VEIL = 16;

type Box = { x: number; y: number; width: number; height: number };

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

/**
 * Every line of text on the page (not the pill's own label, not hidden text) that reaches into the
 * band from the veil's top to the bottom of the viewport, so the pill or its veil covers part of it.
 * A line wholly below the viewport is not covered, only not yet scrolled to.
 */
async function cutByPill(page: Page, pill: Locator): Promise<string[]> {
  const top = (await pill.boundingBox())!.y - VEIL;
  return page.evaluate((top) => {
    const vh = window.innerHeight;
    const cut: string[] = [];
    const walker = document.createTreeWalker(document.querySelector(".page")!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim();
      const el = n.parentElement;
      if (!text || !el || el.closest(".primary-sticky, .visually-hidden, [aria-hidden='true']")) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width === 0 || r.height === 0) continue;
        if (r.bottom > top && r.top < vh) cut.push(`${text.slice(0, 40)} (${Math.round(r.top)}-${Math.round(r.bottom)}, veil from ${Math.round(top)})`);
      }
    }
    return cut;
  }, top);
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const vp of PHONES) {
  test(`${vp.width}x${vp.height}: the sticky pill covers no text on the Summon view, at first view or at the end`, async ({ page }) => {
    const errors = watch(page);
    await page.setViewportSize(vp);
    await page.goto("/");
    const pill = page.getByRole("button", { name: "Summon the sample" });
    await expect(pill).toBeVisible();
    expect(await cutByPill(page, pill), "first view").toEqual([]);
    // The privacy line stays readable at first view (DESIGN.md 4.1); the limits line waits below the fold.
    const privacy = (await page.locator(".summon__privacy").boundingBox())!;
    expect(privacy.y + privacy.height, "privacy line above the veil at first view").toBeLessThanOrEqual((await pill.boundingBox())!.y - VEIL);
    expect((await page.locator(".summon__limits").boundingBox())!.y, "limits line starts under the fold").toBeGreaterThanOrEqual(vp.height);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await cutByPill(page, pill), "end of scroll").toEqual([]);
    const limits = (await page.locator(".summon__limits").boundingBox())!;
    expect(limits.y + limits.height, "limits line above the veil at the end").toBeLessThanOrEqual((await pill.boundingBox())!.y - VEIL);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/f19-summon-${vp.width}.png`, animations: "disabled" });
    expect(errors).toEqual([]);
  });
}

for (const sample of ["Summon the sample", "Open a real mismatch"]) {
  test(`390: at the end of the Sheet view (${sample}) the sticky pill covers no text`, async ({ page }) => {
    const errors = watch(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: new RegExp(sample) }).click();
    await expect(page.locator(".status-list")).toBeVisible();
    const dialog = page.getByRole("dialog");
    if (sample !== "Summon the sample") await dialog.getByRole("button", { name: "Back to list" }).click();
    await expect(dialog).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await cutByPill(page, page.getByRole("button", { name: "Download XLSX" })), "end of scroll").toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const vp of PHONES) {
  test(`${vp.width}x${vp.height}: the red row V44 and its cause are on screen together`, async ({ page }) => {
    const errors = watch(page);
    await page.setViewportSize(vp);
    await page.goto("/");
    await page.getByRole("button", { name: /Open a real mismatch/ }).click();

    const dialog = page.getByRole("dialog", { name: "Cell V44" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    const cause = dialog.locator(".drawer__cause");
    await expect(cause).toContainText("the file no longer holds C44");
    await page.waitForTimeout(300); // the sheet's 250 ms slide ends before boxes are read

    const row = page.locator('.status-row[data-address="V44"]');
    await expect(row).toHaveClass(/is-selected/);
    const r = (await row.boundingBox())!;
    const d = (await dialog.boundingBox())!;
    const c = (await cause.boundingBox())!;
    // The row: wholly on screen, below the top bar, and not under the sheet.
    expect(r.y, "row below the top of the screen").toBeGreaterThanOrEqual(0);
    expect(r.y + r.height, "row above the sheet").toBeLessThanOrEqual(d.y);
    expect(overlaps(r, d), "row and sheet do not overlap").toBe(false);
    // Not dimmed away: the top layer at the row's centre is the row itself, not the scrim.
    const onTop = await row.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return hit !== null && el.contains(hit);
    });
    expect(onTop, "row above the scrim").toBe(true);
    await expect(row).toContainText(V44_REMEMBERED);
    // The cause: wholly inside the sheet and on screen, with no scroll inside the sheet.
    expect(c.y, "cause inside the sheet").toBeGreaterThanOrEqual(d.y);
    expect(c.y + c.height, "cause on screen").toBeLessThanOrEqual(vp.height);
    const back = (await dialog.locator(".drawer__back").boundingBox())!;
    expect(c.y + c.height, "cause above the Back to list bar").toBeLessThanOrEqual(back.y);
    expect(await dialog.locator(".drawer__scroll").evaluate((el) => el.scrollTop)).toBe(0);
    await expect(dialog.locator(".drawer__input.is-missing")).toHaveText(/C44\s*empty/);

    await axe(page, `mismatch-sheet-${vp.width}`);
    await page.screenshot({ path: `test-results/f19-mismatch-${vp.width}.png`, animations: "disabled" });

    // Back to list: the sheet goes, focus returns to the row, the page padding goes back.
    await dialog.getByRole("button", { name: "Back to list" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test("1440: a value cut by an ellipsis shows in full on hover and on keyboard focus", async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: /Open a real mismatch/ }).click();
  const grid = page.getByRole("grid");
  const cell = grid.locator('[role="gridcell"][aria-label^="V44,"]');
  await expect(cell).toBeVisible();
  await page.waitForTimeout(2600); // the sweep (at most 2.5 s) ends first

  // Precondition: the grid really cuts this value.
  const value = cell.locator(".cell__value");
  expect(await value.evaluate((el) => el.scrollWidth > el.clientWidth), "V44 is cut in the grid").toBe(true);
  await expect(value).toHaveText(V44_REMEMBERED);

  const peek = page.getByRole("tooltip");
  await expect(peek).toHaveCount(0);

  // Hover: the full value, readable, wholly on screen, not cut itself.
  await cell.hover();
  await expect(peek).toBeVisible();
  await expect(peek).toHaveText(V44_REMEMBERED);
  await expect(peek).toBeInViewport({ ratio: 1 });
  expect(await peek.evaluate((el) => el.scrollWidth <= el.clientWidth), "the peek is not cut").toBe(true);
  await expect(cell).toHaveAttribute("aria-describedby", (await peek.getAttribute("id"))!);
  await axe(page, "peek-hover-1440");
  await page.screenshot({ path: "test-results/f19-peek-hover-1440.png", animations: "disabled" });

  // A value that fits gets no peek.
  const fitting = await grid.evaluate((g) => {
    for (const el of g.querySelectorAll<HTMLElement>('[role="gridcell"]')) {
      const val = el.querySelector<HTMLElement>(".cell__value");
      if (val && val.textContent && val.scrollWidth <= val.clientWidth && el.getBoundingClientRect().left > 200) return el.getAttribute("aria-label");
    }
    return null;
  });
  expect(fitting, "a shown cell whose value fits").not.toBeNull();
  await grid.locator(`[role="gridcell"][aria-label="${fitting}"]`).hover();
  await expect(peek).toHaveCount(0);
  await page.mouse.move(1, 1);
  await expect(peek).toHaveCount(0);

  // Keyboard: click its left neighbour U44, then the arrow key onto V44; Escape hides the peek.
  await grid.locator('[role="gridcell"][aria-label^="U44,"]').click();
  await page.mouse.move(1, 1);
  await page.keyboard.press("ArrowRight");
  await expect(cell).toBeFocused();
  await expect(peek).toBeVisible();
  await expect(peek).toHaveText(V44_REMEMBERED);
  await expect(peek).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: "test-results/f19-peek-focus-1440.png", animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(peek).toHaveCount(0);
  expect(errors).toEqual([]);
});
