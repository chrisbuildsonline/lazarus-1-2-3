// The Macros step (macro spec design.md "e2e", Acceptance 7): the flow with the mouse and the keys,
// the phone dialog, an offline local model, axe, and the network. macros.wk1 has four queue items, all
// with a recorded explanation, so cases 1 and 2 make no request to the local model.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { writeWk1 } from "../scripts/lib/wk1-writer.ts";
import { payload, type Payload } from "./fixtures/seance-files.ts";
import { watchNetwork } from "./fixtures/network.ts";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const OLLAMA = "http://localhost:11434";
const macrosFile = () => payload("macros.wk1", readFileSync("fixtures/macros/macros.wk1"));
const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const status = (page: Page) => page.locator(".macros__status");
const options = (page: Page) => page.getByRole("listbox", { name: "Macros and unknown codes" }).getByRole("option");
const toast = (page: Page, text: string) => page.locator(".toast", { hasText: text });

async function scan(page: Page, testInfo: TestInfo, label: string) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const lesser = result.violations.filter((v) => v.impact !== "serious" && v.impact !== "critical");
  const severe = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = (vs: typeof result.violations) => vs.map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  if (lesser.length > 0) console.log(`[axe ${label}] lesser findings:\n${summary(lesser).join("\n")}`);
  await testInfo.attach(`axe-${label}.json`, { body: JSON.stringify(result.violations, null, 2), contentType: "application/json" });
  expect(result.passes.length, `axe ran rules on ${label}`).toBeGreaterThan(0);
  expect(summary(severe), `serious or critical axe violations on ${label}`).toEqual([]);
}

async function raise(page: Page, file: Payload) {
  await page.goto("/");
  await page.locator('input[type="file"][accept]').setInputFiles(file);
  await expect(h1(page, file.name)).toBeVisible();
}

