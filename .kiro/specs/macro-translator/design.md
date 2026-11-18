# Design: Macro translator and approval queue (F10)

## Layout

```
src/macro/
  names.ts      readNames(bytes): NAME record walker (independent of src/parser/wk1.ts)
  detect.ts     detectMacros(sheet, names, sheetName): DetectedMacro[]
  menu.ts       the sourced 1-2-3 Release 2 menu tree and the brace key and command tables
  steps.ts      parseSteps(text): Step[] (total, deterministic)
  queue.ts      MacroQueue: buildQueue, approve, reject, undo, setExplanation, counts, toReportItems
  explain.ts    Explainer, requestText, Ollama explainer, recorded explainer, chainExplainers, sanitize
  index.ts      exports
src/workers/
  verify-protocol.ts   RaisedFile gets macros and macroNotes; handleRaiseRequest calls readNames and detectMacros
src/report/
  types.ts, build.ts, json.ts, html.ts   optional macros section (additive)
src/ui/
  copy.ts                      strings
  model/queue-view.ts          pure view model for the Macros view
  model/app-state.ts           step, queues, decision actions
  io/downloads.ts              buildDownload takes the queue
  io/explainer.ts              the app's explainer chain (dynamic import of the recorded file, Ollama over the browser's fetch)
  hooks/useExplain.ts          asks for the shown item's explanation, once, with cancel
  hooks/useMatchMedia.ts       NARROW = (max-width: 1023px) added
  components/MacrosView.tsx    queue surface + detail panel + dialog
  components/StepTabs.tsx      Sheet / Macros pill tabs (top bar, and under the title on phone)
  components/QueuePill.tsx     Waiting / Approved / Rejected
  components/TopBar.tsx        gets the step tabs
  App.tsx                      step switch, decisions, toasts, focus
  styles/app.css               queue and detail styles (tokens only)
scripts/lib/
  wk1-writer.ts       name() encoder, optional names for writeWk1
  fixture-specs.ts    the macros spec and its recorded explanations
scripts/gen-fixtures.ts   writes macros.wk1, LICENSE.txt, recorded-explanations.json, the manifest entry
fixtures/macros/
  macros.wk1, LICENSE.txt, recorded-explanations.json
vite.config.ts         CSP connect-src
tests/
  unit/macro/          names, detect, menu, steps, queue, explain, purity
  property/macro/      names, steps
  differential/macro/  names-vs-parser, detect on the real fixtures
  unit/boundary/       model-boundary.test.ts
  unit/ui/             queue-view, app-state (extended), macros-view.test.tsx, step-tabs.test.tsx
  unit/report/         macros section
  unit/fixtures/       manifest, generator, recorded keys
e2e/
  seance-macros.spec.ts, screenshots/macros-1440.png, macros-390.png
```

Dependency rules (structure.md, extended): `macro` imports `parser` (the `Sheet` type, `a1`) and the types of `verify`. Nothing in `macro` imports React, the DOM, `node:*`, `report`, `xlsx`, `cli` or `workers`. `workers` and `ui` import `macro`. `report` does not import `macro`: `toReportItems` returns plain objects that match `ReportMacroItem` structurally. `src/macro/.gitkeep` is removed when the first file lands.

## NAME records (`names.ts`)

```ts
export type NamedRange = { name: string; startCol: number; startRow: number; endCol: number; endRow: number };
export function readNames(bytes: Uint8Array): { names: NamedRange[]; notes: string[] };
```

```
pos = 0
while pos + 4 <= bytes.length:
  opcode = u16(pos); len = u16(pos + 2); body = pos + 4
  if opcode == 0x0001: break                              // EOF record
  if body + len > bytes.length: note "record at 0xPOS runs past the end"; break
  if opcode == 0x000B:
     if len < 24: note "NAME record at 0xPOS is N bytes; 24 expected, skipped"
     else:
       if len > 24: note "NAME record at 0xPOS is N bytes; first 24 read"
       name = Latin-1 of bytes[body .. first 0x00 or body+16)
       startCol = u16(body+16) startRow = u16(body+18) endCol = u16(body+20) endRow = u16(body+22)
       replace an earlier record with the same upper-cased name (note), else append
  pos = body + len
```

It reads through a `DataView` over a window of the input, with every read checked first, and reads no other record. It does not know the format: it works on any bytes that frame as records, which is why the caller decides. A real WK1 has its NAME records among the settings records before the cells, but the walker does not depend on the order. The WSFF2 layout is the only source of the NAME body until task 1 finds a second one (LibreOffice `lotread.cxx` and Gnumeric `lotus.c` name it as a range-name record). Evidence goes in `evidence.md`.

