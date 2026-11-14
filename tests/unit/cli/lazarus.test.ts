import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildAll } from "../../../scripts/gen-fixtures.ts";
import { writeWk1 } from "../../../scripts/lib/wk1-writer.ts";
import { detectFormat, formatLine, inventoryFile, walk } from "../../../src/cli/inventory.ts";
import { SAMPLE_DBF } from "../helpers/dbf-sample.ts";

const WK1 = buildAll().find((f) => f.path.endsWith("mixed.wk1"))!.bytes;
const WKS = writeWk1(0x0404, [{ kind: "integer", col: 0, row: 0, value: 1 }]);
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

// Temp corpus: nested dirs, a mislabelled file, an unknown file and a symlink.
const root = mkdtempSync(join(tmpdir(), "lazarus-cli-"));
mkdirSync(join(root, "a", "y"), { recursive: true });
writeFileSync(join(root, "b.wk1"), WK1);
writeFileSync(join(root, "a", "z.dbf"), SAMPLE_DBF);
writeFileSync(join(root, "a", "y", "x.wks"), WKS);
writeFileSync(join(root, "c.txt"), "not a spreadsheet");
writeFileSync(join(root, "d.dbf"), WK1);
symlinkSync(join(root, "b.wk1"), join(root, "link.wk1"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function collect(path: string): Promise<string[]> {
  const out: string[] = [];
  for await (const p of walk(path)) out.push(p);
  return out;
}

describe("walk", () => {
  it("lists files recursively in sorted order and skips symlinks", async () => {
    expect(await collect(root)).toEqual(["a/y/x.wks", "a/z.dbf", "b.wk1", "c.txt", "d.dbf"].map((p) => join(root, p)));
  });

  it("yields a single file path as is", async () => {
    expect(await collect(join(root, "b.wk1"))).toEqual([join(root, "b.wk1")]);
  });
});

describe("inventoryFile", () => {
  it("reports path, format, size and sha256", async () => {
    expect(await inventoryFile(join(root, "a", "z.dbf"))).toEqual({
      path: join(root, "a", "z.dbf"),
      format: "dbf",
      size: SAMPLE_DBF.length,
      sha256: sha256(SAMPLE_DBF),
    });
  });

  it("carries the note when the extension disagrees", async () => {
    expect(await inventoryFile(join(root, "d.dbf"))).toEqual({
      path: join(root, "d.dbf"),
      format: "wk1",
      size: WK1.length,
      sha256: sha256(WK1),
      note: "extension says dbf",
    });
  });
});

describe("formatLine", () => {
  it("joins path, format, size and sha256 with tabs", () => {
    expect(formatLine({ path: "f/x.wk1", format: "wk1", size: 12, sha256: "ab" })).toBe("f/x.wk1\twk1\t12\tab");
  });

  it("appends the extension note", () => {
    expect(formatLine({ path: "d.dbf", format: "wk1", size: 1, sha256: "ab", note: "extension says dbf" })).toBe(
      "d.dbf\twk1\t1\tab\t(extension says dbf)",
    );
  });
});

describe("detectFormat", () => {
  it("detects WK1 from a BOF with version 0x0406", () => {
    expect(detectFormat(WK1, ".wk1")).toEqual({ format: "wk1" });
  });

  it("detects WKS from a BOF with version 0x0404", () => {
    expect(detectFormat(WKS, ".wks")).toEqual({ format: "wks" });
  });

  it("detects DBF from the version byte and a consistent header", () => {
    expect(detectFormat(SAMPLE_DBF, ".dbf")).toEqual({ format: "dbf" });
  });

  it("ignores the case of the extension", () => {
    expect(detectFormat(WK1, ".WK1")).toEqual({ format: "wk1" });
  });

  it("reports unknown for other bytes, empty and short files", () => {
    expect(detectFormat(new TextEncoder().encode("hello, world"), ".txt")).toEqual({ format: "unknown" });
    expect(detectFormat(new Uint8Array(0), "")).toEqual({ format: "unknown" });
    expect(detectFormat(WK1.subarray(0, 5), "")).toEqual({ format: "unknown" });
    expect(detectFormat(SAMPLE_DBF.subarray(0, 31), "")).toEqual({ format: "unknown" });
  });

  it("reports unknown for a BOF version outside the table", () => {
    const symphony = Uint8Array.from(WK1);
    symphony[4] = 0x05; // 0x0405
    expect(detectFormat(symphony, "")).toEqual({ format: "unknown" });
  });

  it("reports unknown for a DBF header that does not fit the file", () => {
    const records = Uint8Array.from(SAMPLE_DBF);
    records[4] = 50; // 50 records of 19 bytes cannot fit
    expect(detectFormat(records, ".dbf")).toEqual({ format: "unknown", note: "extension says dbf" });
  });

  it("trusts the bytes and adds a note when the extension disagrees", () => {
    expect(detectFormat(WK1, ".dbf")).toEqual({ format: "wk1", note: "extension says dbf" });
    expect(detectFormat(WKS, ".wk1")).toEqual({ format: "wks", note: "extension says wk1" });
    expect(detectFormat(SAMPLE_DBF, ".wks")).toEqual({ format: "dbf", note: "extension says wks" });
  });

  it("adds no note for extensions that name no corpus format", () => {
    expect(detectFormat(WK1, ".bak")).toEqual({ format: "wk1" });
  });
});
