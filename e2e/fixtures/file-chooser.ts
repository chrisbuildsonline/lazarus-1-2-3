// File chooser interception that stays on for the whole page. Playwright turns Chromium's
// interception off whenever the last "filechooser" listener goes (each waitForEvent removes its
// own), and turns it back on with a message it does not wait for, so on a loaded machine a key
// press can reach the page first; headless Chromium then drops the chooser and the test waits
// forever. One listener for the page's lifetime keeps interception on, and the round trip makes
// sure it is on before the first press.
import type { Page } from "@playwright/test";

export async function interceptFileChoosers(page: Page): Promise<void> {
  page.on("filechooser", () => {});
  await page.evaluate(() => 0);
}
