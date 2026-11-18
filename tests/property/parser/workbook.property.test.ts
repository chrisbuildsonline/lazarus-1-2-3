import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bof } from "../../../scripts/lib/wk3-writer.ts";
import { parseWorkbook } from "../../../src/parser/index.ts";

/** Inputs that steer detection to each reader: noise, a WK3 BOF, a WK1 BOF, a dBase III byte 0. */
const input = fc.oneof(
  fc.uint8Array({ maxLength: 2048 }),
  fc.uint8Array({ maxLength: 2048 }).map((tail) => Uint8Array.from([...bof(), ...tail])),
  fc.uint8Array({ maxLength: 2048 }).map((tail) => Uint8Array.from([0x00, 0x00, 0x02, 0x00, 0x06, 0x04, ...tail])),
  fc.uint8Array({ minLength: 31, maxLength: 2048 }).map((tail) => Uint8Array.from([0x03, ...tail])),
);

describe("parseWorkbook properties", () => {
  it("never throws, keeps sheet names unique, and keeps wk1 addresses in range", () => {
    fc.assert(
      fc.property(input, (bytes) => {
        const result = parseWorkbook(bytes);
        const names = result.workbook.sheets.map((s) => s.name);
        expect(new Set(names).size).toBe(names.length);
        if (result.kind === "wk1") {
          expect(result.workbook.sheets.length).toBe(1);
          for (const cell of result.workbook.sheets[0]!.sheet.cells.values()) {
            expect(cell.col).toBeLessThan(65536);
            expect(cell.row).toBeLessThan(65536);
          }
        }
      }),
      { numRuns: 1000 },
    );
  });
});