`parseWk1` is not touched. It counts the 0x0B records as skipped, and a differential test compares that count with the walker's (Acceptance 1).

## Detection (`detect.ts`)

```ts
export type DetectedMacro = { id: string; name: string | null; sheet: string; start: string; lines: string[]; source: "named" | "unnamed" };
export function detectMacros(sheet: Sheet, names: readonly NamedRange[], sheetName: string): { macros: DetectedMacro[]; notes: string[] };
```

Named macros:

```
for each name matching /^\\[0A-Z]$/ after toUpperCase (Latin-1 only; no locale casing):
  col = min(startCol, endCol); row = min(startRow, endRow)
  lines = []; r = row
  while cell(col, r) is a label with text !== "": lines.push(text); r++
  covered += (col, row..r-1)
  if lines is empty: note "\\P starts at A1, which holds no text."
```

The row loop stops at the sheet's row limit (8192) so it always ends. `text` is `cell.text`, which already has no prefix character. A label whose text is empty ends the run, the same as an empty cell.

Unnamed blocks:

```
for col in ascending used columns:
  rows = ascending rows of label cells in col, not in covered, with text !== ""
  split rows into maximal runs of consecutive row numbers
  for each run: if the first line starts with "/" or "{": emit a block (name null, start = first cell)
```

Output order: the named macros sorted `\0`, `\A` to `\Z`, then blocks in scan order. The macro text for steps is `lines.join("")`.

A data column that happens to start with `/` or `{` gives a false block. That is accepted: the person reads the steps and rejects it, and nothing is run.

## Steps (`steps.ts`)

```ts
export type Step = {
  kind: "key" | "command" | "menu" | "type" | "enter" | "unknown-key";
  raw: string;         // the exact source slice
  label: string;       // plain English, deterministic
  start: number;       // offset of raw in the text
  line: number;        // index of the macro line holding start
  name?: string;       // key and command: upper-cased name
  args?: string[];     // key, command, menu: arguments as written
  path?: string[];     // menu: ["Print", "Printer", "Range"]
};
export type StepDiagnostic = { code: "unclosed-brace"; offset: number; message: string };
export function parseSteps(text: string, lineStarts?: readonly number[]): { steps: Step[]; diagnostics: StepDiagnostic[] };
```

`lineStarts` (offsets of each line inside the joined text, from `lines`) is how `line` is computed. Without it every step has `line: 0`. A helper `joinLines(lines): { text: string; lineStarts: number[] }` lives in `steps.ts`.

The parser is one loop over `text` with an index `i` and a menu context `menu: MenuNode | null` (null means plain text):

```
while i < n:
  c = text[i]
  if c == "{":   j = indexOf("}", i)
                 j == -1 -> type step for text[i..], diagnostic unclosed-brace at i; break
                 inner = text[i+1 .. j)
                 inner is "{", "}" or "~" -> type step of that one character
                 else key or command step; GOTO also takes its tilde argument (j+1 .. next "~" inclusive, stopping early at "{")
                 menu = null
  elif c == "~": enter step; menu = null
  elif c == "/" and the previous step is not a type step: menu = ROOT; walk (below)
  elif menu !== null and the previous step was a menu step that stays open: walk (below)
  else: take plain text up to the next "{", "~", or a "/" that follows a non-type step; one type step
```

A "/" directly after typed text continues the text; the text run reads on through it, so the rule needs only the previous step's kind.

Menu walk, from the slash or from the next letter in an open menu:

```
node = menu ?? ROOT
loop:
  letter = text[i++]  (upper-cased for lookup)
  if i > n: label gets "(menu left open)"; end step
  entry = node.children.find(e => e.key == letter)
  if !entry: if the step already holds letters, emit it as a menu step ("menu left open" not added); emit unknown-key step for this one letter; menu = null; break
  path.push(entry.name)
  if entry.children: node = entry; continue
  // leaf
  args = []
  repeat entry.prompts times:
    arg = text from i up to "~" (inclusive) or up to a "{" or the end (exclusive); i moves past it
    args.push(arg without the "~")
  emit menu step: raw = slice from step start to i; label = path.join(" > ") + (args ? ": " + entry.describe(args) : "")
  menu = entry.stays ? entry.parent : null     // "stays" keeps the walk in the leaf's own parent menu
  break
```

