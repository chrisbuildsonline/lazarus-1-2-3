import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import viteConfig, { previewPort } from "../../../vite.config.ts";

// The Docker images run the checks as a non-root user (the chmod 000 tests in tests/unit/cli and
// tests/unit/mcp need one) and the e2e image's Chromium must match @playwright/test.
const dockerfile = readFileSync("Dockerfile", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
const ignore = readFileSync(".dockerignore", "utf8").split("\n").map((l) => l.trim());
const readme = readFileSync("README.md", "utf8");

/** Each stage's lines, by its `AS` name. */
function stages(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of dockerfile.split("\n")) {
    const from = /^FROM\s+\S+\s+AS\s+(\S+)/i.exec(line);
    if (from) out.set(from[1]!, (current = []));
    else if (current && line.trim() && !line.startsWith("#")) current.push(line.trim());
  }
  return out;
}

describe("Dockerfile", () => {
  it("has the test and e2e targets the scripts build", () => {
    expect([...stages().keys()]).toEqual(expect.arrayContaining(["test", "e2e"]));
    expect(pkg.scripts["docker:test"]).toContain("--target test");
    expect(pkg.scripts["docker:e2e"]).toContain("--target e2e");
  });

  for (const target of ["test", "e2e"]) {
    it(`runs the ${target} stage as a non-root user`, () => {
      const lines = stages().get(target)!;
      const user = lines.filter((l) => l.startsWith("USER ")).at(-1);
      expect(user).toBeDefined();
      expect(user!.slice(5).trim()).not.toMatch(/^(root|0)(:|$)/);
      expect(lines.indexOf(user!)).toBeLessThan(lines.findIndex((l) => l.startsWith("CMD ")));
    });
  }

  it("runs typecheck, the unit suite and e2e with CI=1", () => {
    expect(stages().get("test")!.join("\n")).toMatch(/CMD .*bun run typecheck && bun run test/);
    expect(stages().get("e2e")!.join("\n")).toContain('CMD ["bun", "run", "e2e"]');
    for (const target of ["test", "e2e"]) expect(stages().get(target)).toContain("ENV CI=1");
  });

  it("pins the Playwright image to the installed @playwright/test version", () => {
    const pinned = /^ARG PLAYWRIGHT_VERSION=(\S+)$/m.exec(dockerfile)?.[1];
    const installed = (JSON.parse(readFileSync("node_modules/@playwright/test/package.json", "utf8")) as { version: string }).version;
    expect(pinned).toBe(installed);
  });

  it("installs from the lockfile and leaves local state out of the context", () => {
    expect(dockerfile).toContain("bun install --frozen-lockfile");
    for (const p of [".git", "node_modules", "dist", "test-results", ".backups", ".env", "docs/sources"]) expect(ignore).toContain(p);
  });

  // Jury run 145: the app never answered in the judge container, because a bare `vite preview`
  // listens on localhost only. The default (last) stage is the app, served on all interfaces.
  it("builds and serves the app in the default (last) stage, as a non-root user", () => {
    const all = [...stages()];
    const [name, lines] = all.at(-1)!;
    expect(name).toBe("app");
    const text = lines.join("\n");
    expect(text).toContain("RUN bun run build");
    expect(text).toContain("ENV PORT=4173");
    expect(text).toContain("EXPOSE 4173");
    expect(text).toContain('CMD ["bun", "run", "preview"]');
    const user = lines.filter((l) => l.startsWith("USER ")).at(-1);
    expect(user).toBeDefined();
    expect(user!.slice(5).trim()).not.toMatch(/^(root|0)(:|$)/);
    expect(lines.indexOf(user!)).toBeLessThan(lines.findIndex((l) => l.startsWith("CMD ")));
  });

  it("binds vite preview to 0.0.0.0 on $PORT (default 4173) with a strict port", () => {
    expect(pkg.scripts.preview).toBe("vite preview --host 0.0.0.0 --strictPort");
    expect(viteConfig.preview).toMatchObject({ host: "0.0.0.0", strictPort: true });
    expect(previewPort({})).toBe(4173);
    expect(previewPort({ PORT: "" })).toBe(4173);
    expect(previewPort({ PORT: "45151" })).toBe(45151);
    expect(() => previewPort({ PORT: "http" })).toThrow(/PORT/);
  });

  it("README and package.json give the same docker commands", () => {
    const run = "docker build -t lazarus . && docker run --rm -p 4173:4173 lazarus";
    expect(pkg.scripts["docker:app"]).toBe(run);
    expect(readme).toContain(run);
    for (const script of ["docker:test", "docker:e2e"]) expect(readme).toContain(pkg.scripts[script]!);
  });
});
