# Requirements: Macro translator and approval queue (F10)

Goal: find the macros and the unknown formula codes in a WK1 or WKS file, turn each macro into a plain-English step list that a person reads and approves, let a local model explain them without ever touching a number, and keep every decision in the provenance report. Macros are never run. The model never reads or changes a cell value (`ai-boundaries.md`).

Terms:

- A *NAME record* is Lotus record 0x0B, 24 bytes: a 16-byte NUL-terminated name, then start column, start row, end column and end row as u16 (WSFF2, `design/refs/lotus/WSFF2-mettalogic.TXT`, record "NAME"). Columns and rows are 0-based, as in the parser's cell model.
- A *macro* is text in label cells that 1-2-3 would play back as keystrokes. A *named macro* is a named range called `\` plus one letter or `0`. An *unnamed block* is a run of label cells that looks like a macro but has no such name.
- A *step* is one thing the macro does: a brace key, a menu command with its arguments, an Enter, or typed text. Each step has a plain-English *label* and the *raw* source text it came from.
- A *queue item* is one thing a person must decide on: a macro, or a distinct unknown opcode. A *decision* is approve or reject.
- *Local model* means Ollama on `http://localhost:11434` or a recorded fixture. *The no-model run* is the same file raised with no explainer at all.

## EARS requirements

### NAME records (`src/macro/names.ts`)

1. The module SHALL export `readNames(bytes: Uint8Array): { names: NamedRange[]; notes: string[] }` with `NamedRange = { name: string; startCol: number; startRow: number; endCol: number; endRow: number }`. It SHALL be a pure function of the input, SHALL NOT throw for any input, and SHALL NOT mutate or keep the input.
2. `readNames` SHALL be an independent record walker: opcode u16 LE, length u16 LE, body, all little-endian. It SHALL NOT import `src/parser/wk1.ts`, SHALL NOT use its stats, and SHALL NOT decide a format. The caller decides whether the bytes are WK1 or WKS.
3. For every record with opcode 0x0B and length 24 or more, the walker SHALL read the name as the bytes before the first 0x00 within the first 16 bytes, decoded as Latin-1, and the four u16 values at offsets 16, 18, 20 and 22. A length above 24 SHALL read the first 24 bytes and add a note. A length below 24 SHALL give no name and add a note.
4. The walker SHALL stop at an EOF record (opcode 0x0001), at the end of the input, or at a record whose length runs past the end of the input. In the last case it SHALL add a note and keep the names already read. Every read SHALL be bounds-checked first.
5. IF two NAME records carry the same name (compared after upper-casing), THEN the later one SHALL replace the earlier one and the walker SHALL add a note. Names SHALL come out in file order of their last record.
6. Notes SHALL be plain sentences with the byte offset. At most 50 notes SHALL be kept, then one line "and N more".
7. `parseWk1` SHALL behave exactly as before for every input: same sheet, diagnostics and stats (the existing parser tests pass unchanged). The NAME record SHALL stay counted among its skipped records.

### Macro detection (`src/macro/detect.ts`)

8. The module SHALL export `detectMacros(sheet: Sheet, names: readonly NamedRange[], sheetName: string): { macros: DetectedMacro[]; notes: string[] }` with `DetectedMacro = { id: string; name: string | null; sheet: string; start: string; lines: string[]; source: "named" | "unnamed" }`. `id` SHALL be `sheet!start` (for example `Sheet1!F1`). It SHALL be pure and total.
9. A name SHALL be a macro name when, after upper-casing, it is a backslash followed by one of `0` and `A` to `Z`. The macro's `name` SHALL be that upper-cased form (`\0`, `\P`). Other names (`REVENUES`) SHALL be ignored without a note.
10. A named macro SHALL start at the top-left cell of its range (the smaller column and the smaller row of the two corners) and run down that column through consecutive label cells until the cell below is not a label, is empty, or is a label with empty text. `lines` SHALL hold the text of each of those cells without the prefix character, in order.
11. IF the start cell is not a label, THEN the macro SHALL still be reported, with no lines, and a note SHALL say so. Nothing is dropped silently.
12. An unnamed block SHALL be a maximal vertical run of label cells, taken after the cells of named macros are removed, whose first line starts with `/` or `{`. Blocks SHALL be scanned column by column, left to right, and top to bottom in each column. Their `name` SHALL be `null`.
13. Macros SHALL come out named first (`\0`, then `\A` to `\Z`), then unnamed blocks in scan order. The result SHALL NOT depend on the order of the NAME records.
14. Detection SHALL run only for WK1 and WKS files. For WK3 and DBF files `macros` SHALL be an empty list.