Each `menu` step has its slash only when it starts the walk; a continuation like `G` in `/PPRA1..D8~GQ` has `raw` "G" and the full path label. This keeps `concat(raw) == text`. A step never reads past the end of the text. All loops advance `i` by at least one, so the parser is linear. There is no recursion and no regular expression with backtracking.

### Labels

Deterministic strings, no model. Examples (these are test cases):

| Text | Steps (kind: label) |
|---|---|
| `{GOTO}B2~` | key: `Go to B2` |
| `{DOWN 3}` | key: `Press Down 3 times` |
| `{DOWN}` | key: `Press Down` |
| `{EDIT}`, `{CALC}` | key: `Press Edit (F2)`, `Press Calc (F9)` |
| `{?}` | key: `Wait for typing, until Enter is pressed` |
| `{BRANCH LOOP}` | command: `Continue the macro at LOOP` |
| `{QUIT}` | command: `End the macro` |
| `{LET A1,5}` | command: `Put 5 in A1` (the args are text from the macro, not values from the sheet) |
| `{IF B2>3}` | command: `If B2>3 is true, run the rest of this line; otherwise go to the next line` |
| `{FOO 1,2}` | command: `Macro command FOO with 1, 2` |
| `{FOO` | type: `Type "{FOO"` plus diagnostic unclosed-brace |
| `~` | enter: `Press Enter` |
| `Total` | type: `Type "Total"` |
| `/PPRA1..H40~` | menu: `Print > Printer > Range: A1..H40` |
| `/PPRA1..D8~GQ` | menu `Print > Printer > Range: A1..D8`, menu `Print > Printer > Go`, menu `Print > Printer > Quit` |
| `/WGC12~` | menu: `Worksheet > Global > Column-Width: 12` |
| `/FRBUDGET~` | menu: `File > Retrieve: BUDGET` |
| `/Z` | unknown-key: `Unknown menu key "Z"` |
| `/PPX` | menu raw `/PP`, unknown-key raw `X` labelled `Unknown menu key "X" in Print > Printer` |

The exact wording of the menu entries comes from the table (task 1). Names above are the intended ones; a name that the source spells differently follows the source.

## The tables (`menu.ts`)

```ts
export type MenuEntry = {
  key: string;                   // one upper-case letter
  name: string;                  // "Printer"
  children?: MenuEntry[];        // a sub-menu
  prompts?: number;              // leaf: how many tilde-terminated arguments it takes
  describe?: (args: string[]) => string;   // leaf: "Range: A1..D8"; a missing argument reads "..."
  stays?: boolean;               // leaf: after it the same menu stays open
  source: string;                // file and section or line; required
};
export const MENU_ROOT: readonly MenuEntry[];
export const BRACE_KEYS: ReadonlyMap<string, { label: (args: string[]) => string; countable?: boolean; source: string }>;
export const BRACE_COMMANDS: ReadonlyMap<string, { label: (args: string[]) => string; source: string }>;
```

A test asserts that every entry has a non-empty `source`, that sibling keys are unique, that every leaf has `describe` when `prompts` is above 0, and that the root has exactly the ten menus of requirement 29. The tree holds the sub-menus named in requirement 29 and nothing from memory beyond what task 1 sourced.

Candidate shape of the Print part, to be confirmed or corrected by task 1 (from memory of the Release 2 menu map; none of it is verified here): `/P` Print, then `P` Printer, `F` File, `E` Encoded, `C` Cancel, `Q` Quit. In the Printer menu: `R` Range (1 prompt, stays), `L` Line, `P` Page, `C` Clear, `A` Align, `G` Go, `O` Options, `Q` Quit. Which leaves keep the menu open is part of what task 1 sources.

## Queue (`queue.ts`)

```ts
export type Confidence = "Low" | "Medium" | "High";
export type QueueStatus = "pending" | "approved" | "rejected";
export type QueueItem = {
  id: string;                      // "macro:Sheet1!F1" | "opcode:0x5A"
  kind: "macro" | "unknown-opcode";
  title: string;                   // "\\P" | "0x5A" | "Unknown code"
  sheet: string;
  input: string;                   // macro text | "0x5A"
  steps: { label: string; raw: string }[];
  cells: string[];                 // macro: [start]; opcode: addresses, first 50, row-major
  cellCount: number;               // opcode: all cells using it
  suggestion: string | null;
  rationale: string | null;
  confidence: Confidence | null;
  model: string | null;
  status: QueueStatus;
  decidedAt: string | null;
  queuedAt: string | null;
};
export type Decision = { id: string; status: QueueStatus; decidedAt: string | null };   // the state before the decision
export type MacroQueue = { items: readonly QueueItem[]; history: readonly Decision[] };

export function buildQueue(input: { macros: readonly DetectedMacro[]; sheets: readonly { name: string; cells: readonly CellResult[] }[] }, at: string | null): MacroQueue;
export const approve: (q: MacroQueue, id: string, at: string) => MacroQueue;
export const reject: (q: MacroQueue, id: string, at: string) => MacroQueue;
export function undo(q: MacroQueue): { queue: MacroQueue; restored: string | null };
export function setExplanation(q: MacroQueue, id: string, e: Explanation): MacroQueue;
export const counts: (q: MacroQueue) => { pending: number; approved: number; rejected: number };
export function toReportItems(q: MacroQueue): ReportMacroItemLike[];
```

