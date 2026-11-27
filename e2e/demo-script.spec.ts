// The demo script (docs/demo-script.md), scene by scene, on the shipped fixtures only. Expected
// numbers come from tests/differential/verify/golden.json, fixtures/manifest.json, verifyBytes and
// verifyWorkbookBytes, never from the page. If the app or the script drift apart, this fails.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { formatNumber } from "../src/ui/model/format-value.ts";
import { verifyBytes, verifyWorkbookBytes } from "../src/verify/index.ts";
import { payload } from "./fixtures/seance-files.ts";

type Totals = { formulas: number; matched: number; mismatched: number; unverifiable: number };
const KSBASE = "fixtures/ksbase/KSBASE.WK1";
const GNOME = "fixtures/libreoffice-wks-functions/gnome647171-1.wks";
const MACROS = "fixtures/macros/macros.wk1";
const M21 = "fixtures/noaa-ala-wai-m21/m21tab.wk3";
const golden = JSON.parse(readFileSync("tests/differential/verify/golden.json", "utf8")) as Record<string, Totals>;
const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; expectedValues: { cell: string; cached: number | string }[] }[] };
const o3Cached = String(manifest.fixtures.find((f) => f.path === KSBASE)!.expectedValues.find((c) => c.cell === "O3")!.cached);

const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const drawer = (page: Page) => page.getByRole("complementary");
const cell = (page: Page, address: string) => page.getByRole("grid").locator(`[role="gridcell"][aria-label^="${address},"]`);

async function expectTotals(page: Page, t: Totals) {
  const surface = page.getByRole("region", { name: "Totals" });
  await expect(surface.getByRole("img")).toHaveAttribute("aria-label", `${t.matched} matched, ${t.mismatched} mismatched, ${t.unverifiable} unverifiable`);
}

/** A fresh Summon view (the Sheet view has no "summon another" control), then the file is dropped. */
async function drop(page: Page, path: string) {
  const name = path.split("/").at(-1)!;
  await page.goto("/");
  await page.locator('input[type="file"][accept]').setInputFiles(payload(name, readFileSync(path)));
  await expect(h1(page, name)).toBeVisible();
}

test.use({ viewport: { width: 1440, height: 900 } });

test("the demo script runs on the shipped fixtures", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Scene 1: the Summon view, nothing uploaded.
  await page.goto("/");
  await expect(h1(page, "Raise a Lotus 1-2-3 file")).toBeVisible();

  // Scene 2: "Summon the sample" raises KSBASE.WK1, every formula proven.
  await page.getByRole("button", { name: "Summon the sample" }).click();
  await expect(h1(page, "KSBASE.WK1")).toBeVisible();
  const ks = golden[KSBASE]!;
  expect([ks.formulas, ks.matched, ks.mismatched, ks.unverifiable]).toEqual([160, 160, 0, 0]);
  await expectTotals(page, ks);
  await expect(page.getByRole("region", { name: "Totals" }).locator(".tile__value--display")).toHaveText("100.0%");

  // Scene 3: O3 in the drawer, the Lotus formula next to the Excel one, remembered = raised.
  await page.getByRole("grid").evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await cell(page, "O3").click();
  await expect(drawer(page)).toHaveAccessibleName("Cell O3");
  await expect(drawer(page).locator(".pill")).toHaveText("Matched");
  await expect(drawer(page).locator(".drawer__formula .mono-block")).toHaveCount(2);
  await expect(drawer(page).locator(".stat__value")).toHaveText([o3Cached, o3Cached]);
  await page.keyboard.press("Escape");

  // Scene 4: a real WKS file with one cell we cannot prove. It is amber with its reason, not hidden.
  await drop(page, GNOME);
  const gn = golden[GNOME]!;
  expect([gn.matched, gn.mismatched, gn.unverifiable]).toEqual([3, 0, 1]);
  await expectTotals(page, gn);
  const a5 = verifyBytes(new Uint8Array(readFileSync(GNOME))).verification.cells.find((c) => c.address === "A5")!;
  expect(a5.status).toBe("unverifiable");
  await page.getByRole("tab", { name: /^Unverifiable/ }).click();
  await cell(page, "A5").click();
  await expect(drawer(page).locator(".pill")).toHaveText("Unverifiable");
  await expect(drawer(page)).toContainText(a5.reason.message);
  await page.keyboard.press("Escape");

  // Scene 5: the real mismatch, one click from the Summon view. m21tab.wk3 opens filtered to
  // Mismatched with V44 red in the grid and its drawer open: the stored value, ERR, and why.
  await page.goto("/");
  await page.getByRole("button", { name: /Open a real mismatch/ }).click();
  await expect(h1(page, "m21tab.wk3")).toBeVisible();
  const [m21] = verifyWorkbookBytes(new Uint8Array(readFileSync(M21))).verifications;
  const m21Totals = m21!.totals;
  expect([m21Totals.matched, m21Totals.mismatched, m21Totals.unverifiable]).toEqual([7, 1, 0]);
  await expectTotals(page, m21Totals);
  const v44 = m21!.cells.find((c) => c.address === "V44")!;
  expect([v44.status, v44.lotusFormula, v44.recalculated?.t]).toEqual(["mismatched", "L44/C44", "err"]);
  await expect(page.getByRole("tab", { name: /^Mismatched/ })).toHaveAttribute("aria-selected", "true");
  await expect(cell(page, "V44")).toHaveAttribute("aria-label", /Mismatched$/);
  await expect(cell(page, "V44")).toBeInViewport();
  await expect(drawer(page)).toHaveAccessibleName("Cell V44");
  await expect(drawer(page).locator(".stat__value")).toHaveText([formatNumber((v44.cached as { v: number }).v), "ERR"]);
  await expect(drawer(page).locator(".drawer__cause")).toContainText("the file no longer holds C44");
  await page.keyboard.press("Escape");

  // Scene 6: macros become steps to approve. Approving records a decision and changes no cell.
  await drop(page, MACROS);
  const before = verifyBytes(new Uint8Array(readFileSync(MACROS))).verification.totals;
  expect([before.matched, before.mismatched, before.unverifiable]).toEqual([0, 0, 1]);
  await expectTotals(page, before);
  await page.getByRole("tab", { name: "Macros 4" }).click();
  await expect(h1(page, "Macros")).toBeVisible();
  const detail = page.locator(".macro-detail");
  await expect(detail.getByText("Go to A1")).toBeVisible();
  await detail.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator(".macros__status")).toHaveText("3 waiting · 1 approved");
  await page.getByRole("tab", { name: "Sheet", exact: true }).click();
  await expect(h1(page, "macros.wk1")).toBeVisible();
  await expectTotals(page, before);
  await expect(cell(page, "A10")).toHaveAttribute("aria-label", /Unverifiable$/);

  // Scene 7: leave with the workbook and the provenance report.
  for (const [button, file] of [
    ["Download XLSX", "macros.xlsx"],
    ["Download report (HTML)", "macros.report.html"],
  ] as const) {
    const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: button, exact: true }).click()]);
    expect(d.suggestedFilename()).toBe(file);
  }

  expect(errors).toEqual([]);
});
