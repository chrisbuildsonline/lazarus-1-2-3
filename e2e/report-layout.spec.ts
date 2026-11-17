// The provenance report page fits a phone and a desktop with no horizontal page scroll, and on a
// phone the formula table reads as a status list (design/DESIGN.md: "On phone the grid becomes a
// status list"). The page is the one the CLI writes for KSBASE.WK1.
import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "lazarus-e2e-report-"));
test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

function ksbaseReport(): string {
  const out = join(dir, "ksbase.html");
  const run = spawnSync("bun", ["src/cli/lazarus.ts", "fixtures/ksbase/KSBASE.WK1", "--report", out], { encoding: "utf8" });
  expect(run.status, run.stderr).toBe(0);
  return readFileSync(out, "utf8");
}

for (const width of [390, 1440]) {
  test(`report page has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.setContent(ksbaseReport());
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(clientWidth).toBe(width);
    expect(scrollWidth).toBeLessThanOrEqual(width);
  });
}

test("on a phone each formula is a status list row: address and pill on top, details below", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(ksbaseReport());
  await expect(page.locator("#cells thead")).toBeHidden();
  const row = page.locator("#cells tbody tr").first();
  const box = async (sel: string) => (await row.locator(sel).boundingBox())!;
  const [address, pill, lotus, excel, stored, reason] = await Promise.all(["td.c-cell", "td.c-status .pill", "td.c-lotus", "td.c-excel", "td.c-stored", "td.reason"].map(box));
  // Address and pill share the top line; the pill sits right of the address.
  expect(Math.abs(address!.y - pill!.y)).toBeLessThan(address!.height);
  expect(pill!.x).toBeGreaterThan(address!.x + address!.width);
  // Then Lotus formula, Excel formula, stored and recalculated, reason, each lower than the last.
  expect(lotus!.y).toBeGreaterThan(address!.y + address!.height - 1);
  expect(excel!.y).toBeGreaterThan(lotus!.y);
  expect(stored!.y).toBeGreaterThan(excel!.y);
  expect(reason!.y).toBeGreaterThan(stored!.y);
  // The labels a hidden header would have given are shown inline.
  await expect(row.locator("td.c-lotus")).toHaveCSS("display", "block");
  expect(await row.locator("td.c-stored").evaluate((el) => getComputedStyle(el, "::before").content)).toBe('"Stored"');
});
