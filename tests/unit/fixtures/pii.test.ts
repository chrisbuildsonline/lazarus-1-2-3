import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanBytes, luhn, type AllowEntry } from "../helpers/pii-scan.ts";

// Reviewed false positives. Each entry needs the file path, the exact matched text and a reason.
const ALLOWLIST: AllowEntry[] = [
  {
    path: "fixtures/macros/recorded-explanations.json",
    text: "39853311116591",
    reason: "digits inside the SHA-256 hex key of the \\0 macro's request text, not a card number",
  },
];

function fixtureFiles(dir = "fixtures"): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((e) => (e.isDirectory() ? fixtureFiles(join(dir, e.name)) : e.isFile() ? [join(dir, e.name).replaceAll("\\", "/")] : []));
}

describe("pii scan of fixtures", () => {
  const files = fixtureFiles();
  const hits = files.flatMap((path) => scanBytes(readFileSync(path)).map((h) => ({ path, ...h })));

  it("finds no unreviewed personal data", () => {
    const open = hits.filter((h) => !ALLOWLIST.some((a) => a.path === h.path && a.text === h.text));
    expect(open).toEqual([]);
  });

  it("has no stale allowlist entries", () => {
    for (const a of ALLOWLIST) {
      expect(a.reason.length).toBeGreaterThan(0);
      expect(hits.some((h) => h.path === a.path && h.text === a.text)).toBe(true);
    }
  });
});

const enc = (s: string) => new TextEncoder().encode(s);
const kinds = (s: string) => scanBytes(enc(s)).map((h) => h.kind);

describe("pii scanner samples", () => {
  it.each([
    ["contact me at jane.doe@example.com today", "email"],
    ["call (555) 123-4567 now", "phone"],
    ["call 555-123-4567 now", "phone"],
    ["ssn 123-45-6789 here", "ssn"],
    ["card 4111 1111 1111 1111 exp", "card"],
  ])("finds %s", (text, kind) => {
    expect(kinds(text)).toContain(kind);
  });

  it.each([
    ["1234567890123"],
    ["version 1.2.3"],
    ["date 2026-11-14"],
    ["total 123456"],
  ])("does not flag %s", (text) => {
    expect(scanBytes(enc(text))).toEqual([]);
  });

  it("reports the matched text", () => {
    expect(scanBytes(enc("x jane.doe@example.com y"))).toEqual([
      { kind: "email", text: "jane.doe@example.com" },
    ]);
  });

  it("checks Luhn", () => {
    expect(luhn("4111111111111111")).toBe(true);
    expect(luhn("1234567890123")).toBe(false);
  });

  it("finds pii inside binary noise", () => {
    const bytes = new Uint8Array([0, 1, 2, ...enc("a@b.co"), 0, 255]);
    expect(scanBytes(bytes).map((h) => h.kind)).toEqual(["email"]);
  });
});
