import { expect, test } from "@playwright/test";

test("app loads with a heading and no console or page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Raise a Lotus 1-2-3 file" })).toBeVisible();
  expect(errors).toEqual([]);
});
