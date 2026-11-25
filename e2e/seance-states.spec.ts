// Status states, filters and the phone list (task 31; requirements 31, 34, 39 to 41, 50). Counts come
// from verifyBytes over the bytes the test wrote, and from golden.json for the real WKS file.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { verifyBytes } from "../src/verify/index.ts";
import { files, mixedStatusWk1, payload, type Payload } from "./fixtures/seance-files.ts";

const GNOME = "fixtures/libreoffice-wks-functions/gnome647171-1.wks";
const golden = JSON.parse(readFileSync("tests/differential/verify/golden.json", "utf8")) as Record<string, { formulas: number; matched: number; mismatched: number; unverifiable: number }>;
const HONEST = "Unverifiable cells are not wrong; we could not prove them. The report lists each one and why.";

async function raise(page: Page, file: Payload) {
  await page.goto("/");
  await page.locator('input[type="file"][accept]').setInputFiles(file);
  await expect(page.getByRole("heading", { level: 1, name: file.name })).toBeVisible();
}

/** The computed colour a token gives, read through a probe element. */
const tokenColour = (page: Page, token: string) =>
  page.evaluate((t) => {
    const probe = document.createElement("div");
    probe.style.background = `var(${t})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, token);

const cases = [
  { file: () => files.mixedStatus(), totals: verifyBytes(mixedStatusWk1()).verification.totals },
  { file: () => payload("gnome647171-1.wks", readFileSync(GNOME)), totals: golden[GNOME]! },
];

for (const c of cases) {
  test(`totals of ${c.file().name} match the verification`, async ({ page }) => {
    expect(c.totals.unverifiable).toBeGreaterThan(0);
    await raise(page, c.file());
    const surface = page.getByRole("region", { name: "Totals" });
    await expect(surface.locator(".tile__value:not(.tile__value--display)")).toHaveText([String(c.totals.matched), String(c.totals.mismatched), String(c.totals.unverifiable)]);
    const headline = (await surface.locator(".tile__value--display").textContent())!;
    expect(headline).toMatch(/^\d+\.\d%$/);
    expect(Number.parseFloat(headline)).toBeLessThan(100);
    await expect(surface.getByText(HONEST)).toBeVisible();
  });
}

test("the grid paints mismatched and matched cells with their tokens", async ({ page }) => {
  await raise(page, files.mixedStatus());
  const mismatched = page.locator('[role="gridcell"][aria-label^="C1,"]');
  await expect(mismatched).toHaveClass(/cell--mismatched/);
  // The cell lights with a --dur-slow background transition (the verification sweep); read it settled.
  await expect(page.getByRole("grid")).toHaveAttribute("data-sweep", "done");
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  expect(await mismatched.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await tokenColour(page, "--status-mismatched-bg"));

  const matched = page.locator('[role="gridcell"][aria-label^="A2,"]');
  await expect(matched).toHaveAccessibleName(/Matched$/);
  const dot = await matched.evaluate((el) => {
    const s = getComputedStyle(el, "::before");
    return { background: s.backgroundColor, width: s.width, radius: s.borderRadius };
  });
  expect(dot.background).toBe(await tokenColour(page, "--status-matched-mark"));
  expect(dot.width).toBe("6px");
  expect(dot.radius).not.toBe("0px");
});

test("at 1440 the filters leave the matching rows or say there are none", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await raise(page, files.mismatch());
  const rows = page.getByRole("grid").locator('[role="row"]:has([role="gridcell"])');
  await expect(rows).toHaveCount(2);

  await page.getByRole("tab", { name: /^Mismatched/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute("aria-rowindex", "2");
  await expect(rows.first().locator('[aria-label^="C1,"]')).toHaveCount(1);

  await page.getByRole("tab", { name: /^Unverifiable/ }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByText("No unverifiable cells on this sheet.")).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the status list replaces the grid and a row opens a modal sheet that keeps focus", async ({ page }) => {
    await raise(page, files.mixedStatus());
    await expect(page.getByRole("grid")).toHaveCount(0);
    await expect(page.locator(".status-group")).toHaveCount(3);
    expect(await page.locator(".status-group").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")))).toEqual(["mismatched", "unverifiable", "matched"]);
    await expect(page.getByRole("button", { name: /^Matched/ })).toHaveAttribute("aria-expanded", "false");

    const row = page.locator('.status-row[data-address="C1"]');
    await row.tap();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAccessibleName("Cell C1");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeFocused();

    await row.tap();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Back to list" }).tap();
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeFocused();
  });
});
