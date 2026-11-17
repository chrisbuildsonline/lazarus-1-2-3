// Worker failure (task 35; requirement 22). The worker script name comes from the build output
// (dist/assets/raise.worker-<hash>.js).
import { expect, test, type Page } from "@playwright/test";
import { files, mismatchWk1, payload } from "./fixtures/seance-files.ts";

const WORKER = "**/assets/*raise*worker*.js";
const list = (page: Page) => page.getByRole("listbox");
const row = (page: Page, name: string) => list(page).getByRole("option").filter({ has: page.locator(".batch-row__name", { hasText: name }) });

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("a worker script that cannot load shows the engine panel, and the pill works once it can", async ({ page }) => {
  await page.route(WORKER, (r) => r.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Summon the sample" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("The checking engine could not start.");
  // Not blank: the Summon view is still there around the panel.
  await expect(page.getByRole("heading", { level: 1, name: "Raise a Lotus 1-2-3 file" })).toBeVisible();
  await expect(page.locator(".btn-primary")).toHaveText("Try another file");

  await alert.getByRole("button", { name: "Copy diagnostics" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("The checking engine could not start.");

  await page.unroute(WORKER);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator(".btn-primary").click()]);
  await chooser.setFiles(files.mismatch());
  await expect(page.getByRole("heading", { level: 1, name: "mismatch.wk1" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a worker that dies after the first file of a batch fails the rest and keeps the first", async ({ page }) => {
  // A loaded worker cannot be stopped by a route, so the test kills it from the page: the second
  // raise request is dropped and the worker reports an error, as a crashed worker does. The route
  // aborts any later load, so a batch that wrongly started a second worker would show it.
  let loads = 0;
  await page.route(WORKER, (r) => (loads++ === 0 ? r.continue() : r.abort()));
  await page.addInitScript(() => {
    const Real = window.Worker;
    window.Worker = class extends Real {
      posts = 0;
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
        if (++this.posts === 2) {
          this.terminate();
          setTimeout(() => this.dispatchEvent(new ErrorEvent("error", { message: "killed by the test" })));
          return;
        }
        super.postMessage(message, transfer as Transferable[]);
      }
    };
  });
  await page.goto("/");
  const bytes = mismatchWk1();
  await page.locator('input[type="file"][accept]').setInputFiles([payload("a.wk1", bytes), payload("b.wk1", bytes), payload("c.wk1", bytes)]);

  await expect(page.getByRole("heading", { level: 2, name: "3 files" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "a.wk1" })).toBeVisible();
  await expect(row(page, "a.wk1").locator(".pill")).toHaveText("Mismatched");
  // The worker is not alive any more (requirement 22): the rest of the batch fails with its message
  // and no second worker is started for it.
  for (const name of ["b.wk1", "c.wk1"]) {
    await expect(row(page, name).locator(".pill.pill--danger")).toHaveText("Failed");
    await expect(row(page, name).locator(".batch-row__line")).toHaveText("Could not raise: The checking engine stopped. (killed by the test)");
  }
  expect(loads).toBe(1);
});
