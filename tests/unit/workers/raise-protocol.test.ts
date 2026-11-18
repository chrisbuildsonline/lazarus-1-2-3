// The raise message protocol (requirements 16 to 18): parse, verify and hash in the worker, with
// the sheet sent as a plain cell list.
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWk1 } from "../../../src/parser/index.ts";
import { verifyBytes } from "../../../src/verify/index.ts";
import { handleRaiseRequest, installRaiseWorker, sheetFromWire, sheetToWire, type RaiseResponse, type RaiseScopeLike } from "../../../src/workers/verify-protocol.ts";

type Fixture = { path: string; format: string; sha256: string };
const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: Fixture[] };
const LOTUS = manifest.fixtures.filter((f) => f.format === "wk1" || f.format === "wks");

/** The file's bytes as their own ArrayBuffer, the way a page posts them. */
function buffer(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

async function raise(request: unknown, deps?: Parameters<typeof handleRaiseRequest>[2]): Promise<RaiseResponse[]> {
  const posted: RaiseResponse[] = [];
  await handleRaiseRequest(request, (m) => posted.push(m), deps);
  return posted;
}

/** Every Map anywhere in a value, by path. */
function maps(value: unknown, path = "$"): string[] {
  if (value instanceof Map) return [path];
  if (ArrayBuffer.isView(value) || value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) => maps(v, `${path}.${k}`));
}

describe("handleRaiseRequest over the manifest fixtures", () => {
  it("there are wk1 and wks fixtures to check", () => {
    expect(LOTUS.length).toBeGreaterThanOrEqual(10);
  });

  for (const fixture of LOTUS) {
    it(`${fixture.path}: progress read, progress check, then raised, with the data of the parser and the engine`, async () => {
      const bytes = buffer(fixture.path);
      const name = fixture.path.split("/").pop()!;
      const posted = await raise({ type: "raise", id: 12, name, bytes });
      expect(posted.map((m) => [m.type, m.id, m.type === "progress" ? m.step : null])).toEqual([
        ["progress", 12, "read"],
        ["progress", 12, "check"],
        ["raised", 12, null],
      ]);
      const last = posted[2]!;
      if (last.type !== "raised") throw new Error("not raised");
      const file = last.file;
      const expected = verifyBytes(new Uint8Array(bytes), name);
      expect(file.name).toBe(name);
      expect(file.format).toBe(fixture.format);
      expect(file.sheets.map((s) => s.name)).toEqual(["Sheet1"]);
      expect(file.sheets[0]!.verification.totals).toEqual(expected.verification.totals);
      expect(file.sheets[0]!.verification).toEqual(expected.verification);
      expect(file.diagnostics).toEqual(expected.diagnostics);
      expect(file.byteLength).toBe(readFileSync(fixture.path).byteLength);
      expect(file.sha256).toBe(fixture.sha256);
      expect(sheetFromWire(file.sheets[0]!.sheet)).toEqual(parseWk1(new Uint8Array(bytes)).sheet);
      // Row-major order of the wire cells.
      const order = file.sheets[0]!.sheet.cells.map((c) => [c.row, c.col]);
      expect(order).toEqual([...order].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!));
      // Structured-clone data only, no Map anywhere.
      expect(maps(last)).toEqual([]);
      const cloned = structuredClone(last);
      expect(cloned).toEqual(last);
      if (cloned.type === "raised") expect(sheetFromWire(cloned.file.sheets[0]!.sheet)).toEqual(parseWk1(new Uint8Array(bytes)).sheet);
    });
  }
});

describe("sheetToWire and sheetFromWire", () => {
  for (const fixture of LOTUS) {
    it(`round trip for ${fixture.path}`, () => {
      const sheet = parseWk1(new Uint8Array(buffer(fixture.path))).sheet;
      const wire = sheetToWire(sheet);
      expect(Array.isArray(wire.cells)).toBe(true);
      expect(wire.cells).toHaveLength(sheet.cells.size);
      expect(sheetFromWire(wire)).toEqual(sheet);
    });
  }
});

