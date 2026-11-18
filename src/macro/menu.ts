// The tables the step parser reads. Every entry names its source (evidence.md, items c and d).
// Q31 = Lotus 1-2-3 Release 3.1 Quick Reference, R4 = 1-2-3 Release 4 for Windows help (IBM mirror),
// FAQ = 123elf wiki. No Release 2 manual was readable, so the menu tree is empty: a key after "/"
// becomes an unknown-key step and the person, or the local model's explanation, reads it.

export type MenuEntry = {
  key: string;
  name: string;
  children?: MenuEntry[];
  prompts?: number;
  describe?: (args: string[]) => string;
  stays?: boolean;
  source: string;
};

/** Empty until a Release 2 menu map is sourced (evidence.md, "What the later tasks may use"). */
export const MENU_ROOT: readonly MenuEntry[] = [];

type Label = (args: string[]) => string;
type KeyEntry = { label: Label; countable?: boolean; source: string };

const press = (name: string): KeyEntry["label"] => () => `Press ${name}`;
const FKEYS = "Q31 pp. 1-2 (function key; brace spelling one source at most)";

export const BRACE_KEYS: ReadonlyMap<string, KeyEntry> = new Map<string, KeyEntry>([
  ["GOTO", { label: ([to]) => `Go to ${to}`, source: "FAQ ({GOTO}A:A1~), one source" }],
  ["DOWN", { label: press("Down"), countable: true, source: "requirement 20; Q31 pp. 1-4 cursor keys" }],
  ["UP", { label: press("Up"), countable: true, source: "requirement 20; Q31 pp. 1-4 cursor keys" }],
  ["LEFT", { label: press("Left"), countable: true, source: "requirement 20; Q31 pp. 1-4 cursor keys; MX snippet {L}" }],
  ["RIGHT", { label: press("Right"), countable: true, source: "requirement 20; Q31 pp. 1-4 cursor keys; MX snippet {R}" }],
  ["EDIT", { label: press("Edit (F2)"), source: FKEYS }],
  ["CALC", { label: press("Calc (F9)"), source: FKEYS }],
  ["ABS", { label: press("Abs (F4)"), source: FKEYS }],
  ["NAME", { label: press("Name (F3)"), source: FKEYS }],
  ["WINDOW", { label: press("Window (F6)"), source: FKEYS }],
  ["QUERY", { label: press("Query (F7)"), source: FKEYS }],
  ["TABLE", { label: press("Table (F8)"), source: FKEYS }],
  ["GRAPH", { label: press("Graph (F10)"), source: FKEYS }],
  ["?", { label: () => "Wait for typing, until Enter is pressed", source: "requirement 20 (meaning not read in a manual)" }],
]);

const at = (args: string[]) => args.join(", ") || "...";

export const BRACE_COMMANDS: ReadonlyMap<string, { label: Label; source: string }> = new Map([
  ["BRANCH", { label: (a: string[]) => `Continue the macro at ${at(a)}`, source: "R4 10935; Q31 p. 19 /XG (two sources)" }],
  ["MENUBRANCH", { label: (a: string[]) => `Show the macro menu stored at ${at(a)}`, source: "Q31 p. 19 /XM; R4 10518 (two sources)" }],
  ["QUIT", { label: () => "End the macro", source: "Q31 p. 19 /XQ (one source)" }],
  ["RETURN", { label: () => "Return from the subroutine", source: "Q31 pp. 18-19 (one source)" }],
  ["IF", { label: (a: string[]) => `If ${a.join(",")} is true, run the rest of this line; otherwise go to the next line`, source: "Q31 p. 19 /XI; R4 10935 (two sources)" }],
  ["WAIT", { label: (a: string[]) => `Wait until ${at(a)}`, source: "Q31 p. 18; R4 10518 (two sources)" }],
  ["BEEP", { label: () => "Sound the bell", source: "R4 10518 (one source)" }],
  ["GETLABEL", { label: (a: string[]) => `Ask for text${a[0] ? ` with the prompt ${a[0]}` : ""} and put it in ${a[1] ?? "..."}`, source: "Q31 p. 19 /XL (one source)" }],
  ["GETNUMBER", { label: (a: string[]) => `Ask for a number${a[0] ? ` with the prompt ${a[0]}` : ""} and put it in ${a[1] ?? "..."}`, source: "Q31 p. 19 /XN (one source)" }],
  // LET is named by requirement 20 but was not found in a source; its label only repeats the macro's own text.
  ["LET", { label: (a: string[]) => `Put ${a.slice(1).join(",") || "..."} in ${a[0] ?? "..."}`, source: "requirement 20 (not found in a source, evidence.md d)" }],
]);
