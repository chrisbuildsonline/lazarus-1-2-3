import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Every Kiro hook must parse and may only run `bun run <script>` for a script package.json has.
const DIR = ".kiro/hooks";
const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
const files = readdirSync(DIR).filter((f) => f.endsWith(".kiro.hook")).sort();

type Hook = {
  enabled: boolean;
  name: string;
  description: string;
  version: string;
  when: { type: string; patterns?: string[] };
  then: { type: string; command?: string; prompt?: string };
};

const EVENTS = ["fileEdited", "fileCreated", "fileDeleted", "userTriggered", "promptSubmit", "agentStop"];

describe("kiro hooks", () => {
  it("has the four project hooks", () => {
    expect(files).toEqual([
      "fixture-manifest-check.kiro.hook",
      "fixture-pii-scan.kiro.hook",
      "opcode-coverage-check.kiro.hook",
      "parser-differential-tests.kiro.hook",
    ]);
  });

  for (const file of files) {
    it(`${file} parses and runs a script that exists`, () => {
      const hook = JSON.parse(readFileSync(`${DIR}/${file}`, "utf8")) as Hook;
      expect(hook.name.trim()).not.toBe("");
      expect(hook.description.trim()).not.toBe("");
      expect(EVENTS).toContain(hook.when.type);
      if (hook.when.type.startsWith("file")) expect(hook.when.patterns?.length).toBeGreaterThan(0);
      const text = hook.then.type === "runCommand" ? hook.then.command : hook.then.prompt;
      const runs = [...(text ?? "").matchAll(/bun run ([\w:-]+)/g)].map((m) => m[1]!);
      expect(runs.length, file).toBeGreaterThan(0);
      for (const name of runs) expect(Object.keys(scripts), `${file}: bun run ${name}`).toContain(name);
    });
  }
});
