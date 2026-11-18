import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";
import { installVerifyWorker, type VerifyResponse, type WorkerScopeLike } from "../../../src/workers/verify-protocol.ts";

/** Source with comments removed, so a comment that names an API does not count. */
const code = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));

const imports = (path: string) => [...code(path).matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g)].map((m) => normalize(join(dirname(path), m[1] ?? m[2] ?? "")));

function fakeScope() {
  const posted: VerifyResponse[] = [];
  const scope: WorkerScopeLike = { onmessage: null, postMessage: (m) => posted.push(m) };
  return { scope, posted };
}

describe("installVerifyWorker (requirement 8)", () => {
  it("answers a posted request through postMessage", () => {
    const { scope, posted } = fakeScope();
    installVerifyWorker(scope);
    scope.onmessage?.({ data: { type: "verify", id: 3, bytes: new ArrayBuffer(0) } });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: "result", id: 3 });
  });

  it("answers two requests in order, each with its own id", () => {
    const { scope, posted } = fakeScope();
    installVerifyWorker(scope);
    const b = readFileSync("fixtures/mixed/mixed.wk1");
    scope.onmessage?.({ data: { type: "verify", id: 10, bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } });
    scope.onmessage?.({ data: { type: "verify", id: 11 } });
    expect(posted.map((m) => [m.type, m.id])).toEqual([
      ["result", 10],
      ["error", 11],
    ]);
  });

  it("verify.worker.ts holds only the import and the install call", () => {
    const statements = code("src/workers/verify.worker.ts")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/^import \{[^}]*\binstallVerifyWorker\b[^}]*\} from "\.\/verify-protocol\.ts"$/);
    expect(statements[1]).toMatch(/^installVerifyWorker\(self as unknown as WorkerScopeLike\)$/);
  });
});

describe("worker and engine boundaries (requirement 10)", () => {
  for (const file of [...files("src/workers"), ...files("src/verify")]) {
    it(`${file} calls no network API`, () => {
      expect(code(file)).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|importScripts)\b/);
    });
  }

  it("verify-protocol.ts imports only ../verify/index.ts, ../parser/index.ts, ../macro/index.ts and its own files", () => {
    // macro-translator design.md "Layout": workers import macro.
    for (const target of imports("src/workers/verify-protocol.ts")) {
      expect(["src/verify/index.ts", "src/parser/index.ts", "src/macro/index.ts"].includes(target) || target.startsWith("src/workers/"), target).toBe(true);
    }
  });

  it("verify.worker.ts imports only verify-protocol.ts", () => {
    expect(imports("src/workers/verify.worker.ts")).toEqual(["src/workers/verify-protocol.ts"]);
  });
});