`buildQueue` takes plain structures, not `RaisedFile`, so `macro` does not import `workers`. The UI passes `{ macros: file.macros, sheets: file.sheets.map(s => ({ name: s.name, cells: s.verification.cells })) }`. The opcode comes from `/opcode (0x[0-9A-F]{2}) at offset \d+/` on `reason.message`. A test pins this regular expression to the report's `unknownOpcodes` on the same cells, so the two readers cannot drift apart.

All functions return new objects and never change their input. `approve` and `reject` share one helper that checks for an unchanged status. `toReportItems` copies and never shares arrays with the queue.

Why `history` stores the earlier state and not the action: an undo then needs no switch and works for a change from approved to rejected the same way as for a first decision.

## Explainer (`explain.ts`)

```ts
export type ExplainRequest =
  | { kind: "macro"; text: string; stepLabels: string[] }
  | { kind: "unknown-opcode"; opcode: string };
export type Explanation = { suggestion: string; rationale: string | null; confidence: Confidence | null; model: string };
export interface Explainer { name: string; explain(request: ExplainRequest, signal?: AbortSignal): Promise<Explanation | null> }

export const OLLAMA_URL = "http://localhost:11434/v1/chat/completions";
export function requestText(request: ExplainRequest): string;
export function sanitizeModelText(raw: string): Explanation fields   // plain text only
export function createOllamaExplainer(deps: { fetch: FetchLike; models?: string[]; timeoutMs?: number }): Explainer;
export function createRecordedExplainer(deps: { entries: Record<string, RecordedEntry>; model: string; hash: (text: string) => Promise<string> }): Explainer;
export function chainExplainers(...explainers: Explainer[]): Explainer;
export const subtleHash: (text: string) => Promise<string>;     // crypto.subtle SHA-256 of the UTF-8 text; rejects when Web Crypto is missing
```

`requestText` for a macro:

```
Kind: macro
Macro text: /PPRA1..D8~GQ
Steps:
1. Print > Printer > Range: A1..D8
2. Print > Printer > Go
3. Print > Printer > Quit
```

for an opcode:

```
Kind: unknown-opcode
Format: Lotus 1-2-3 Release 2 (WK1) formula token
Opcode: 0x5A
```

The macro text is the macro's own label text. It is what the person is asked to approve, so the model has to see it. It can contain cell addresses (`A1..D8`) because a macro names them, but it holds no cell value, because a macro line is typed keystrokes and the explainer never receives a cell of the sheet. The opcode request holds the byte and nothing about the cell that uses it, not even its address.

The system message is a constant: it tells the model to explain in plain words, to answer with `Suggestion:`, `Rationale:` and `Confidence:` lines for an opcode (only `Suggestion:` for a macro), to say when it is unsure, and that it is never to compute or return a number from a sheet. It does not hold data.

Ollama call:

```
POST http://localhost:11434/v1/chat/completions
{"model":"qwen3","messages":[{"role":"system","content":SYSTEM},{"role":"user","content":requestText}],"stream":false,"temperature":0}
```

No other header than `Content-Type`. `models` are tried in order on a 404. The timeout is one `AbortController` per attempt; the caller's `signal` aborts it too. `explain` wraps everything in one try block that returns `null`, so it never throws. The model name stored is `response.model` when it is a string, else the requested name.

`sanitizeModelText(raw)`:

1. Remove `<think>` blocks (also an unclosed one, to the end).
2. Remove C0 control characters except newline and tab, and the BOM.
3. Split into lines. Take the text after `Suggestion:`, `Rationale:` and `Confidence:` (any case, at the start of a line). Without any of these, the whole text is `suggestion`.
4. `confidence` is the exact word `Low`, `Medium` or `High` (any case), else `null`; for an opcode the caller turns `null` into `Low`.
5. Cut each field at 1,200 characters; trim.

