// The summoning-circle drop zone in the browser (seance-visuals task 6; requirements 10 to 16). The
// zone keeps every way in: drop, the file and folder pickers, Enter and Space.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { COPY } from "../src/ui/copy.ts";
import { RUNES } from "../src/ui/model/runes.ts";
import { interceptFileChoosers } from "./fixtures/file-chooser.ts";
import { watchNetwork } from "./fixtures/network.ts";

const DESKTOP = { width: 1440, height: 900 };
const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const zone = (page: Page) => page.locator(".dropzone");
const runeTransform = (page: Page) => page.locator(".circle__runes").evaluate((el) => getComputedStyle(el).transform);
const candleOpacity = (page: Page) => page.locator(".circle__candle-glow").first().evaluate((el) => getComputedStyle(el).opacity);

async function dragOver(page: Page) {
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([0])], "x.wk1"));
    document.querySelector(".dropzone")!.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
}

test.describe("the summoning circle", () => {
  test.use({ viewport: DESKTOP });

  test("is in the zone: two rings, five candles, every rune, hidden from assistive tech", async ({ page }) => {
    await page.goto("/");
    const circle = page.locator(".dropzone .summoning-circle");
    await expect(circle).toBeVisible();
    await expect(circle).toHaveAttribute("aria-hidden", "true");
    await expect(circle.locator(".circle__ring")).toHaveCount(2);
    await expect(circle.locator(".circle__candle")).toHaveCount(5);
    const runes = (await circle.locator("textPath").textContent())!;
    for (const r of RUNES) expect(runes).toContain(r);
    // The zone's accessible name is its own words; the circle adds nothing.
    await expect(page.getByRole("button", { name: `${COPY.dropZone} ${COPY.dropZoneHint}`, exact: true })).toBeVisible();
  });

  test("a drop on it summons the file", async ({ page }) => {
    const bytes = [...readFileSync("fixtures/ksbase/KSBASE.WK1")];
    await page.goto("/");
    await page.evaluate((bytes) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], "KSBASE.WK1"));
      const z = document.querySelector(".dropzone")!;
      for (const type of ["dragenter", "dragover", "drop"]) z.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, bytes);
    await expect(h1(page, "KSBASE.WK1")).toBeVisible();
  });

  test("Enter and Space on it open the file picker, and so does a click", async ({ page }) => {
    await page.goto("/");
    await interceptFileChoosers(page);
    await zone(page).focus();
    for (const key of ["Enter", " "]) {
      const chooser = page.waitForEvent("filechooser");
      await page.keyboard.press(key);
      expect((await chooser).isMultiple()).toBe(true);
    }
    const chooser = page.waitForEvent("filechooser");
    await zone(page).click();
    await (await chooser).setFiles("fixtures/ksbase/KSBASE.WK1");
    await expect(h1(page, "KSBASE.WK1")).toBeVisible();
  });

  test("the folder picker still raises a folder", async ({ page }) => {
    await page.goto("/");
    await page.locator('input[type="file"][webkitdirectory]').setInputFiles("fixtures/ksbase");
    await expect(h1(page, "KSBASE.WK1")).toBeVisible();
  });

  test("hover and drag-over brighten the candles and turn the runes, once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    expect(await runeTransform(page)).toBe("none");
    const idle = Number(await candleOpacity(page));
    await zone(page).hover();
    await expect.poll(() => runeTransform(page)).not.toBe("none");
    await expect.poll(async () => Number(await candleOpacity(page))).toBeGreaterThan(idle);
    await page.mouse.move(0, 0);
    await expect.poll(() => runeTransform(page)).toBe("none");
    await dragOver(page);
    await expect(page.locator(".dropzone-wrap")).toHaveClass(/is-over/);
    await expect.poll(() => runeTransform(page)).not.toBe("none");
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity).length)).toBe(0);
  });

  test("under reduced motion the runes never turn, while the candles still brighten", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const idle = Number(await candleOpacity(page));
    await zone(page).hover();
    expect(await runeTransform(page)).toBe("none");
    expect(Number(await candleOpacity(page))).toBeGreaterThan(idle);
    await dragOver(page);
    await expect(page.locator(".dropzone-wrap")).toHaveClass(/is-over/);
    expect(await runeTransform(page)).toBe("none");
    expect(await page.locator(".circle__glyph").evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  });

  test("sends no request of its own, and the Summon view still fits above the fold", async ({ page, baseURL }) => {
    const net = watchNetwork(page, baseURL!);
    await page.goto("/");
    await expect(page.locator(".summoning-circle")).toBeVisible();
    await zone(page).hover();
    for (const target of [h1(page, "Raise a Lotus 1-2-3 file"), page.getByRole("button", { name: "Summon the sample" }), zone(page), page.getByText(COPY.privacy)]) {
      const box = (await target.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(DESKTOP.height);
    }
    net.expectOnlyStatic();
  });
});

test("at 390 the circle fits with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".summoning-circle")).toBeVisible();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const box = (await page.locator(".summoning-circle").boundingBox())!;
  expect(box.width).toBeCloseTo(140, 0);
});