### Step parser (`src/macro/steps.ts`)

15. The module SHALL export `parseSteps(text: string): { steps: Step[]; diagnostics: StepDiagnostic[] }`. It SHALL be deterministic, pure and total: it SHALL NOT throw, use randomness, a clock, locale or the network, and SHALL run in time linear in the input length without recursion.
16. A macro's text SHALL be its lines joined with no separator (a command may continue in the next cell, as in 1-2-3). Each step SHALL record the 0-based index of the line it starts in.
17. `Step = { kind: "key" | "command" | "menu" | "type" | "enter" | "unknown-key"; raw: string; label: string; start: number; line: number; ... }`, with `name` and `args` on `key` and `command`, and `path` and `args` on `menu`. The concatenation of all `raw` values SHALL equal the input text exactly, and `start` SHALL be the offset of each `raw`.
18. Every step SHALL have a non-empty `label` in plain English that is a function of the step alone. Labels SHALL NOT come from a model.
19. A brace group `{NAME args}` SHALL become one step. `NAME` is the text up to the first space or comma, upper-cased for lookup. `args` is the rest split at commas and trimmed. The group closes at the first `}`; nested braces are not supported.
20. These names SHALL be `key` steps: `GOTO`, `DOWN`, `UP`, `LEFT`, `RIGHT` (each with an optional repeat count), `EDIT`, `CALC`, `?`, and the other keys that task 1 sources. These SHALL be `command` steps with their own labels: `BRANCH`, `QUIT`, `LET`, `IF`, and the other commands task 1 sources. Any other `{WORD args}` SHALL be a `command` step with the generic label "Macro command WORD with ARGS" and its args kept.
21. `{GOTO}` SHALL take the text that follows, up to and including a tilde, as its argument: `{GOTO}B2~` is one step labelled "Go to B2". An argument that ends at a `{` or at the end of the text SHALL end there, and the label SHALL say "(not finished)".
22. `{{}`, `{}}` and `{~}` SHALL be `type` steps that type the one character. An empty group `{}` SHALL be a `command` step labelled "Empty braces".
23. A `{` with no closing `}` SHALL become a `type` step holding the rest of the text, and the parser SHALL add one `unclosed-brace` diagnostic with the offset. Nothing is guessed.
24. A tilde outside an argument SHALL be an `enter` step labelled "Press Enter".
25. Plain text up to the next `/` that starts a menu, `{` or `~` SHALL be one `type` step labelled `Type "text"`. A `/` directly after typed text SHALL stay part of that text. A `/` at the start of the text or after any other step SHALL start a menu.
26. A menu command SHALL be walked through the table in `src/macro/menu.ts` (requirement 29): each letter after the slash selects an entry of the current menu, case-insensitive. A leaf that prompts SHALL take the text after it, up to and including a tilde, as one argument per prompt. One menu command, from the slash or the next letter through the last argument tilde, SHALL be one `menu` step, and its label SHALL be the full path with the arguments, for example `Print > Printer > Range: A1..H40`.
27. After a leaf, the walk SHALL stay in the same sub-menu when the table says the menu stays open (the Print Printer menu does), so that in `/PPRA1..D8~GQ` the `G` is "Print > Printer > Go" and the `Q` is "Print > Printer > Quit". A leaf that leaves the menu SHALL return the parser to plain text.
28. A letter that is not in the current menu SHALL become one `unknown-key` step with that letter as its `raw`, labelled `Unknown menu key "Z" in Print > Printer`, and the parser SHALL return to plain text. A menu that the text leaves open SHALL end its step with "(menu left open)" in the label.
29. The menu table SHALL cover Worksheet, Range, Copy, Move, File, Print, Graph, Data, System and Quit, with the common sub-menus (`/WGC`, `/WIR`, `/WEY`, `/RF`, `/RE`, `/RNC`, `/FR`, `/FS`, `/PPR`, `/PPG`, `/PPQ`, `/DS`, `/DF`). Every entry SHALL name its source in a comment, as `src/formula/opcodes.ts` does. An entry without a source SHALL NOT be in the table; its letter then gives an `unknown-key` step.