No `JSON.parse`, no `Number`, no `parseFloat`. A test greps the file for them. An empty `suggestion` after this gives `null` from the explainer.

The recorded fixture:

```json
{ "schemaVersion": 1, "model": "recorded fixture", "note": "Text written by the developer to stand in for a model.", "entries": { "<sha256 of requestText>": { "suggestion": "...", "rationale": null, "confidence": null } } }
```

## Pipeline

`handleRaiseRequest` after the verifications:

```ts
const macros = format is "wk1" or "wks" ? detectMacros(sheets[0], readNames(bytes).names, workbook.sheets[0].name) : { macros: [], notes: [] }
file.macros = macros.macros;  file.macroNotes = [...names.notes, ...macros.notes]
```

`RaiseDeps` gets an optional `macros` hook so a test can inject a throwing one. The call sits inside the existing try block, which gives a failure message and no partial result. The reducer's `raised` action is unchanged in shape except for an optional `at`.

CSP in `vite.config.ts`: `connect-src 'self' http://localhost:11434`. `e2e/seance-privacy.spec.ts` keeps passing because no request goes to that origin unless the Macros view asks for it (requirement 50). A new case in `seance-macros.spec.ts` records requests while the view is open.

`src/ui/io/explainer.ts`:

```ts
export async function appExplainer(): Promise<Explainer> {
  const recorded = (await import("../../../fixtures/macros/recorded-explanations.json")).default;   // bundled by Vite, no fetch
  return chainExplainers(createRecordedExplainer({ entries: recorded.entries, model: recorded.model, hash: subtleHash }),
                         createOllamaExplainer({ fetch: globalThis.fetch.bind(globalThis) }));
}
```

Passing `globalThis.fetch.bind(globalThis)` keeps the `fetch(` call syntax out of `src/ui`, so the existing purity guard still allows exactly one fetch (the sample). The purity test gains a case for `src/macro`: the only network call is the injected one in `explain.ts`.

The recorded file is bundled in a chunk loaded when the Macros view first needs an explanation, not on Summon.

## Report

Types in `src/report/types.ts`:

```ts
export type ReportMacroItem = {
  kind: "macro" | "unknown-opcode"; title: string; sheet: string;
  steps: { label: string; raw: string }[];
  explanation: string | null; rationale: string | null; confidence: "Low" | "Medium" | "High" | null; model: string | null;
  status: "pending" | "approved" | "rejected"; decidedAt: string | null; cells: string[];
};
```

`ReportInput` gets `macros?: ReportMacroItem[]`; `ProvenanceReport` gets `macros?: ReportMacroItem[]`. `buildReport` copies the list when it is not empty and leaves the key out otherwise, so reports without macros keep their bytes. `explanation` is the queue's `suggestion`.

HTML: `macrosSection(r)` returns `""` when there is no list. Otherwise a `<section id="macros">` with an `h2` "Macros", the line "Macros were not run. Each item below needs a person's decision.", and one block per item (a `div` with the existing `.pill` classes for the status text, steps as a list with `<code>` raw and the label, the explanation under "Explanation (local model, unchecked)" and the model name in `.muted`). Status text: pending "Waiting", approved "Approved by you", rejected "Rejected". All text goes through `t()`. CSS additions use the same `TOKENS` only. The section goes after `sheetList(r)` and before `features(r)`.

`downloads.ts`: `buildDownload(kind, raised, version, queue?)`. The queue is turned into items with `toReportItems` through a type-only import and a normal import of `src/macro` (it is pure and small, so no dynamic import is needed). The XLSX branch does not read the queue.

## App state

```ts
AppState += { step: "sheet" | "macros"; queues: Record<number, MacroQueue> }
AppAction += { type: "setStep"; step } | { type: "decide"; id: string; decision: "approve" | "reject"; at: string }
           | { type: "undo" } | { type: "explained"; itemId: string; explanation: Explanation }
           and "raised" gets an optional at?: string
```

- `raised` builds the file's queue with `buildQueue(...)` (for a file that is classified as raised) and `at ?? null`.
- `decide` and `undo` act on the selected file's queue. `explained` acts on the queue of the file that asked (the action carries `fileId`; a late answer for another file or an older batch is ignored by the existing `batchId` check and a `fileId` check).
- `selectFile` sets `step: "sheet"`. `summoned` resets everything, as today.
- `undo` and `decide` return the id to focus through a field `lastFocus: string | null` of the state, which the view reads in an effect and then clears with a `focusDone` action. This keeps the reducer pure and the focus code in the component.

## Macros view

`queue-view.ts` (pure):

