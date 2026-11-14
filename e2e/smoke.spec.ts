import { expect, test } from "@playwright/test";

test("app loads with a heading and no console or page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Lazarus 1-2-3" })).toBeVisible();
  expect(errors).toEqual([]);
});
