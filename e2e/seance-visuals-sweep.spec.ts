// The verification sweep on the Sheet view (seance-visuals task 4; requirements 17 to 27). Expected
// figures come from golden.json and verifyBytes, never from what the page printed. The page is
// sampled on every animation frame inside the browser, so no assertion depends on test-runner timing.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { verifyBytes, type Totals } from "../src/verify/index.ts";
import { files } from "./fixtures/seance-files.ts";

const golden = JSON.parse(readFileSync("tests/differential/verify/golden.json", "utf8")) as Record<string, Totals>;
const KSBASE = golden["fixtures/ksbase/KSBASE.WK1"]!;
const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const DESKTOP = { width: 1440, height: 900 };

type Frame = { t: number; headline: string; counts: number[]; sweep: string | null; lit: string | null; unlit: number; lit_cells: number; labels: string[] };

/** Starts sampling the totals and the grid on every frame until the sweep is done (or 6s pass). */
const sample = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Frame[]>((done) => {
        const frames: Frame[] = [];
        const start = performance.now();
        const tick = () => {
          const totals = document.querySelector(".totals");
          const grid = document.querySelector('[role="grid"]');
          if (totals && grid) {
            const values = [...totals.querySelectorAll(".tile__value")].map((e) => e.textContent ?? "");
            frames.push({
              t: performance.now(),
              headline: values[0] ?? "",
              counts: values.slice(1).map((v) => Number(v.replaceAll(",", ""))),
              sweep: grid.getAttribute("data-sweep"),
              lit: grid.getAttribute("data-lit"),
              unlit: grid.querySelectorAll(".cell--unlit").length,
              lit_cells: grid.querySelectorAll('[data-sweep="lit"]').length,
              labels: [...grid.querySelectorAll(".cell--formula")].map((c) => c.getAttribute("aria-label") ?? ""),
            });
            if (grid.getAttribute("data-sweep") === "done") return done(frames);
          }
          if (performance.now() - start > 6000) return done(frames);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );

const pct = (s: string) => Number(s.replace("%", ""));

/** Every mounted formula cell shows the engine's status for its address. */
async function expectEngineStatuses(page: Page, bytes: Uint8Array) {
  const engine = new Map(verifyBytes(bytes).verification.cells.map((c) => [c.address, c.status]));
  const shown = await page.locator('[role="grid"] .cell--formula').evaluateAll((cells) =>
    cells.map((c) => ({ label: c.getAttribute("aria-label")!, cls: c.className })),
  );
  expect(shown.length).toBeGreaterThan(0);
  for (const { label, cls } of shown) {
    const status = engine.get(label.split(",")[0]!)!;
    expect(cls, label).toContain(`cell--${status}`);
    expect(cls, label).not.toContain("cell--unlit");
  }
}

test.describe("with motion", () => {
  test.use({ viewport: DESKTOP });

  test("the sample's cells light up one by one while the totals count up to the engine's numbers", async ({ page }) => {
    await page.goto("/");
    const framesP = sample(page);
    await page.getByRole("button", { name: "Summon the sample" }).click();
    const frames = await framesP;
    expect(frames.length).toBeGreaterThan(5);

    const first = frames[0]!;
    const last = frames.at(-1)!;
    // It starts low, with unlit ghosts in view, and the labels carry the real status from the first frame.
    expect(pct(first.headline)).toBeLessThan(100);
    expect(first.sweep).toBe("running");
    expect(first.unlit).toBeGreaterThan(0);
    expect(first.labels.length).toBeGreaterThan(0);
    for (const label of first.labels) expect(label).toMatch(/, Matched$/);

    // It never counts down, and some frame shows a partly lit grid: one by one, not all at once.
    for (let i = 1; i < frames.length; i++) {
      expect(pct(frames[i]!.headline)).toBeGreaterThanOrEqual(pct(frames[i - 1]!.headline));
      for (let k = 0; k < 3; k++) expect(frames[i]!.counts[k]!).toBeGreaterThanOrEqual(frames[i - 1]!.counts[k]!);
    }
    expect(frames.some((f) => f.unlit > 0 && f.lit_cells > 0)).toBe(true);

    // It ends with the engine's totals, within 2.5s plus headroom.
    expect(last.sweep).toBe("done");
    expect(last.lit).toBe(String(KSBASE.formulas));
    expect(last.t - first.t).toBeLessThan(3500);
    await expect(page.locator(".tile__value")).toHaveText(["100.0%", String(KSBASE.matched), String(KSBASE.mismatched), String(KSBASE.unverifiable)]);
    await expect(page.getByRole("img", { name: `${KSBASE.matched} matched, 0 mismatched, 0 unverifiable` })).toBeVisible();
    await expectEngineStatuses(page, new Uint8Array(readFileSync("fixtures/ksbase/KSBASE.WK1")));
  });

  test("the grid opens on the formula columns (N and O of the sample)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Summon the sample" }).click();
    await expect(h1(page, "KSBASE.WK1")).toBeVisible();
    const grid = (await page.getByRole("grid").boundingBox())!;
    for (const address of ["N3", "O3"]) {
      const cell = (await page.locator(`[role="gridcell"][aria-label^="${address},"]`).boundingBox())!;
      expect(cell.x, address).toBeGreaterThanOrEqual(grid.x);
      expect(cell.x + cell.width, address).toBeLessThanOrEqual(grid.x + grid.width + 1);
    }
  });

  test("mixed-status.wk1 ends with C1 rose and D1 grey, and its grid needs no scroll", async ({ page }) => {
    const file = files.mixedStatus();
    await page.goto("/");
    await page.locator('input[type="file"][accept]').setInputFiles(file);
    await expect(h1(page, file.name)).toBeVisible();
    await expect(page.getByRole("grid")).toHaveAttribute("data-sweep", "done");
    await expectEngineStatuses(page, new Uint8Array(file.buffer));
    await expect(page.locator('[role="gridcell"][aria-label^="C1,"]')).toHaveClass(/cell--mismatched/);
    await expect(page.locator('[role="gridcell"][aria-label^="D1,"]')).toHaveClass(/cell--unverifiable/);
    expect(await page.getByRole("grid").evaluate((g) => g.scrollLeft)).toBe(0);
  });

  test("a filter change during the sweep ends it in its final state", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Summon the sample" }).click();
    await expect(page.getByRole("grid")).toHaveAttribute("data-sweep", "running");
    await page.getByRole("tab", { name: /^Matched/ }).click();
    await expect(page.getByRole("grid")).toHaveAttribute("data-sweep", "done", { timeout: 500 });
    await expect(page.locator(".tile__value")).toHaveText(["100.0%", "160", "0", "0"]);
  });

  test("a DBF table has no sweep", async ({ page }) => {
    const file = files.dbf();
    await page.goto("/");
    await page.locator('input[type="file"][accept]').setInputFiles(file);
    await expect(h1(page, file.name)).toBeVisible();
    await expect(page.locator("[data-sweep]")).toHaveCount(0);
  });
});

test.describe("with reduced motion", () => {
  test.use({ viewport: DESKTOP });

  test("no sweep: the final state at once and no running animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const framesP = sample(page);
    await page.getByRole("button", { name: "Summon the sample" }).click();
    const frames = await framesP;
    expect(frames[0]!.sweep).toBe("done");
    expect(frames[0]!.lit).toBe(String(KSBASE.formulas));
    expect(frames[0]!.headline).toBe("100.0%");
    expect(frames[0]!.counts).toEqual([KSBASE.matched, KSBASE.mismatched, KSBASE.unverifiable]);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
  });
});

test("on a phone the totals count up and the status list shows real statuses at once", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const file = files.mixedStatus();
  await page.locator('input[type="file"][accept]').setInputFiles(file);
  await expect(h1(page, file.name)).toBeVisible();
  await expect(page.locator('.status-row[data-address="C1"]')).toBeVisible();
  const engine = verifyBytes(new Uint8Array(file.buffer)).verification.totals;
  await expect(page.locator(".tile__value")).toHaveText([/%$/, String(engine.matched), String(engine.mismatched), String(engine.unverifiable)]);
});