```ts
export type QueueRow = { id; kind: string; time: string | null; line: string; pill: "waiting" | "approved" | "rejected"; selected: boolean; tabIndex: 0 | -1 };
export const queueRows: (q: MacroQueue, selectedId: string | null, timeZone?: string) => QueueRow[];
export const statusLine: (c: Counts) => string;            // "4 waiting · 9 approved · 1 rejected"
export const tabLabel: (waiting: number) => string;        // "Macros 4" | "Macros"
export const nextWaiting: (q: MacroQueue, afterId: string) => string | null;   // wraps; null when none waits
export type QueueKey = { action: "move"; to: "prev" | "next" | "first" | "last" } | { action: "open" } | { action: "approve" } | { action: "reject" } | { action: "undo" } | null;
export const keyToAction: (e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) => QueueKey;
export type ExplainState = "idle" | "loading" | "unavailable" | "done";
export const detailModel: (item: QueueItem, explain: ExplainState) => DetailModel;
```

`keyToAction` returns `null` for `a`, `r` and `z` with Ctrl, Meta or Alt held, so browser shortcuts keep working. The component calls it only from the `onKeyDown` of the listbox, which is why A, R and Z cannot fire from elsewhere (requirement 66). `time` is `HH:MM` from `Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone })`, or `null` when `queuedAt` is null.

`line` is `\P  /PPRA1..D8~GQ` for a macro (title, two spaces, the first 60 characters of the text) and `0xNN  C7` for an opcode (title, two spaces, the first cell). CSS ellipsis does the visual cut.

Components:

- `MacrosView` gets `queue`, `selectedId`, `explainState`, `noteLines`, `narrow` (the `NARROW` media query), `format`, and callbacks `onSelect`, `onDecide`, `onUndo`. It renders the `h1`, status line, AI line, notes, the two surfaces, and the dialog below 1024px. Focus: the options keep a roving tabindex; Enter calls `approveRef.focus()` on desktop and opens the dialog on narrow; the dialog uses the same trap and return code as the drawer (`useFocusReturn`).
- `useExplain(item, explainer)` returns `ExplainState`. It runs one effect keyed by `item.id`: if the item has a `suggestion`, state is `done`; otherwise it sets `loading`, calls `explainer.explain(request, signal)`, dispatches `explained` on an answer or sets `unavailable` on `null`, and aborts in the cleanup. A ref set of asked ids keeps it to one request per item and file.
- The decision toast text is built in `App.tsx` from `COPY`.

Sizes (all through `LAYOUT`-style custom properties in `app.css`, from tokens): `--queue-w: clamp(320px, 38%, 520px)`; the two-column grid is `var(--queue-w) minmax(0, 1fr)` from 1024px up; every flex and grid child that holds text has `min-width: 0`; the detail's mono block wraps with `overflow-wrap: anywhere`. 320 and 520 are already in the named-px list of `css-tokens.test.ts`; if the scan flags the percentage, the one value is added to that list in the same task. The detail panel is `position: sticky` under the top bar at desktop so it stays beside a long queue.

Narrow (below 1024px): the queue is the view; selecting an option (tap, or Enter) opens the dialog: a full-screen surface, scrim as the drawer's, `--space-4` padding, content as the detail, and a sticky footer with Approve (primary, 48px) and Reject (ghost). Decision closes the dialog, shows the toast, and focuses the next waiting option.

Copy (new in `copy.ts`): `macrosTitle` "Macros", `macroKind` "Macro", `opcodeKind` "Unknown opcode", `queueLabel` "Macros and unknown codes", `queueHint`, `pillWaiting/Approved/Rejected`, `parsedLabel` "Parsed (deterministic)", `explanationLabel` "Explanation (local model, unchecked)", `explanationLoading` "Asking the local model...", `explanationUnavailable` (exact text of requirement 45), `approve` "Approve", `reject` "Reject", `toastApproved`, `toastRejected`, `toastUndone`, `opcodeApproveNote` (requirement 69), `confidence(c)`, `statusLine`, `tabMacros(n)`, `tabSheet`, `backToList`, `macroEmptyWk3` (requirement 62), `modelRecorded` "recorded fixture", and the changed `limits` line. `COPY.macroEmpty` and `COPY.aiLine` already exist.

## Boundary test (`tests/unit/boundary/model-boundary.test.ts`)