describe("handleRaiseRequest errors", () => {
  const bytes = () => new ArrayBuffer(4);

  it("a malformed request posts one error, with the id when it is readable", async () => {
    expect(await raise({ type: "raise", name: "a.wk1", bytes: bytes() })).toEqual([{ type: "error", id: null, message: expect.any(String) }]);
    expect(await raise({ type: "raise", id: 1.5, name: "a.wk1", bytes: bytes() })).toEqual([{ type: "error", id: null, message: expect.any(String) }]);
    expect(await raise({ type: "verify", id: 3, name: "a.wk1", bytes: bytes() })).toEqual([{ type: "error", id: 3, message: expect.any(String) }]);
    expect(await raise({ type: "raise", id: 3, name: "a.wk1", bytes: [1, 2] })).toEqual([{ type: "error", id: 3, message: expect.any(String) }]);
    expect(await raise({ type: "raise", id: 3, name: "a.wk1", bytes: new Uint8Array(2) })).toEqual([{ type: "error", id: 3, message: expect.any(String) }]);
    expect(await raise({ type: "raise", id: 3, name: 7, bytes: bytes() })).toEqual([{ type: "error", id: 3, message: expect.any(String) }]);
    expect(await raise({ type: "raise", id: 3, bytes: bytes() })).toEqual([{ type: "error", id: 3, message: expect.any(String) }]);
    expect(await raise(null)).toEqual([{ type: "error", id: null, message: expect.any(String) }]);
    expect(await raise("raise")).toEqual([{ type: "error", id: null, message: expect.any(String) }]);
  });

  it("an injected parse that throws posts an error with its message", async () => {
    const posted = await raise({ type: "raise", id: 4, name: "a.wk1", bytes: bytes() }, {
      parse: () => {
        throw new Error("parser exploded");
      },
    });
    expect(posted).toEqual([{ type: "error", id: 4, message: expect.stringContaining("parser exploded") }]);
  });

  it("an injected verify that throws posts read, then an error", async () => {
    const posted = await raise({ type: "raise", id: 5, name: "a.wk1", bytes: buffer("fixtures/mixed/mixed.wk1") }, {
      verify: () => {
        throw new Error("engine exploded");
      },
    });
    expect(posted).toEqual([
      { type: "progress", id: 5, step: "read" },
      { type: "error", id: 5, message: expect.stringContaining("engine exploded") },
    ]);
  });

  it("an injected hash that throws gives sha256 null and still posts raised", async () => {
    const posted = await raise({ type: "raise", id: 6, name: "mixed.wk1", bytes: buffer("fixtures/mixed/mixed.wk1") }, {
      hash: () => Promise.reject(new TypeError("crypto.subtle is undefined")),
    });
    const last = posted.at(-1)!;
    expect(last.type).toBe("raised");
    if (last.type === "raised") expect(last.file.sha256).toBeNull();
  });

  it("arbitrary bytes never make the handler throw and always end with raised or error", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 512 }), fc.integer(), async (arr, id) => {
        const posted = await raise({ type: "raise", id, name: "x.wk1", bytes: arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) });
        const last = posted.at(-1)!;
        expect(["raised", "error"]).toContain(last.type);
        expect(posted.filter((m) => m.type !== "progress")).toHaveLength(1);
        expect(maps(last)).toEqual([]);
      }),
      { numRuns: 50 },
    );
  });
});

describe("installRaiseWorker and raise.worker.ts", () => {
  it("answers a posted request through postMessage", async () => {
    const posted: RaiseResponse[] = [];
    let done: () => void = () => {};
    const finished = new Promise<void>((r) => (done = r));
    const scope: RaiseScopeLike = {
      onmessage: null,
      postMessage: (m) => {
        posted.push(m);
        if (m.type !== "progress") done();
      },
    };
    installRaiseWorker(scope);
    scope.onmessage?.({ data: { type: "raise", id: 9, name: "mixed.wk1", bytes: buffer("fixtures/mixed/mixed.wk1") } });
    await finished;
    expect(posted.map((m) => m.type)).toEqual(["progress", "progress", "raised"]);
  });

  it("raise.worker.ts holds only the import and the install call", () => {
    const statements = readFileSync("src/workers/raise.worker.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:\\])\/\/.*$/gm, "$1")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/^import \{[^}]*\binstallRaiseWorker\b[^}]*\} from "\.\/verify-protocol\.ts"$/);
    expect(statements[1]).toMatch(/^installRaiseWorker\(self as unknown as RaiseScopeLike\)$/);
  });

  it("the protocol hashes with the existing sha256Hex, not a copy", () => {
    const hash = readFileSync("src/workers/hash.ts", "utf8");
    expect(hash).toMatch(/export \{ sha256Hex \} from "\.\.\/report\/sha256\.ts"/);
    const protocol = readFileSync("src/workers/verify-protocol.ts", "utf8");
    expect(protocol).toMatch(/import \{ sha256Hex \} from "\.\/hash\.ts"/);
    expect(protocol).not.toMatch(/subtle\.digest/);
  });
});
