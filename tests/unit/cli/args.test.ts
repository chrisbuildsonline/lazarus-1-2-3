import { describe, expect, it } from "vitest";
import { parseArgs } from "../../../src/cli/args.ts";

const ok = (over: Partial<{ path: string; json: boolean; verify: boolean; xlsx: string | null; report: { path: string; format: "json" | "html" } | null }> = {}) => ({
  kind: "ok",
  path: "book.wk1",
  json: false,
  verify: false,
  xlsx: null,
  report: null,
  ...over,
});

describe("parseArgs (requirements 47, 48, 52)", () => {
  it("accepts a path alone", () => {
    expect(parseArgs(["book.wk1"])).toEqual(ok());
  });

  it("accepts every flag the old CLI knew, in any order, the same way", () => {
    expect(parseArgs(["book.wk1", "--json"])).toEqual(ok({ json: true }));
    expect(parseArgs(["book.wk1", "--verify"])).toEqual(ok({ verify: true }));
    expect(parseArgs(["book.wk1", "--json", "--verify"])).toEqual(ok({ json: true, verify: true }));
    expect(parseArgs(["--verify", "--json", "book.wk1"])).toEqual(ok({ json: true, verify: true }));
    expect(parseArgs(["--json", "book.wk1", "--verify"])).toEqual(ok({ json: true, verify: true }));
    // The old CLI filtered --json and --verify out wherever they were, so a repeat was harmless.
    expect(parseArgs(["book.wk1", "--json", "--json"])).toEqual(ok({ json: true }));
  });

  it("accepts --xlsx and --report with a value, in any order", () => {
    expect(parseArgs(["book.wk1", "--xlsx", "out.xlsx"])).toEqual(ok({ xlsx: "out.xlsx" }));
    expect(parseArgs(["book.wk1", "--report", "out.json"])).toEqual(ok({ report: { path: "out.json", format: "json" } }));
    expect(parseArgs(["book.wk1", "--report", "out.HTML"])).toEqual(ok({ report: { path: "out.HTML", format: "html" } }));
    expect(parseArgs(["--report", "r.html", "--xlsx", "o.XLSX", "--verify", "book.wk1", "--json"])).toEqual(
      ok({ json: true, verify: true, xlsx: "o.XLSX", report: { path: "r.html", format: "html" } }),
    );
  });

  const usage = (argv: string[]) => {
    const r = parseArgs(argv);
    expect(r.kind, argv.join(" ")).toBe("usage");
    return r.kind === "usage" ? r.message : "";
  };

  it("gives a usage error for a missing path or two paths", () => {
    expect(usage([])).toMatch(/path/);
    expect(usage(["--json", "--verify"])).toMatch(/path/);
    expect(usage(["a.wk1", "b.wk1"])).toMatch(/one path/);
    expect(usage(["a.wk1", "--xlsx", "o.xlsx", "b.wk1"])).toMatch(/one path/);
  });

  it("gives a usage error for a flag with no value or followed by a flag", () => {
    expect(usage(["book.wk1", "--xlsx"])).toMatch(/--xlsx needs a value/);
    expect(usage(["book.wk1", "--report"])).toMatch(/--report needs a value/);
    expect(usage(["book.wk1", "--xlsx", "--json"])).toMatch(/--xlsx needs a value/);
    expect(usage(["book.wk1", "--report", "--xlsx", "o.xlsx"])).toMatch(/--report needs a value/);
  });

  it("gives a usage error for a repeated --xlsx or --report", () => {
    expect(usage(["book.wk1", "--xlsx", "a.xlsx", "--xlsx", "b.xlsx"])).toMatch(/--xlsx.*once/);
    expect(usage(["book.wk1", "--report", "a.json", "--report", "b.html"])).toMatch(/--report.*once/);
  });

  it("gives a usage error for a wrong extension", () => {
    expect(usage(["book.wk1", "--report", "out.txt"])).toMatch(/\.json or \.html/);
    expect(usage(["book.wk1", "--report", "out"])).toMatch(/\.json or \.html/);
    expect(usage(["book.wk1", "--xlsx", "out.xls"])).toMatch(/\.xlsx/);
  });

  it("gives a usage error for the --flag=value spelling and for unknown flags", () => {
    expect(usage(["book.wk1", "--xlsx=out.xlsx"])).toMatch(/--xlsx=out\.xlsx/);
    expect(usage(["book.wk1", "--report=out.json"])).toMatch(/--report=out\.json/);
    expect(usage(["book.wk1", "--bogus"])).toMatch(/--bogus/);
  });
});