/** Console errors, page errors and failed requests, for the cases that must have none. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
  return errors;
}

async function download(page: Page, name: string): Promise<Buffer> {
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name, exact: true }).click()]);
  return readFileSync(await d.path());
}

async function openMacros(page: Page, tab = "Macros 4") {
  await page.getByRole("tab", { name: tab }).click();
  await expect(h1(page, "Macros")).toBeVisible();
}

test("flow at 1440: approve with the mouse, R, Z, R, and the JSON report holds the decisions", async ({ page, baseURL }) => {
  const errors = watchErrors(page);
  const net = watchNetwork(page, baseURL!);
  await page.setViewportSize(DESKTOP);
  await raise(page, macrosFile());
  const xlsxBefore = await download(page, "Download XLSX");

  await openMacros(page);
  await expect(page).toHaveTitle("Macros · macros.wk1 · Lazarus 1-2-3");
  await expect(status(page)).toHaveText("4 waiting");
  await expect(options(page)).toHaveCount(4);
  await expect(options(page).first()).toHaveAttribute("aria-selected", "true");
  // No primary pill in the top bar on this step; the one primary is Approve.
  await expect(page.locator(".topbar .btn-primary")).toHaveCount(0);
  await expect(page.locator(".btn-primary")).toHaveCount(1);

  const detail = page.locator(".macro-detail");
  await expect(detail.getByText("Moves the cell pointer to A1, recalculates the worksheet, and ends the macro.")).toBeVisible();
  await expect(detail.getByText("recorded fixture")).toBeVisible();
  const stepsFirst = await detail.evaluate((el) => {
    const labels = [...el.querySelectorAll(".macro-detail__label")].map((l) => l.textContent ?? "");
    return labels.findIndex((t) => t.startsWith("Parsed")) < labels.findIndex((t) => t.startsWith("Explanation"));
  });
  expect(stepsFirst).toBe(true);
  await expect(detail.getByText("Go to A1")).toBeVisible();

  // Approve with the mouse: toast, counts, focus on the next waiting option.
  await detail.getByRole("button", { name: "Approve" }).click();
  await expect(toast(page, "Approved. Press Z to undo.")).toBeVisible();
  await expect(status(page)).toHaveText("3 waiting · 1 approved");
  await expect(options(page).nth(1)).toBeFocused();

  await page.keyboard.press("r");
  await expect(status(page)).toHaveText("2 waiting · 1 approved · 1 rejected");
  await expect(toast(page, "Rejected. Press Z to undo.")).toBeVisible();
  await expect(options(page).nth(2)).toBeFocused();

  await page.keyboard.press("z");
  await expect(status(page)).toHaveText("3 waiting · 1 approved");
  await expect(toast(page, "Decision undone.")).toBeVisible();
  await expect(options(page).nth(1)).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(options(page).nth(2)).toBeFocused();
  await expect(options(page).nth(2)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("r");
  await expect(status(page)).toHaveText("2 waiting · 1 approved · 1 rejected");

  // Single-key shortcuts act only inside the list (WCAG 2.1.4).
  await detail.getByRole("button", { name: "Approve" }).focus();
  await page.keyboard.press("a");
  await expect(status(page)).toHaveText("2 waiting · 1 approved · 1 rejected");

  await page.mouse.move(0, 0);
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 15_000 });
  await page.screenshot({ path: "e2e/screenshots/macros-1440.png", animations: "disabled" });

  // Back on the Sheet step: the JSON report carries the decisions, the XLSX bytes did not move.
  await page.getByRole("tab", { name: "Sheet" }).click();
  await expect(h1(page, "macros.wk1")).toBeVisible();
  const report = JSON.parse((await download(page, "JSON")).toString("utf8"));
  const statuses = report.macros.map((m: { status: string }) => m.status).sort();
  expect(statuses).toEqual(["approved", "pending", "pending", "rejected"]);
  for (const m of report.macros) {
    if (m.status === "pending") expect(m.decidedAt).toBeNull();
    else expect(m.decidedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d/);
  }
  // macros.wk1 has one formula, A10, stopped by its unknown opcode (fixtures spec, Acceptance 4).
  expect(report.totals).toMatchObject({ formulas: 1, matched: 0, mismatched: 0, unverifiable: 1 });
  expect(report.rows.find((r: { address: string }) => r.address === "A10")).toMatchObject({ status: "unverifiable" });
  const xlsxAfter = await download(page, "Download XLSX");
  expect(xlsxAfter.equals(xlsxBefore)).toBe(true);

  expect(net.requests.filter((r) => r.url().startsWith(OLLAMA))).toEqual([]);
  net.expectOnlyStatic();
  expect(errors).toEqual([]);
});

test("phone 390: tabs under the title, the dialog traps focus, Escape and approve return focus", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize(PHONE);
  await raise(page, macrosFile());
  const tab = page.getByRole("tab", { name: "Macros 4" });
  const titleBox = (await h1(page, "macros.wk1").boundingBox())!;
  expect((await tab.boundingBox())!.y).toBeGreaterThan(titleBox.y);
  await openMacros(page);
  await expect(page.locator(".macro-detail")).toHaveCount(0);

  await options(page).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const approve = dialog.getByRole("button", { name: "Approve" });
  const box = (await approve.boundingBox())!;
  expect(Math.round(box.height)).toBe(48);
  expect(PHONE.height - (box.y + box.height)).toBeLessThanOrEqual(16);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1}`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(options(page).first()).toBeFocused();

  await options(page).first().click();
  await expect(dialog).toBeVisible();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: "e2e/screenshots/macros-390.png", animations: "disabled" });
  await dialog.getByRole("button", { name: "Approve" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(status(page)).toHaveText("3 waiting · 1 approved");
  await expect(options(page).nth(1)).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("offline model: one POST with the macro text and no sheet value, then unavailable, Approve works", async ({ page }) => {
  // Sentinels: a number, a label and a formula result that must never leave the page.
  const SENTINELS = ["73411", "ZEPHYRQX", "146822"];
  const bytes = writeWk1(
    0x0406,
    [
      { kind: "number", col: 0, row: 0, value: 73411 },
      { kind: "label", col: 0, row: 1, prefix: "'", text: "ZEPHYRQX" },
      // A3 = +A1+A1 stored as 146822: REF with relative column 0 (0x8000) and row -2 (0x8000 | 0x3FFE), twice, ADD, RET.
      { kind: "formula", col: 0, row: 2, cached: 146822, rpn: [0x01, 0x00, 0x80, 0xfe, 0xbf, 0x01, 0x00, 0x80, 0xfe, 0xbf, 0x09, 0x03] },
      { kind: "label", col: 2, row: 0, prefix: "'", text: "{GOTO}C5~{CALC}" },
    ],
    [{ name: "\\Q", startCol: 2, startRow: 0, endCol: 2, endRow: 0 }],
  );
  const posts: string[] = [];
  await page.route(`${OLLAMA}/**`, (route) => {
    if (route.request().method() === "POST") posts.push(route.request().postData() ?? "");
    return route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" }, body: "" });
  });
  await page.setViewportSize(DESKTOP);
  await raise(page, payload("offline.wk1", bytes));
  await openMacros(page, "Macros 1");
  const detail = page.locator(".macro-detail");
  await expect(detail.getByText("Explanation unavailable: the local model is not running. The steps above are complete.")).toBeVisible();
  expect(posts).toHaveLength(1);
  const body = JSON.parse(posts[0]!);
  expect(body.model).toBe("qwen3");
  expect(body.messages).toHaveLength(2);
  expect(body.messages[0].role).toBe("system");
  expect(body.messages[1].role).toBe("user");
  expect(body.messages[1].content).toContain("{GOTO}C5~{CALC}");
  for (const s of SENTINELS) expect(posts[0], s).not.toContain(s);
  await detail.getByRole("button", { name: "Approve" }).click();
  await expect(status(page)).toHaveText("0 waiting · 1 approved");
  expect(posts).toHaveLength(1);
});

test.describe("axe on the Macros step", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("at 1440, at 390, and with the phone dialog open", async ({ page }, testInfo) => {
    await page.setViewportSize(DESKTOP);
    await raise(page, macrosFile());
    await openMacros(page);
    await expect(page.locator(".macro-detail").getByText("recorded fixture")).toBeVisible();
    await scan(page, testInfo, "macros-1440");
    await page.setViewportSize(PHONE);
    await expect(page.locator(".macro-detail")).toHaveCount(0);
    await scan(page, testInfo, "macros-390");
    await options(page).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await scan(page, testInfo, "macros-dialog");
  });
});