### Approval queue (`src/macro/queue.ts`)

30. The module SHALL export pure functions over an immutable `MacroQueue = { items: QueueItem[]; history: Decision[] }`: `buildQueue`, `approve`, `reject`, `undo`, `setExplanation`, `counts`, `toReportItems`. No function SHALL read a clock; the caller passes an ISO time string.
31. `buildQueue` SHALL make one item of kind `macro` per detected macro and one item of kind `unknown-opcode` per distinct opcode among the verification cells whose reason code is `unknown-opcode`. The opcode SHALL be read from the reason message in the form `opcode 0xNN at offset N`, the form `src/report/features.ts` reads. A message in another form SHALL group under the title "Unknown code" and SHALL NOT be dropped. Items SHALL come out macros first, then opcodes in ascending order.
32. A `QueueItem` SHALL hold: `id` (`macro:` plus the macro id, or `opcode:0xNN`), `kind`, `title` (`\P`, `0xNN`), `sheet`, `input` (the macro text, or the opcode as `0xNN`), `steps` (label and raw of each step; empty for an opcode), `cells` (the macro's start address, or the addresses of the cells that use the opcode), `suggestion`, `rationale`, `confidence` (`Low`, `Medium`, `High` or `null`; set only for `unknown-opcode`), `model` (name or `null`), `status` (`pending`, `approved` or `rejected`), `decidedAt` (ISO string or `null`) and `queuedAt` (ISO string or `null`).
33. Every new item SHALL be `pending`, with `suggestion`, `rationale`, `confidence`, `model` and `decidedAt` all `null`.
34. `approve(queue, id, at)` and `reject(queue, id, at)` SHALL set the status and `decidedAt`, and push the previous status and time on `history`. A decision that does not change the status, or an unknown id, SHALL return the same queue unchanged. A person MAY change an approved item to rejected and back.
35. `undo(queue)` SHALL pop the last decision off `history` and restore that item's previous status and time, and SHALL return the restored item's id. With an empty history it SHALL return the same queue. Undo can be repeated until the history is empty.
36. `setExplanation(queue, id, explanation)` SHALL set `suggestion`, `rationale`, `confidence` and `model` of that item and nothing else. It SHALL NOT change the status, `decidedAt` or `history`.
37. Approval SHALL record a human decision only. It SHALL NOT change any verification result, cell, total or output file. An approved unknown opcode SHALL keep every cell that uses it `unverifiable` in this version, because the engine has no way to take an approved opcode yet (see Out of scope).
38. `counts(queue)` SHALL return `{ pending, approved, rejected }`, and the three SHALL sum to the number of items.

### Explainer (`src/macro/explain.ts`)

39. The module SHALL export `interface Explainer { name: string; explain(request: ExplainRequest, signal?: AbortSignal): Promise<Explanation | null> }`, with `ExplainRequest = { kind: "macro"; text: string; stepLabels: string[] } | { kind: "unknown-opcode"; opcode: string }` and `Explanation = { suggestion: string; rationale: string | null; confidence: Confidence | null; model: string }`. An explainer SHALL return `null` when it has no answer. It SHALL NOT throw.
40. `requestText(request)` SHALL give the one canonical text of a request, used both as the user message and as the key of recorded answers. For a macro it holds the macro text and the numbered step labels. For an opcode it holds the format name and the opcode as `0xNN`. It SHALL hold nothing else: no cell value, no cell address, no file name, no number from the sheet.
41. `createOllamaExplainer({ fetch, models?, timeoutMs?, baseUrl? })` SHALL post to `http://localhost:11434/v1/chat/completions` (OpenAI-compatible) with `stream: false`, `temperature: 0`, a fixed system message and `requestText` as the user message. The default models SHALL be `qwen3` then `qwen2.5`. `fetch` SHALL be injected. The base URL SHALL be a constant; no other host and no environment variable SHALL be read.
42. The Ollama explainer SHALL send no `Authorization` header and no key. IF the response status is 404 (model not found), THEN it SHALL try the next model. IF the request fails, times out (default 15,000 ms, through `AbortController`), returns another non-2xx status, returns invalid JSON, or has no text content, THEN it SHALL return `null`.
43. `createRecordedExplainer({ entries, model, hash })` SHALL answer from the recorded fixture `fixtures/macros/recorded-explanations.json`, keyed by the lowercase hex SHA-256 of `requestText`, and SHALL return `null` for an unknown key. It SHALL make no network call. `chainExplainers(...explainers)` SHALL return the first non-null answer, trying them in order. The app SHALL chain the recorded explainer first, then Ollama.
44. The model's output SHALL be stored as plain text only. The explainer SHALL remove `<think>...</think>` blocks and control characters, cut each field at 1,200 characters, and take `Suggestion:`, `Rationale:` and `Confidence:` lines when they are present (otherwise the whole text is the suggestion). It SHALL NOT parse JSON, and SHALL NOT convert any part of the output to a number. `confidence` SHALL be set only when the line is exactly `Low`, `Medium` or `High` (any case); an unknown opcode with no valid line gets `Low`.
45. WHEN no explainer answers, THEN the item SHALL show "Explanation unavailable: the local model is not running. The steps above are complete." and Approve and Reject SHALL stay available.
46. The module SHALL NOT use a paid API, an API key, a host other than `localhost:11434`, or any non-injected network function. It SHALL NOT import React, the DOM, `node:*`, `src/report`, `src/xlsx` or `src/cli`.

### Pipeline

47. `RaisedFile` SHALL gain `macros: DetectedMacro[]` and `macroNotes: string[]`. For a WK1 or WKS file the raise worker SHALL fill them from `readNames(bytes)` and `detectMacros`. For WK3, DBF and unknown input both SHALL be empty. No other field of `RaisedFile` SHALL change.
48. The values of `sheets`, `diagnostics`, `stats` and `sha256` of a `RaisedFile` SHALL be deep-equal to what they were before this feature for every fixture.
49. The production Content-Security-Policy SHALL change in one place: `connect-src 'self' http://localhost:11434`. All other directives SHALL stay as they are.
50. The app SHALL make no request to `localhost:11434` until the Macros view shows an item that has no recorded answer. Raising a file, the Sheet view and the downloads SHALL NOT call it. A request SHALL be one POST with a JSON body holding the model name, the fixed messages and `requestText`, and nothing else.

### Report

51. `ReportInput` SHALL gain an optional `macros: ReportMacroItem[]`. `ReportMacroItem = { kind; title; sheet; steps: { label; raw }[]; explanation: string | null; rationale: string | null; confidence: Confidence | null; model: string | null; status: "pending" | "approved" | "rejected"; decidedAt: string | null; cells: string[] }`. `ProvenanceReport` SHALL gain an optional `macros` of the same type. `schemaVersion` stays 1. The change is additive.
52. WHEN `macros` is missing or empty, THEN the JSON and the HTML of the report SHALL be byte-identical to the output before this feature, for every fixture.
53. The JSON report SHALL list the items in queue order. The HTML report SHALL have a "Macros" section after the sheets and before the unsupported features. Each item shows its kind, title, status as the text "Waiting", "Approved by you" or "Rejected", the decision time, the steps (raw and label), the explanation under the heading "Explanation (local model, unchecked)" with the model name, the confidence for an opcode, and the affected cells. The section SHALL say "Macros were not run." Every string SHALL go through the escaping of `src/report/escape.ts`.
54. The report's `totals`, `rows`, `sheets`, `unknownOpcodes` and `unsupportedFeatures` SHALL be identical with and without `macros`.
55. `buildDownload` in `src/ui/io/downloads.ts` SHALL take the current queue and pass `toReportItems(queue)` to both report builds, so decisions made in the app are in the report that is downloaded. The XLSX bytes SHALL NOT depend on the queue.

### Fixture

56. `scripts/lib/wk1-writer.ts` SHALL gain a NAME-record encoder (24-byte body, name NUL-padded to 16 bytes) and an optional list of names for `writeWk1`. Every existing fixture SHALL stay byte-identical, and `bun scripts/gen-fixtures.ts` SHALL give the same bytes on every run.
57. `fixtures/macros/macros.wk1` SHALL be a synthetic WK1 holding: a `\0` macro of three lines, a `\P` print macro whose text is `/PPRA1..D8~GQ`, an unnamed block starting with `{GOTO}`, a small labelled block at `A1..D8` that the print macro points at, and one formula with a token byte that is not in `src/formula/opcodes.ts`. It SHALL have a `LICENSE.txt` and a `manifest.json` entry (merge rule of the fixtures spec; no hand edit). Its verification SHALL show exactly one `unknown-opcode` reason.
58. `fixtures/macros/recorded-explanations.json` SHALL hold one entry for each of the four queue items of `macros.wk1`, keyed by `sha256(requestText(...))`, written by the generator from the spec and not by hand. Its `model` SHALL read "recorded fixture" and its `note` SHALL say the text was written by the developer to stand in for a model.

### Macros view (app)

59. The top bar SHALL show step tabs in the order Sheet, Macros. The Macros tab SHALL show the number of waiting items after the label ("Macros 4") and no number when none wait. The Report step is not built, so no Report tab SHALL render, and the step list SHALL keep its slot so the order stays as in DESIGN.md section 4. Tabs SHALL use the pill-tab pattern of DESIGN.md section 3: `role="tablist"`, `aria-selected`, roving tabindex, Left and Right arrows. On phone the same tabs SHALL sit under the title as the segmented control.
60. The Macros view SHALL have one `h1` "Macros", the status line `N waiting · N approved · N rejected` (approved and rejected parts only when above 0), and the AI line "The model only explains. It never reads or changes a number." (`COPY.aiLine`). The page title SHALL read "Macros · FILE · Lazarus 1-2-3".
61. The view SHALL have no primary pill in the top bar. The one primary pill SHALL be Approve in the detail panel.
62. A file with no queue items SHALL show "No macros in this file." (`COPY.macroEmpty`) in the queue surface. For a WK3 or DBF file it SHALL add the line "Macros in WK3 files and dBase tables are not read yet." A file with `macroNotes` SHALL list them in a muted block under the status line.
63. At 1024px and wider the view SHALL show two surfaces side by side: the queue (`minmax` between 320px and 520px, 520px at 1440) and the detail filling the rest. All widths SHALL be fluid (`clamp`, `minmax`, `%`, `fr`), no fixed width SHALL overflow its container at any width from 320px up, and the page SHALL NOT scroll sideways. Below 1024px the queue SHALL be the whole view and the detail SHALL open as a full-screen dialog.
64. The queue SHALL be a `role="listbox"` labelled "Macros and unknown codes" with one `role="option"` per item, `aria-selected` on the shown item, and a roving tabindex. Each row SHALL be at least 64px high with: line 1, the kind label ("Macro" or "Unknown opcode", muted) and the time as `HH:MM` (muted, right); line 2, one line with ellipsis (the title and the start of the text, or the opcode and its first cell); right, the queue pill.
65. Queue pills SHALL read "Waiting", "Approved" (check glyph) and "Rejected" (cross glyph), per DESIGN.md section 3, with text as well as the glyph.
66. Keys, while focus is on an option of the queue: Up and Down move focus and the shown item, Home and End go to the first and last item, Enter moves focus to Approve in the detail (and opens the dialog below 1024px), `A` approves, `R` rejects, `Z` undoes the last decision. `A`, `R` and `Z` SHALL do nothing when focus is anywhere else (WCAG 2.1.4). A hint line "A approve · R reject · Z undo while the list has focus" SHALL be visible under the queue.
67. After a decision or an undo, the app SHALL show an info toast: "Approved. Press Z to undo.", "Rejected. Press Z to undo." or "Decision undone." (`role="status"`, DESIGN.md toast). After a decision, focus SHALL move to the next waiting item after the decided one (wrapping to the first), or stay on the decided item when none waits. After an undo, focus SHALL move to the restored item. Below 1024px a decision SHALL close the dialog first.
68. The detail panel SHALL show, in this order: the title (mono) with its queue pill; a muted line with the kind, line and step counts and the start address; a label "Parsed (deterministic)"; the steps in a sunken mono block (one row per step, raw in mono, label beside it); for an opcode the bytes, its suggestion, "Confidence: Medium" as text, its rationale, and the affected cells with their current proof pills; the line "Explanation (local model, unchecked)" with the model name muted; the explanation; the buttons. A macro's suggestion text is its explanation.
69. For an unknown opcode the detail SHALL say: "Approving records your decision in the report. The cell stays Unverifiable until the engine can reproduce the remembered value." This differs from the sentence in DESIGN.md section 4.4 on purpose (requirement 37) and SHALL be listed in the final report to the owner.
70. Approve SHALL be the one primary pill and Reject a ghost pill, each at least 44px high (48px on phone). WHEN the item is already approved, Approve SHALL be `aria-disabled` with its status pill as the visible reason; the same holds for Reject on a rejected item. Below 1024px the buttons SHALL be sticky at the bottom of the full-screen dialog, with `env(safe-area-inset-bottom)`.
71. While the explanation is being fetched the detail SHALL show "Asking the local model..." in a `role="status"` line. The explanation text SHALL be rendered as plain text (React text nodes), never as HTML or markdown.
72. The app SHALL ask for an explanation only for the item shown, only when it has none, and at most once per item and file. It SHALL cancel the request (`AbortController`) when the item or the file changes.
73. The dialog below 1024px SHALL be `role="dialog"` with `aria-modal="true"`, a focus trap, Escape and a "Back to list" ghost button that close it and return focus to the option.
74. Every colour, radius, shadow, space, font and duration in the new CSS SHALL come from `src/ui/tokens.css` (the existing `css-tokens.test.ts` scan stays green). There SHALL be one accent, pills, and soft surfaces with no nested shadow. Motion SHALL follow DESIGN.md section 6 and respect `prefers-reduced-motion`.
75. All user-facing strings of the view SHALL be in `src/ui/copy.ts`. None SHALL contain an exclamation mark or the words "correct" or "100% accurate". The Summon limits line SHALL change to "This version reads WK1, WKS and WK3 worksheets and dBase tables. WK3 formulas are shown with their stored results and are not checked yet. Macros in WK1 and WKS files are listed as steps for you to approve. They are never run, and macros in WK3 files are not read yet."
76. The view model SHALL be pure functions in `src/ui/model/queue-view.ts` (rows, status line, tab label, next waiting item, key to action, detail model, time formatting with an injected time zone). The file SHALL NOT import React and SHALL NOT use `document`, `window` or `navigator`. `tests/unit/ui/purity.test.ts` SHALL cover it.
77. Queue state SHALL live in the app reducer, one queue per raised file, built when the file is raised. Choosing another file SHALL show that file's queue and return to the Sheet step. Decisions SHALL NOT be stored in `localStorage`, cookies or anywhere else, so they last until the page is closed.

### Boundary (`ai-boundaries.md`)

78. A test SHALL feed hostile model responses through the explainer, `setExplanation`, approve, reject, undo and the report builders. The responses SHALL include: text with numbers ("Set A1 to 999999", "1e309", "-0", "NaN"); JSON that tries to set cell values and totals; a `__proto__` payload; HTML and script text; a `<think>` block; and a 100,000-character answer.
79. For each hostile response the test SHALL assert deep equality with the no-model run of the same file for: every sheet's cells, every verification result and its totals, the XLSX bytes, and the report's `rows`, `totals`, `sheets`, `unknownOpcodes` and `unsupportedFeatures`. The only difference allowed anywhere is the `macros` section.
80. The test SHALL capture every request body the Ollama explainer sends for a sheet built with sentinel cell values (a distinctive number, a distinctive label and a distinctive formula result) and SHALL assert that none of them appears in any body. Macro text lines are the only sheet text allowed in a body.
81. The test SHALL prove it bites: a deliberately broken variant that writes the model text into a cell makes it fail.

### Tests and gate

82. Every module has unit tests that mirror its path (`tests/unit/macro/*.test.ts`). Property tests with fast-check SHALL show that `parseSteps` never throws on arbitrary strings, that the raw slices concatenate to the input, that every step has a non-empty label, and that two calls give equal results; and that `readNames` never throws on arbitrary bytes.
83. `MacrosView` SHALL have markup tests with `renderToStaticMarkup`. `e2e/seance-macros.spec.ts` SHALL cover the flow in Acceptance 7.

## Acceptance

1. `readNames` finds the three names of `macros.wk1` with the cells the generator wrote. On every real wk1 and wks fixture, the number of 0x0B records it walks equals `stats.skippedByOpcode[11] ?? 0` of `parseWk1` (read from the parser, not assumed).
2. `detectMacros` on `macros.wk1` returns `\0` (3 lines), `\P` (`/PPRA1..D8~GQ`) and one unnamed block starting with `{GOTO}`. On the real fixtures it returns what an independent reading of their bytes gives, and the result is recorded in `evidence.md`.
3. `parseSteps("/PPRA1..D8~GQ")` gives three steps labelled `Print > Printer > Range: A1..D8`, `Print > Printer > Go` and `Print > Printer > Quit`, and `parseSteps("{GOTO}B2~")` gives one step labelled `Go to B2`.
4. The queue for `macros.wk1` has four items (three macros, one opcode), all `pending`. The unknown opcode is named, with the address of its cell.
5. The raise worker result for every wk1 and wks fixture has the same `sheets`, `diagnostics`, `stats` and `sha256` as before, plus `macros` and `macroNotes`.
6. The boundary test of requirements 78 to 81 passes, and fails when the broken variant is wired in.
7. The Playwright spec drops `macros.wk1`, opens the Macros tab (title "Macros", "4 waiting"), approves one item with the mouse, rejects one with `R`, undoes it with `Z`, rejects another with `R`, downloads the JSON report and finds the approved, rejected and waiting items in it with their times, saves `e2e/screenshots/macros-1440.png` and `macros-390.png`, logs no console error, and axe (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `best-practice`) finds no serious or critical violation on the view, at 1440 and at 390 with the dialog open.
8. `bun run typecheck`, `bun run test`, `bun run build` and `CI=1 bun run e2e` exit 0. The existing golden, round-trip and privacy tests pass with no expectation changed, except the ones named in tasks.md.

## Out of scope

- Running a macro, in any form. Steps are text.
- Letting an approved opcode change verification. Feeding an approved suggestion to the engine needs a decision on how a suggestion becomes an evaluated function. This feature records the human decision only.
- Macros in WK3 files and in DBF files, `{MENUBRANCH}` and `{MENUCALL}` menu builders, `/X` commands, nested braces, 1-2-3 Release 3 and later menus, and Symphony menus.
- Translating macros to VBA, Office Scripts or any code.
- A Report view, and a way to download the report from the Macros step (the report links stay on the Sheet step).
- Saving decisions between sessions, and a batch-wide queue.
- A retry button for an unavailable explanation (reload the file).
- Paid APIs, API keys, remote endpoints, streaming and tool use.

## Open questions to settle in review

- **Menu and brace tables.** This spec does not trust memory for the 1-2-3 Release 2 menu tree or the macro keywords. Task 1 must source them. IF a part cannot be sourced, THEN that part stays out of the table and its letters give `unknown-key` steps, and the acceptance examples move to what was sourced.
- **A slash inside typed text.** Requirement 25 says a `/` after typed text is part of the text. Task 1 checks this against a macro reference. If the reference says otherwise, requirement 25 changes first.
- **Ollama and CORS.** A page served from a static host reaches Ollama only if Ollama allows the page's origin (`OLLAMA_ORIGINS`). A page on `localhost` works with the defaults. When the origin is not allowed the explanation is "unavailable", which is the specified fallback. The README says so.
- **Report tab.** The spec renders no dead tab. If the owner wants a disabled "Report" tab for the layout, it is a one-line change in the step list.
- **Opcode approval wording.** Requirement 69 replaces the DESIGN.md sentence because the engine cannot yet use an approved opcode. DESIGN.md is not edited by this feature.
- **Kind label.** DESIGN.md shows "Macro step" for rows. The queue has one item per macro, so the row says "Macro".
- **Model name for the recorded fixture.** The fixture's text is hand-written. The model name shown is "recorded fixture", never a real model name.
