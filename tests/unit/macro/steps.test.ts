import { describe, expect, it } from "vitest";
import { BRACE_COMMANDS, BRACE_KEYS, MENU_ROOT } from "../../../src/macro/menu.ts";
import { joinLines, parseSteps } from "../../../src/macro/steps.ts";

const labels = (text: string) => parseSteps(text).steps.map((s) => [s.kind, s.label]);

describe("parseSteps: braces, tilde, text", () => {
  const rows: [string, [string, string][]][] = [
    ["{GOTO}B2~", [["key", "Go to B2"]]],
    ["{DOWN 3}", [["key", "Press Down 3 times"]]],
    ["{DOWN}", [["key", "Press Down"]]],
    ["{EDIT}{CALC}", [["key", "Press Edit (F2)"], ["key", "Press Calc (F9)"]]],
    ["{?}", [["key", "Wait for typing, until Enter is pressed"]]],
    ["{BRANCH LOOP}", [["command", "Continue the macro at LOOP"]]],
    ["{QUIT}", [["command", "End the macro"]]],
    ["{LET A1,5}", [["command", "Put 5 in A1"]]],
    ["{IF B2>3}", [["command", "If B2>3 is true, run the rest of this line; otherwise go to the next line"]]],
    ["{FOO 1,2}", [["command", "Macro command FOO with 1, 2"]]],
    ["~", [["enter", "Press Enter"]]],
    ["Total", [["type", 'Type "Total"']]],
    ["{{}{}}{~}", [["type", 'Type "{"'], ["type", 'Type "}"'], ["type", 'Type "~"']]],
    ["{}", [["type", 'Type "{}"']]],
  ];
  for (const [text, expected] of rows) it(`${text}`, () => expect(labels(text)).toEqual(expected));

  it("keeps an unclosed brace as typed text with a diagnostic", () => {
    const r = parseSteps("ab{FOO");
    expect(r.steps.map((s) => [s.kind, s.raw, s.label])).toEqual([
      ["type", "ab", 'Type "ab"'],
      ["type", "{FOO", 'Type "{FOO"'],
    ]);
    expect(r.diagnostics).toEqual([{ code: "unclosed-brace", offset: 2, message: "the brace at offset 2 is not closed; the rest is kept as typed text" }]);
  });
  it("says a GOTO without its tilde is not finished", () => {
    expect(labels("{GOTO}B2")).toEqual([["key", "Go to B2 (not finished)"]]);
    expect(labels("{GOTO}B2{DOWN}").map((l) => l[1])).toEqual(["Go to B2 (not finished)", "Press Down"]);
  });
  it("gives each step its offset and the index of its line", () => {
    const { text, lineStarts } = joinLines(["{GOTO}A1~", "Total~"]);
    expect(text).toBe("{GOTO}A1~Total~");
    expect(lineStarts).toEqual([0, 9]);
    expect(parseSteps(text, lineStarts).steps.map((s) => [s.start, s.line])).toEqual([
      [0, 0],
      [9, 1],
      [14, 1],
    ]);
  });
  it("keeps the args and the upper-cased name", () => {
    expect(parseSteps("{let A1,5}").steps[0]).toMatchObject({ kind: "command", name: "LET", args: ["A1", "5"] });
  });
});

describe("parseSteps: slash keys", () => {
  it("gives one unknown-key step per key, since the menu tree is not sourced (evidence.md c)", () => {
    expect(parseSteps("/PPX").steps.map((s) => [s.kind, s.raw, s.label])).toEqual([
      ["unknown-key", "/P", 'Unknown menu key "P"'],
      ["unknown-key", "P", 'Unknown menu key "P"'],
      ["unknown-key", "X", 'Unknown menu key "X"'],
    ]);
  });
  it("reads menu keys up to a tilde or a brace", () => {
    expect(labels("/RE~{GOTO}A1~")).toEqual([
      ["unknown-key", 'Unknown menu key "R"'],
      ["unknown-key", 'Unknown menu key "E"'],
      ["enter", "Press Enter"],
      ["key", "Go to A1"],
    ]);
  });
  it("a slash after typed text is typed too", () => {
    expect(labels("1/2~")).toEqual([["type", 'Type "1/2"'], ["enter", "Press Enter"]]);
  });
  it("a slash alone is an open menu with no key", () => {
    expect(labels("/")).toEqual([["unknown-key", "Open the menu (no key follows)"]]);
  });
});

describe("menu.ts tables", () => {
  it("every entry names its source", () => {
    for (const [, e] of [...BRACE_KEYS, ...BRACE_COMMANDS]) expect(e.source.length).toBeGreaterThan(0);
    for (const e of MENU_ROOT) expect(e.source.length).toBeGreaterThan(0);
  });
  it("holds no menu entry, because no Release 2 source was readable", () => {
    expect(MENU_ROOT).toEqual([]);
  });
});