```
raise(macros.wk1)  -> baseline: raised file, buildDownload xlsx, report(JSON/HTML) with no queue
for response in HOSTILE:
  explainer = createOllamaExplainer({ fetch: fakeFetch(response) })        // the fake records each request body
  queue = buildQueue(...); for each item: explanation = await explainer.explain(...); queue = setExplanation(...)
  run orders: approve all, reject all, mixed, approve-undo-reject (fast-check picks sequences)
  report = buildReport(input + macros: toReportItems(queue)); html = renderReportHtml(report); json = serializeReportJson(report)
  expect: raised file (sheets, verification) deep-equals the baseline
          xlsx bytes equal the baseline's
          { ...report, macros: undefined } deep-equals the baseline report; same for totals, rows
          html contains no unescaped "<script" from the response
bodies: sheet with sentinel values; every captured body is searched for each sentinel
bite: a variant of setExplanation that writes the suggestion into a cell is imported through a test-only wrapper and the same assertions fail
```

The hostile list is a constant of the test file. The `__proto__` case is also run through `JSON.parse` by the fake fetch, as a real response would be, to show that the sanitiser never reaches a prototype.

## Fixture

`scripts/lib/wk1-writer.ts` gains `name(name, startCol, startRow, endCol, endRow)` (opcode 0x0B, 24-byte body, name bytes then NUL padding; a name longer than 15 characters throws) and `writeWk1(version, cells, names = [])`, which writes the NAME records after DIMENSIONS and before the cells. With no names the output is the same bytes as before.

`macros.wk1` (spec in `fixture-specs.ts`; positions are 0-based in code, A1 form here):

| Cells | Content |
|---|---|
| A1..D8 | a header row of four labels and seven rows of integers, so the print range is real |
| F1..F3 | `\0` macro: `{GOTO}A1~`, `{CALC}`, `{QUIT}` (labels with prefix `'`) |
| H1 | `\P` macro: `/PPRA1..D8~GQ` |
| J1..J2 | unnamed block: `{GOTO}D8~`, `{DOWN 3}{EDIT}` |
| A10 | a formula whose token stream holds a byte that is not in `OPCODES`, with stored value 42 |
| names | `\0` over F1..F1, `\P` over H1..H1 |

The unknown byte is chosen by the generator as the lowest byte above 0x60 that is not in `OPCODES`; a test asserts that it is not in the table and that verification gives exactly one `unknown-opcode` reason. The cached value 42 and the sentinel numbers are in the manifest, so the boundary test can search for them.

The queue of this file has four items: `\0` (3 steps: `Go to A1`, `Press Calc (F9)`, `End the macro`), `\P` (3 steps), the unnamed block (`Go to D8`, `Press Down 3 times`, `Press Edit (F2)`), and `0xNN`. `recorded-explanations.json` holds one plain sentence for each of the three macros and a suggestion, rationale and confidence for the opcode, all from the spec.

## Unit tests

- `names.test.ts`: one record, several, name with and without NUL inside the 16 bytes, a 16-byte name with no NUL, Latin-1 high bytes, start above end, length 23 and 25, a record cut short, EOF stops the walk, bytes after EOF ignored, duplicate names (case-insensitive), more than 50 notes, `subarray` input, input unchanged, no import of `wk1.ts`.
- `detect.test.ts`: `\0`, `\A`, `\z` (lowercase), `\AA` and `RANGE` ignored, start from the top-left of a reversed range, run ends at an empty cell, at a number, at a label with empty text, at the row limit; macro start on a number gives an empty macro and a note; unnamed block starts with `/` and `{`; a block covered by a named macro is not reported twice; two blocks in two columns in scan order; WK3 and DBF give none (through the worker test).
- `steps.test.ts`: every row of the label table; GOTO argument ending at `{`; `{{}`, `{}}`, `{~}`; `{}`; unclosed brace with the diagnostic; tilde; `/` inside typed text; `/` after a key; lines and `line` indexes across a joined macro; a menu split across two lines.
- `menu.test.ts`: the table checks above; each sub-menu of requirement 29 resolves to a leaf with the expected path.
- `queue.test.ts`: build, order, opcode grouping (two cells one opcode, two opcodes, a message without an opcode), approve, reject, change of mind, same-status no-op, unknown id, undo (stack, empty), `setExplanation` leaves status and history alone, `counts` sum, `toReportItems` copies, the regular expression pinned to `unknownOpcodes`.
- `explain.test.ts`: `requestText` for both kinds; Ollama explainer with a fake fetch (URL, method, headers hold no `Authorization`, body fields, 404 then next model, 500, network error, abort on timeout with fake timers, invalid JSON, empty content, no throw); `sanitizeModelText` (think block, unclosed think, controls, labelled lines, no labels, confidence words, 1,200 cut); recorded explainer (hit, miss, hash failure gives null); chain order; source scan (no `JSON.parse`, `Number(`, `parseFloat`, `Authorization`, `process.env`, host other than `localhost:11434`).
- `queue-view.test.ts`: rows, time with `timeZone: "UTC"`, `statusLine` for all-zero, one part and all three, `tabLabel`, `nextWaiting` wrap and none, `keyToAction` for every key and for modified keys, `detailModel` for each of the four explain states and both kinds.
- `app-state.test.ts` (extended): `raised` builds a queue, `decide`, `undo`, `explained` with a stale file id, `selectFile` returns to the Sheet step, `setStep`.
- `macros-view.test.tsx`: the markup of the full view and the states below.

