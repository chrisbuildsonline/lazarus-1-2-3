// Privacy (task 34; requirements 63 to 66). A whole session (the sample, the drawer, the three
// downloads, a dropped file) makes only static GETs of the app; nothing is stored; the CSP stops a
// fetch to another origin. The hashes come from fixtures/manifest.json and the dropped bytes.
import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { watchNetwork } from "./fixtures/network.ts";
import { mismatchWk1 } from "./fixtures/seance-files.ts";

const KSBASE = "fixtures/ksbase/KSBASE.WK1";
const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; sha256: string }[] };
const ksbaseSha = manifest.fixtures.find((f) => f.path === KSBASE)!.sha256;
const mismatchBytes = mismatchWk1();
const mismatchSha = createHash("sha256").update(mismatchBytes).digest("hex");
const SECRETS = ["KSBASE.WK1", "KSBASE.xlsx", "KSBASE.report", "mismatch.wk1", ksbaseSha, mismatchSha];

async function save(page: Page, name: string): Promise<string> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name, exact: true }).click()]);
  await download.path();
  return download.suggestedFilename();
}

/** The synthetic drop of the files spec (task 3 probe, finding d). */
async function drop(page: Page, name: string, bytes: Uint8Array): Promise<void> {
  await page.evaluate(
    ({ name, bytes }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], name));
      const el = document.querySelector(".dropzone")!;
      for (const type of ["dragover", "drop"]) el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    },
    { name, bytes: [...bytes] },
  );
}

test("a whole session makes only static GETs, stores nothing, and the CSP blocks other origins", async ({ page, baseURL }) => {
  const net = watchNetwork(page, baseURL!);
  // Chromium logs every CSP refusal to the console: the app itself must cause none (the favicon
  // "data:,", React's style writes, the worker, the three blob: downloads).
  const refusals: string[] = [];
  page.on("console", (m) => {
    if (m.text().includes("Content Security Policy")) refusals.push(m.text());
  });

  await page.goto("/");
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Summon the sample" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "KSBASE.WK1" })).toBeVisible();
  // M3 is a number; N3, one to the right, is a formula (seance-drawer.spec.ts).
  await page.getByRole("grid").locator('[role="gridcell"][aria-label^="M3,"]').click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary")).toHaveAccessibleName("Cell N3");
  expect(await save(page, "Download XLSX")).toBe("KSBASE.xlsx");
  expect(await save(page, "Download report (HTML)")).toBe("KSBASE.report.html");
  expect(await save(page, "JSON")).toBe("KSBASE.report.json");

  await page.goto("/");
  await drop(page, "mismatch.wk1", mismatchBytes);
  await expect(page.getByRole("heading", { level: 1, name: "mismatch.wk1" })).toBeVisible();
  expect(refusals).toEqual([]);

  // A fetch to another origin: the CSP refuses it before any request is made.
  const outcome = await page.evaluate(async () => {
    const violation = new Promise<string>((resolve) => {
      document.addEventListener("securitypolicyviolation", (e) => resolve(e.effectiveDirective), { once: true });
      setTimeout(() => resolve("no violation"), 2000);
    });
    try {
      await fetch("https://example.invalid/x");
      return "sent";
    } catch {
      return `blocked by ${await violation}`;
    }
  });
  expect(outcome).toBe("blocked by connect-src");
  // The console watch above sees refusals: this one is there.
  await expect.poll(() => refusals.some((r) => r.includes("example.invalid"))).toBe(true);
  expect(net.requests.map((r) => r.url()).filter((u) => u.includes("example.invalid"))).toEqual([]);

  net.expectOnlyStatic(SECRETS);
  const samples = net.requests.filter((r) => /^\/assets\/KSBASE-[^/]+\.WK1$/.test(new URL(r.url()).pathname));
  expect(samples).toHaveLength(1);

  const stores = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    caches: await caches.keys(),
    indexedDB: (await indexedDB.databases()).map((d) => d.name),
    serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  expect(stores).toEqual({ local: 0, session: 0, cookie: "", caches: [], indexedDB: [], serviceWorkers: 0 });
  expect(await page.context().cookies()).toEqual([]);
  expect(page.context().serviceWorkers()).toEqual([]);
});

test("negative control: a page that posts to /x fails expectOnlyStatic", async ({ page, baseURL }) => {
  const net = watchNetwork(page, baseURL!);
  await page.goto("/");
  await page.evaluate(() => fetch("/x", { method: "POST", body: "bytes" }).then(
    () => undefined,
    () => undefined,
  ));
  await expect.poll(() => net.requests.some((r) => r.method() === "POST")).toBe(true);
  expect(() => net.expectOnlyStatic()).toThrow();
});
