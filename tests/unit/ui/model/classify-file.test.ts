// raised, unsupported or failed, from the worker's answer (requirements 20, 21).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../../../../src/parser/index.ts";
import { classifyRaised, diagnosticLine } from "../../../../src/ui/model/classify-file.ts";
import { handleRaiseRequest, type RaisedFile } from "../../../../src/workers/verify-protocol.ts";

type Fixture = { path: string; format: string };
const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: Fixture[] };

async function raised(bytes: Uint8Array, name: string): Promise<RaisedFile> {
  let file: RaisedFile | null = null;
  await handleRaiseRequest({ type: "raise", id: 1, name, bytes: bytes.slice().buffer }, (m) => {
    if (m.type === "raised") file = m.file;
  });
  if (!file) throw new Error("not raised");
  return file;
}

const fixture = (path: string) => raised(new Uint8Array(readFileSync(path)), path.split("/").pop()!);

describe("classifyRaised", () => {
  for (const f of manifest.fixtures.filter((x) => x.format === "wk1" || x.format === "wks")) {
    it(`${f.path} is raised`, async () => {
      expect(classifyRaised(await fixture(f.path))).toEqual({ kind: "raised" });
    });
  }

  it("the DBF fixture is unsupported", async () => {
    const dbf = manifest.fixtures.find((x) => x.format === "dbf")!;
    expect(dbf.path).toBe("fixtures/natural-earth-land/ne_110m_land.dbf");
    expect(classifyRaised(await fixture(dbf.path))).toEqual({ kind: "unsupported" });
  });

  it("200 bytes of noise are unsupported", async () => {
    const noise = new Uint8Array(200).map((_, i) => (i * 197 + 13) % 251);
    expect(classifyRaised(await raised(noise, "noise.wk1"))).toEqual({ kind: "unsupported" });
  });

  it("a BOF-only WK1 with a truncated record failed, with offset lines", async () => {
    // BOF 0x0406, then a NUMBER record header that claims 13 body bytes with 3 left.
    const bytes = new Uint8Array([0, 0, 2, 0, 6, 4, 0x0e, 0, 13, 0, 1, 2, 3]);
    const file = await raised(bytes, "broken.wk1");
    expect(file.verification.format).toBe("wk1");
    const result = classifyRaised(file);
    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatch(/^offset 0x0006 {2}record 0x000e at 6 says 13 body bytes but 3 remain$/);
  });

  it("a sheet with cells is raised even with an error diagnostic", async () => {
    const file = await fixture("fixtures/mixed/mixed.wk1");
    const withError: RaisedFile = { ...file, diagnostics: [{ severity: "error", code: "trailing-bytes", offset: 3, message: "x" }] };
    expect(classifyRaised(withError)).toEqual({ kind: "raised" });
  });

  it("caps the lines at 50 errors plus an 'and N more' line, skipping warnings", async () => {
    const base = await raised(new Uint8Array([0, 0, 2, 0, 6, 4, 0x0e, 0, 13, 0, 1, 2, 3]), "broken.wk1");
    const errors: Diagnostic[] = Array.from({ length: 60 }, (_, i) => ({ severity: "error", code: "truncated-record", offset: i * 16, message: `bad ${i}` }));
    const warnings: Diagnostic[] = [{ severity: "warning", code: "missing-eof", offset: 0, message: "warn" }];
    const result = classifyRaised({ ...base, diagnostics: [...warnings, ...errors] });
    if (result.kind !== "failed") throw new Error("expected failed");
    expect(result.lines).toHaveLength(51);
    expect(result.lines[0]).toBe("offset 0x0000  bad 0");
    expect(result.lines[1]).toBe("offset 0x0010  bad 1");
    expect(result.lines[49]).toBe("offset 0x0310  bad 49");
    expect(result.lines[50]).toBe("and 10 more");
  });

  it("diagnosticLine writes the offset as upper-case hex, at least four digits", () => {
    expect(diagnosticLine({ severity: "error", code: "truncated-record", offset: 0x1a4, message: "m" })).toBe("offset 0x01A4  m");
    expect(diagnosticLine({ severity: "error", code: "truncated-record", offset: 0x12345, message: "m" })).toBe("offset 0x12345  m");
  });
});