## Markup tests (`renderToStaticMarkup`)

For `MacrosView` on the `macros.wk1` queue: one `h1` "Macros"; the status line; the AI line; `role="listbox"` with four `role="option"`, exactly one `tabindex="0"`, `aria-selected` on one; each row has its kind text and pill text (no pill by colour alone); the hint line; the detail holds the steps block before the explanation heading; the heading text "Explanation (local model, unchecked)" and the model name; exactly one element with the primary class (Approve) and Reject with the ghost class; the three explain states (loading line with `role="status"`, text, the exact unavailable sentence with Approve present); the opcode detail has "Confidence: Medium" as text, the approve note and the affected cell with a pill; an approved item has `aria-disabled` on Approve; an empty queue gives "No macros in this file." and the WK3 line when `format` is `wk3`; narrow mode renders `role="dialog"` with `aria-modal="true"` and the sticky footer class; a hostile explanation (`<script>`) appears escaped. Focus, keyboard and layout belong to Playwright.

## e2e (`e2e/seance-macros.spec.ts`)

Uses `payload("macros.wk1", readFileSync("fixtures/macros/macros.wk1"))` and the helpers of `seance-a11y.spec.ts`.

1. Flow at 1440x900: drop the file, `h1` is the file name, click the "Macros 4" tab, `h1` "Macros", status line "4 waiting", four options, the first selected, the detail shows steps before the explanation, the explanation is the recorded text with "recorded fixture", and no request went to `localhost:11434`. Click Approve with the mouse: toast "Approved. Press Z to undo.", status line "3 waiting · 1 approved", focus on the next waiting option. Press `R`: that item is rejected, "2 waiting · 1 approved · 1 rejected", toast "Rejected. Press Z to undo.". Press `Z`: "3 waiting · 1 approved", focus on the restored option. Press Down, then `R`: rejected. Focus the Approve button and press `A`: nothing changes (single-key shortcuts only inside the list). Go to the Sheet step, click "JSON" in the downloads, read the file: `macros` has one `approved`, one `rejected`, two `pending`, with `decidedAt` set on the approved and the rejected item and `null` on the two pending ones, `totals` equal to the same file's report without decisions (read from `golden`-style numbers in the test: 1 formula, 0 matched, 0 mismatched, 1 unverifiable), and `rows` holding the opcode cell as unverifiable. Download the XLSX before and after the decisions: bytes equal. Screenshot `e2e/screenshots/macros-1440.png`.
2. Phone 390x844: the Macros tab under the title, tap an option, the dialog opens (`role="dialog"`, Approve 48px high and its bottom edge within 16px of the viewport), Tab ten times keeps focus inside, Escape closes and focus is on the option, open again and approve: dialog closes, focus on the next waiting option. No sideways scroll (`scrollWidth <= clientWidth`). Screenshot `e2e/screenshots/macros-390.png`.
3. Offline model: `page.route("http://localhost:11434/**", route => route.fulfill({ status: 503 }))`, then a file whose macro has no recorded text (built in the test with `writeWk1`), open the Macros tab: the unavailable sentence shows, Approve works, exactly one POST was seen, its body has the model name, the two fixed messages and the user message holding the macro text, and none of the sheet's numbers (the test builds the sheet with sentinel values). This case does not assert on console errors: Chromium logs a failed request there.
4. Accessibility: axe with the TAGS of `seance-a11y.spec.ts` on the Macros view at 1440, at 390, and with the phone dialog open; zero serious or critical; lesser findings printed and attached. Console: no `error` message, no `pageerror`, no `requestfailed` in cases 1 and 2.
5. Privacy: the existing `seance-privacy.spec.ts` passes unchanged. In case 1, every recorded request is a same-origin GET under `/` or `/assets/`.

`seance-a11y.spec.ts` is not edited. The new spec carries its own axe cases so that a failure points at this feature.
