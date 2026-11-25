// The seance palette is the default (seance-visuals task 2; requirements 1 to 4, 9). Values are the
// tokens of design/DESIGN.md section 2, written out as the computed rgb() the browser reports.
import { expect, test, type Page } from "@playwright/test";
import { files } from "./fixtures/seance-files.ts";

const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const style = (page: Page, selector: string, prop: string) =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

for (const colorScheme of ["dark", "light"] as const) {
  test(`dark seance by default, whatever the system asks (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(h1(page, "Raise a Lotus 1-2-3 file")).toBeVisible();

    expect(await style(page, "body", "background-color")).toBe("rgb(13, 11, 20)");
    expect(await style(page, "body", "color")).toBe("rgb(239, 234, 246)");
    expect(await style(page, "body", "color-scheme")).toBe("dark");
    expect(await style(page, ".dropzone", "background-color")).toBe("rgb(23, 20, 31)");
    const pill = page.getByRole("button", { name: "Summon the sample" });
    expect(await pill.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(244, 233, 212)");
    expect(await pill.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(21, 17, 28)");
    await expect(page.locator(".btn-primary")).toHaveCount(1);

    await pill.click();
    await expect(h1(page, "KSBASE.WK1")).toBeVisible();
    expect(await style(page, ".totals .pill--matched", "color")).toBe("rgb(134, 240, 180)");
    expect(await style(page, ".grid__head", "background-color")).toBe("rgb(23, 20, 31)");
    await expect(page.locator(".btn-primary")).toHaveCount(1);

    await page.goto("/");
    await page.locator('input[type="file"][accept]').setInputFiles(files.mixedStatus());
    await expect(h1(page, "mixed-status.wk1")).toBeVisible();
    expect(await style(page, '[role="gridcell"][aria-label^="C1,"]', "background-color")).toBe("rgb(58, 22, 34)");
  });
}

test("the phone scrim darkens the page instead of lightening it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator('input[type="file"][accept]').setInputFiles(files.mixedStatus());
  await expect(h1(page, "mixed-status.wk1")).toBeVisible();
  await page.locator('.status-row[data-address="C1"]').click();
  await expect(page.getByRole("dialog", { name: "Cell C1" })).toBeVisible();
  expect(await style(page, ".scrim", "background-color")).toBe("rgb(13, 11, 20)");
});
