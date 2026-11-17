// Browser probe for the Seance UI (task 3; finding 11; requirements 8, 14). A throwaway app
// (e2e/fixtures/seance-probe) is built with the repo's vite.config.ts and served by `vite preview`.
//
// Findings (from the runs of this spec, Vite 8 and Playwright Chromium):
// (a) `?no-inline` alone is NOT honoured for .wk1/.WK1: Vite does not know the extension as an
//     asset, keeps the query in the file name and fails with "Could not load ...?no-inline".
//     `?url&no-inline` works for both cases: KSBASE.WK1 becomes /assets/KSBASE-<hash>.WK1 (upper
//     case kept) serving 24,291 bytes with the manifest SHA-256, and the 691-byte functions.wk1 is
//     emitted as /assets/functions-<hash>.wk1, not inlined as data:. No vite.config.ts change needed.
// (b) new Worker(new URL("<path>.worker.ts", import.meta.url), { type: "module" }) is emitted as
//     /assets/<name>.worker-<hash>.js, loads from the app origin and answers a message (here
//     verify.worker.ts, the only worker before the raise worker exists). No config change needed.
// (c) locator.setInputFiles(<directory>) on <input type="file" webkitdirectory> gives one File per
//     file in the tree, with webkitRelativePath "<folder>/<sub>/<name>" (sub-folders included).
// (d) A drop event carrying a DataTransfer built in the page with items.add(file) reaches the
//     handler, but webkitGetAsEntry() returns null for every item (file or not): only a drop from
//     the OS has a file-system entry. dataTransfer.files holds the files, so the app's fallback to
//     `files` (design.md "Dropping files", step 4) is the path e2e drops take. No directory entry
//     can be built in a page at all, so folder drops stay covered by fake entries in Vitest.
// (e) crypto.subtle.digest exists on http://localhost (isSecureContext is true).
import { expect, test } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build, preview, type PreviewServer } from "vite";

type Probe = {
  urls: { ksbase: string; functions: string };
  asset(url: string): Promise<{ url: string; length: number; sha256: string }>;
  askWorker(): Promise<{ type: string; id: unknown; totals: unknown }>;
  drops: { items: { kind: string; entry: null | { isFile: boolean; isDirectory: boolean; name: string; fullPath: string } }[]; files: { name: string; size: number }[] }[];
  subtle: boolean;
  secure: boolean;
  folderInputSupported: boolean;
  picked(): { name: string; path: string; size: number }[];
};
declare const probe: Probe;

const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; sha256: string }[] };
const sha = (path: string) => manifest.fixtures.find((f) => f.path === path)!.sha256;

const root = resolve("e2e/fixtures/seance-probe");
const outDir = mkdtempSync(join(tmpdir(), "lazarus-e2e-probe-"));
const folder = mkdtempSync(join(tmpdir(), "lazarus-e2e-folder-"));
let server: PreviewServer;
let origin = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  await build({ configFile: resolve("vite.config.ts"), root, logLevel: "warn", build: { outDir, emptyOutDir: true } });
  server = await preview({ configFile: resolve("vite.config.ts"), root, logLevel: "warn", build: { outDir }, preview: { port: 4183, strictPort: false, host: "localhost" } });
  origin = new URL(server.resolvedUrls!.local[0]!).origin;
  mkdirSync(join(folder, "books", "old"), { recursive: true });
  writeFileSync(join(folder, "books", "a.wk1"), readFileSync("fixtures/formulas/formulas.wk1"));
  writeFileSync(join(folder, "books", "old", "b.WKS"), readFileSync("fixtures/lotus123-wks/testLotus123.wks"));
  writeFileSync(join(folder, "books", "notes.txt"), "not lotus");
});

test.afterAll(async () => {
  await server?.close();
  rmSync(outDir, { recursive: true, force: true });
  rmSync(folder, { recursive: true, force: true });
});

async function open(page: import("@playwright/test").Page) {
  await page.goto(`${origin}/`);
  await expect(page).toHaveTitle("probe ready");
}

test("(a) ?url&no-inline gives /assets/ URLs that serve the exact fixture bytes", async ({ page }) => {
  await open(page);
  const urls = await page.evaluate(() => probe.urls);
  expect(urls.ksbase).toMatch(/^\/assets\/KSBASE-[\w-]+\.WK1$/);
  expect(urls.functions).toMatch(/^\/assets\/functions-[\w-]+\.wk1$/);
  const ksbase = await page.evaluate((u) => probe.asset(u), urls.ksbase);
  expect(ksbase.length).toBe(24_291);
  expect(ksbase.sha256).toBe(sha("fixtures/ksbase/KSBASE.WK1"));
  const functions = await page.evaluate((u) => probe.asset(u), urls.functions);
  expect(functions.length).toBe(691);
  expect(functions.sha256).toBe(sha("fixtures/functions/functions.wk1"));
});

test("(b) a module worker is emitted under /assets/ and answers a message", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await open(page);
  const answer = await page.evaluate(() => probe.askWorker());
  expect(answer.type).toBe("result");
  expect(answer.id).toBe(7);
  // golden.json: KSBASE has 160 formulas, all matched.
  expect(answer.totals).toMatchObject({ formulas: 160, matched: 160, mismatched: 0, unverifiable: 0 });
  const workerPaths = requests.filter((p) => /worker/i.test(p));
  expect(workerPaths).toHaveLength(1);
  expect(workerPaths[0]).toMatch(/^\/assets\/verify\.worker-[\w-]+\.js$/);
});

test("(c) setInputFiles with a directory on a webkitdirectory input gives webkitRelativePath", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => probe.folderInputSupported)).toBe(true);
  await page.locator("#dir").setInputFiles(join(folder, "books"));
  const picked = await page.evaluate(() => probe.picked());
  expect(picked.map((f) => f.path).sort()).toEqual(["books/a.wk1", "books/notes.txt", "books/old/b.WKS"]);
  expect(picked.find((f) => f.name === "a.wk1")!.size).toBe(262);
});

test("(d) a synthetic drop with a page-built DataTransfer: no entries, the files list carries the files", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([0, 0, 2, 0, 6, 4])], "x.wk1"));
    dt.items.add(new File(["a"], "y.txt"));
    document.getElementById("zone")!.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  const drops = await page.evaluate(() => probe.drops);
  expect(drops).toHaveLength(1);
  expect(drops[0]!.items.map((d) => d.kind)).toEqual(["file", "file"]);
  // Chromium only backs webkitGetAsEntry with a real file system entry for a drop from the OS.
  expect(drops[0]!.items.map((d) => d.entry)).toEqual([null, null]);
  expect(drops[0]!.files).toEqual([
    { name: "x.wk1", size: 6 },
    { name: "y.txt", size: 1 },
  ]);
});

test("(e) crypto.subtle exists on http://localhost", async ({ page }) => {
  await open(page);
  expect(new URL(origin).hostname).toBe("localhost");
  expect(await page.evaluate(() => probe.secure)).toBe(true);
  expect(await page.evaluate(() => probe.subtle)).toBe(true);
});
