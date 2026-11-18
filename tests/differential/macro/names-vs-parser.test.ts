// The walker and parseWk1 must agree on how many NAME (0x0B) records each real fixture holds:
// parseWk1 skips them by length and counts them in skippedByOpcode.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readNames } from "../../../src/macro/names.ts";
import { parseWk1 } from "../../../src/parser/wk1.ts";

const root = new URL("../../../fixtures/", import.meta.url).pathname;
const files = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => readdirSync(join(root, d.name)).filter((f) => /\.(wk1|wks)$/i.test(f)).map((f) => join(d.name, f)));

describe("NAME walker against parseWk1 (real and synthetic fixtures)", () => {
  it("has fixtures to compare", () => expect(files.length).toBeGreaterThan(3));
  for (const file of files) {
    it(`${file}: same number of NAME records`, () => {
      const bytes = new Uint8Array(readFileSync(join(root, file)));
      const { names, notes } = readNames(bytes);
      const dupes = notes.filter((n) => n.startsWith("two ranges")).length;
      expect(names.length + dupes).toBe(parseWk1(bytes).stats.skippedByOpcode[0x0b] ?? 0);
    });
  }
});
