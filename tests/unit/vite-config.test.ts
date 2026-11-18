// The production Content-Security-Policy (macro-translator requirement 49): one change, the local
// model's origin in connect-src; every other directive as before.
import { describe, expect, it } from "vitest";
import { CSP } from "../../vite.config.ts";

const BEFORE =
  "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

const directives = (csp: string) => new Map(csp.split(";").map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name!, values.join(" ")]));

describe("CSP", () => {
  it("is the exact string", () => {
    expect(CSP).toBe(
      "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' http://localhost:11434; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
    );
  });
  it("changes connect-src only", () => {
    const now = directives(CSP);
    const was = directives(BEFORE);
    expect([...now.keys()]).toEqual([...was.keys()]);
    for (const [name, value] of was) if (name !== "connect-src") expect(now.get(name), name).toBe(value);
    expect(now.get("connect-src")).toBe("'self' http://localhost:11434");
  });
});
