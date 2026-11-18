// The deterministic step parser: macro text in, steps out. Total (never throws), linear, no
// recursion. The raw slices of the steps join back to the input. Labels come from menu.ts only.
import { BRACE_COMMANDS, BRACE_KEYS } from "./menu.ts";

export type Step = {
  kind: "key" | "command" | "menu" | "type" | "enter" | "unknown-key";
  raw: string;
  label: string;
  start: number;
  line: number;
  name?: string;
  args?: string[];
  path?: string[];
};
export type StepDiagnostic = { code: "unclosed-brace"; offset: number; message: string };

export function joinLines(lines: readonly string[]): { text: string; lineStarts: number[] } {
  const lineStarts: number[] = [];
  let at = 0;
  for (const l of lines) {
    lineStarts.push(at);
    at += l.length;
  }
  return { text: lines.join(""), lineStarts };
}

const typed = (raw: string) => `Type "${raw}"`;
const ESCAPES: Record<string, string> = { "{{}": "{", "{}}": "}", "{~}": "~" };

function braceStep(inner: string): Pick<Step, "kind" | "label" | "name" | "args"> {
  const space = inner.indexOf(" ");
  const name = (space === -1 ? inner : inner.slice(0, space)).toUpperCase();
  const rest = space === -1 ? "" : inner.slice(space + 1).trim();
  const args = rest === "" ? [] : rest.split(",").map((a) => a.trim());
  const key = BRACE_KEYS.get(name);
  if (key) {
    const n = Number.parseInt(args[0] ?? "", 10);
    const times = key.countable && args.length === 1 && /^\d+$/.test(args[0]!) ? (n === 1 ? " once" : ` ${n} times`) : "";
    return { kind: "key", name, args, label: key.label(args) + times };
  }
  const command = BRACE_COMMANDS.get(name);
  if (command) return { kind: "command", name, args, label: command.label(args) };
  return { kind: "command", name, args, label: `Macro command ${name}${args.length ? ` with ${args.join(", ")}` : ""}` };
}

export function parseSteps(text: string, lineStarts: readonly number[] = [0]): { steps: Step[]; diagnostics: StepDiagnostic[] } {
  const steps: Step[] = [];
  const diagnostics: StepDiagnostic[] = [];
  let lineIndex = 0;
  const lineOf = (start: number) => {
    while (lineIndex + 1 < lineStarts.length && lineStarts[lineIndex + 1]! <= start) lineIndex++;
    return lineIndex;
  };
  const push = (start: number, end: number, step: Omit<Step, "raw" | "start" | "line">) => steps.push({ ...step, raw: text.slice(start, end), start, line: lineOf(start) });
  const n = text.length;
  let i = 0;
  let inMenu = false;
  while (i < n) {
    const c = text[i]!;
    if (c === "{") {
      inMenu = false;
      const three = text.slice(i, i + 3);
      if (ESCAPES[three]) {
        push(i, i + 3, { kind: "type", label: typed(ESCAPES[three]!) });
        i += 3;
        continue;
      }
      const j = text.indexOf("}", i + 1);
      if (j === -1) {
        diagnostics.push({ code: "unclosed-brace", offset: i, message: `the brace at offset ${i} is not closed; the rest is kept as typed text` });
        push(i, n, { kind: "type", label: typed(text.slice(i)) });
        break;
      }
      const inner = text.slice(i + 1, j);
      if (inner.trim() === "") {
        push(i, j + 1, { kind: "type", label: typed(text.slice(i, j + 1)) });
        i = j + 1;
        continue;
      }
      const step = braceStep(inner);
      let end = j + 1;
      if (step.name === "GOTO") {
        let k = end;
        while (k < n && text[k] !== "~" && text[k] !== "{") k++;
        const to = text.slice(end, k);
        const done = k < n && text[k] === "~";
        end = done ? k + 1 : k;
        step.args = [to];
        step.label = `Go to ${to}${done ? "" : " (not finished)"}`;
      }
      push(i, end, step);
      i = end;
    } else if (c === "~") {
      inMenu = false;
      push(i, i + 1, { kind: "enter", label: "Press Enter" });
      i++;
    } else if ((c === "/" && steps.at(-1)?.kind !== "type") || inMenu) {
      // No menu tree is sourced (menu.ts), so every key is unknown; the slash rides with the first one.
      const start = i;
      if (c === "/") i++;
      if (i >= n || text[i] === "~" || text[i] === "{") {
        if (i > start) push(start, i, { kind: "unknown-key", label: "Open the menu (no key follows)" });
        inMenu = i > start;
        continue;
      }
      push(start, i + 1, { kind: "unknown-key", label: `Unknown menu key "${text[i]}"` });
      i++;
      inMenu = true;
    } else {
      let k = i + 1;
      while (k < n && text[k] !== "{" && text[k] !== "~") k++;
      push(i, k, { kind: "type", label: typed(text.slice(i, k)) });
      i = k;
    }
  }
  return { steps, diagnostics };
}
