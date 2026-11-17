// The app shell and the bundled sample (task 28; requirements 1, 3, 14, 26, 27). Expected numbers come
// from tests/differential/verify/golden.json and fixtures/manifest.json, never from the page.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const KSBASE = "fixtures/ksbase/KSBASE.WK1";
const golden = JSON.parse(readFileSync("tests/differential/verify/golden.json", "utf8")) as Record<string, { formulas: number; matched: number; mismatched: number; unverifiable: number }>;
const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; expectedValues: { cell: string; kind: string; cached: number | string }[] }[] };

const totals = golden[KSBASE]!;
const o3 = manifest.fixtures.find((f) => f.path === KSBASE)!.expectedValues.find((c) => c.cell === "O3")!;

test("the sample raises KSBASE.WK1 into the Sheet view", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto("/");
  await expect(page.locator(".btn-primary")).toHaveCount(1);
  await page.getByRole("button", { name: "Summon the sample" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "KSBASE.WK1" })).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page).toHaveTitle("KSBASE.WK1 · Lazarus 1-2-3");
  await expect(page.locator(".btn-primary")).toHaveCount(1);

  // Totals: headline 100.0% only because every formula matched (hand: 160 * 1000 / 160 = 1000 tenths).
  expect(totals.matched).toBe(totals.formulas);
  const surface = page.getByRole("region", { name: "Totals" });
  await expect(surface.locator(".tile__value--display")).toHaveText("100.0%");
  const bar = surface.getByRole("img");
  await expect(bar).toHaveAttribute("aria-label", `${totals.matched} matched, ${totals.mismatched} mismatched, ${totals.unverifiable} unverifiable`);
  const values = surface.locator(".tile__value:not(.tile__value--display)");
  await expect(values).toHaveText([String(totals.matched), String(totals.mismatched), String(totals.unverifiable)]);

  // The grid cell O3 carries its cached value and its status in the accessible name.
  const grid = page.getByRole("grid");
  await expect(grid).toBeVisible();
  // Column O is outside the first window at 1440; scroll the grid's own container to it.
  await grid.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await expect(grid.getByRole("gridcell", { name: `O3, ${String(o3.cached)}, Matched`, exact: true })).toHaveCount(1);

  expect(errors).toEqual([]);
});
