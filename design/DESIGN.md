# Lazarus 1-2-3: design system

Source of rules: `.kiro/steering/design.md`. This file makes those rules buildable: exact tokens, component specs, a layout for every screen, copy, and an accessibility checklist. If the two disagree, steering wins and this file gets fixed.

The look: a calm, soft, spacious data tool. White surfaces float on a pale neutral canvas. One near-black pill per view. One spectral violet accent. Large titles and large tabular numbers. The seance is in the details: a candle glow behind the drop zone, translucent ghost cells that solidify once proven, and a few quiet words ("Raise", "Resurrected", "remembered").

## 1. Decisions

- **Accent: pale spectral violet** (`#7563e6` family). Green is already the Matched status tint. A green accent would make focus rings and selections look like proof. Violet is far from all three status hues (green, rose, slate), so a selected Mismatched cell still reads as Mismatched. It is also the colder, more spectral of the two options.
- **Candle glow** is a warm-white core fading into a violet halo. The warm white is a near-neutral, not a second accent. This keeps steering's "faint warm glow" without adding orange (orange plus near-black would read as cartoon Halloween).
- **Unverifiable is slate grey, not amber.** It matches the "ghost" idea (half-present, muted) and keeps amber and orange out of the palette.
- **No sidebar.** A top bar on the canvas carries the wordmark, three step tabs (Sheet, Macros, Report) and the one primary pill. There are only three places to go, so an icon rail would be admin-kit chrome.
- **Font: system stack**, nothing bundled and nothing remote. Formulas use the system monospace stack. Every number uses `font-variant-numeric: tabular-nums`.
- **Proof states apply only to formula cells.** Constants and labels render as plain text with no marker.

## 2. Tokens: `src/ui/tokens.css`

Import it once in `src/ui/main.tsx`. Components use only these variables, with no ad hoc hex values (steering rule).

```css
:root {
  /* colour: neutrals */
  --canvas: #eef0f4;
  --surface: #ffffff;
  --surface-sunken: #f5f6f9;      /* code blocks, inset rows inside a surface */
  --text: #12141a;
  --text-muted: #646a7b;
  --hairline: #e6e8ee;            /* grid lines, list dividers; never a box border */
  --on-primary: #ffffff;
  --primary: #12141a;             /* the one near-black pill */
  --primary-hover: #2b2f3a;

  /* colour: the one accent (spectral violet) */
  --accent: #7563e6;              /* focus ring, selection edge, progress, chart line */
  --accent-ink: #5b4bd1;          /* accent text and links */
  --accent-soft: #efecff;         /* selected row/cell/tab fill */
  --accent-glow: rgba(117, 99, 230, 0.18);
  --candle-core: rgba(255, 248, 236, 0.95);

  /* colour: status (pill bg / pill text / grid marker) */
  --status-matched-bg: #e2f3e9;
  --status-matched-fg: #1d6b43;
  --status-matched-mark: #2f9e62;
  --status-mismatched-bg: #fbe6eb;
  --status-mismatched-fg: #a4243f;
  --status-mismatched-mark: #a4243f;
  --status-unverifiable-bg: #e8eaf0;
  --status-unverifiable-fg: #4b5163;
  --status-unverifiable-mark: #8a90a2;

  /* colour: errors (parse failure, unsupported file, failed batch item) */
  --danger: #b42318;
  --danger-soft: #fdecea;

  /* ghost cells */
  --ghost-ink: #646a7b;                     /* unverifiable value text (AA on white) */
  --ghost-fill: rgba(18, 20, 26, 0.06);     /* not-yet-raised placeholder bar */

  /* radius */
  --radius-xs: 6px;      /* grid selection ring, small chips */
  --radius-sm: 10px;     /* inputs, code blocks */
  --radius-md: 12px;     /* queue items, inner panels */
  --radius-lg: 20px;     /* surfaces, drawer, drop zone */
  --radius-pill: 999px;

  /* shadow */
  --shadow-surface: 0 12px 32px rgba(20, 24, 40, 0.08), 0 1px 2px rgba(20, 24, 40, 0.04);
  --shadow-raised: 0 24px 64px rgba(20, 24, 40, 0.16), 0 2px 6px rgba(20, 24, 40, 0.06);
  --shadow-primary: 0 6px 16px rgba(18, 20, 26, 0.18);

  /* spacing (4px base) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;
  --space-14: 56px; --space-18: 72px;

  /* type */
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
  --text-display: 600 56px/1.0 var(--font-sans);   /* % verified, drawer value */
  --text-display-sm: 600 40px/1.05 var(--font-sans); /* phone display, stat tiles */
  --text-title: 650 32px/1.15 var(--font-sans);    /* screen title (44px on Summon) */
  --text-h2: 600 20px/1.3 var(--font-sans);
  --text-body: 400 15px/1.5 var(--font-sans);
  --text-body-strong: 600 15px/1.5 var(--font-sans);
  --text-small: 500 13px/1.4 var(--font-sans);     /* pills, list meta */
  --text-label: 500 12px/1.3 var(--font-sans);     /* muted labels, column letters */
  --text-mono: 400 14px/1.5 var(--font-mono);      /* formulas, addresses */
  --tracking-display: -0.02em;
  --tracking-label: 0.02em;

  /* layering */
  --z-sticky: 10;
  --z-drawer: 50;     /* phone scrim sits at 49 */
  --z-toast: 60;

  /* motion */
  --dur-fast: 150ms;   /* hover, press, pill colour */
  --dur-base: 200ms;   /* tab/filter change, toast */
  --dur-slow: 250ms;   /* drawer slide, ghost solidify, glow bloom */
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --focus-ring: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent);
}

@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 0ms; --dur-base: 0ms; --dur-slow: 0ms; }
}

body { background: var(--canvas); color: var(--text); font: var(--text-body); font-variant-numeric: tabular-nums; }
```

Breakpoints (constants, since media queries cannot read variables): phone `max-width: 640px`, tablet `641-1023px` (drawer overlays the grid), desktop `>= 1024px`. Content max width is 1360px, centred.

### Contrast (WCAG 2.x relative luminance, computed with `bun -e`)

| Pair | Ratio | Needs |
|---|---|---|
| Matched pill `#1d6b43` on `#e2f3e9` | 5.63 | 4.5 |
| Mismatched pill `#a4243f` on `#fbe6eb` | 6.07 | 4.5 |
| Unverifiable pill `#4b5163` on `#e8eaf0` | 6.57 | 4.5 |
| Muted text `#646a7b` on surface `#ffffff` | 5.40 | 4.5 |
| Muted text `#646a7b` on canvas `#eef0f4` | 4.73 | 4.5 |
| Muted text on accent-soft / mismatched bg / matched bg | 4.66 / 4.53 / 4.69 | 4.5 |
| Text `#12141a` on surface / canvas | 18.41 / 16.14 | 4.5 |
| White on primary pill `#12141a` | 18.41 | 4.5 |
| Accent ink `#5b4bd1` on surface / canvas / accent-soft | 6.23 / 5.46 / 5.37 | 4.5 |
| Focus ring `#7563e6` vs surface / canvas | 4.48 / 3.93 | 3.0 |
| Focus ring vs accent-soft / mismatched bg / matched bg | 3.87 / 3.76 / 3.89 | 3.0 |
| Danger `#b42318` on surface / danger-soft | 6.57 / 5.75 | 4.5 |
| Matched mark `#2f9e62` / unverifiable mark `#8a90a2` on surface | 3.39 / 3.19 | 3.0 (graphic) |

Muted text on accent-soft and on the mismatched tint sits just above 4.5. Do not lighten `--text-muted` and do not darken those tints.

## 3. Components

All interactive components show `box-shadow: var(--focus-ring)` on `:focus-visible`. Hover and press transitions use `--dur-fast var(--ease-out)`.

**Pill button, primary.** Height 44px (48px on phone), padding 0 22px, `--radius-pill`, bg `--primary`, text `--on-primary` in `--text-body-strong`, `--shadow-primary`. Hover `--primary-hover`. Press: translateY(1px). Disabled: opacity 0.4 with `aria-disabled` and a visible reason next to it. **Exactly one per view.**

**Pill button, ghost.** Same shape and height. Transparent bg, `--text` label, no border. Hover bg `--surface-sunken` on surfaces or `rgba(18,20,26,0.05)` on canvas. **Text button**: `--accent-ink` label with an underline on hover; used for "Choose folder", "Copy diagnostics" and similar.

**Status pill.** Inline-flex, height 24px, padding 0 10px, `--radius-pill`, `--text-small`, bg and fg from the status tokens. A 6px leading glyph carries a shape cue so colour is never the only signal: Matched is a filled dot, Mismatched is a short vertical bar, Unverifiable is a hollow ring. Text is always "Matched", "Mismatched" or "Unverifiable", and counts sit outside the pill. The same component is used in the grid legend, filters, drawer, report and queue.

**Queue pill** (approval state, kept separate from proof state): Waiting uses `--accent-soft` with `--accent-ink`. Approved uses `--surface-sunken` with `--text` and a check glyph. Rejected uses `--surface-sunken` with `--text-muted` and a cross glyph.

**Surface (card).** bg `--surface`, `--radius-lg`, `--shadow-surface`, padding `--space-6` (`--space-4` on phone). It sits only on the canvas. Never nest a shadowed surface inside another surface. Inner grouping uses `--surface-sunken` with `--radius-md` and no shadow, or whitespace. No borders. Hairlines appear only as grid lines and list dividers.

**Stat tile.** Not a box. It is a column inside the totals surface: a label (`--text-label`, muted), then a number (`--text-display-sm`, `--tracking-display`, tabular), then a status pill or a muted short line. The headline tile ("% verified") uses `--text-display`. Tiles are separated by `--space-10`, not by dividers.

**Grid cell** (inside the grid surface; row 36px; column header 32px; row-number column 48px; 1px `--hairline` lines; no zebra stripes; header row is sticky white with `--text-label` muted letters A, B, C):

| State | Visual | Non-colour cue |
|---|---|---|
| Matched | value in `--text`, solid | 6px filled dot `--status-matched-mark`, leading edge |
| Mismatched | bg `--status-mismatched-bg`, value in `--text` | 2px inset bar `--status-mismatched-mark` on leading edge |
| Unverifiable (ghost) | value in `--ghost-ink`, 1px dotted underline `--status-unverifiable-mark`, transparent bg | 6px hollow ring |
| Not yet raised (ghost) | value hidden; `--ghost-fill` bar 60% width x 8px, `--radius-xs`; `opacity: 0.5` | `aria-busy="true"` |
| Selected | 2px inset ring `--accent` (`--radius-xs`); bg `--accent-soft` unless Mismatched (keeps rose) | ring |
| Plain (constant/label) | value in `--text`, no marker | none |

Solidify: when a value arrives the cell goes from `opacity 0.35; filter: blur(1px)` to `opacity 1; blur(0)` over `--dur-slow --ease-out`. Under reduced motion it swaps instantly. The ghost effect uses colour and ink, never opacity on real values, so contrast stays measurable.

**Drawer.** Desktop: a floating panel 440px wide, inset 16px from the top, right and bottom of the viewport, `--radius-lg`, `--shadow-raised`, `z-index: var(--z-drawer)`. It is non-modal (`role="complementary"`, labelled "Cell B12"): the grid reflows to leave room, arrow keys keep moving through cells and the drawer follows, Esc closes it and returns focus to the cell. Tablet: same panel overlaying the grid. Phone: full-screen modal sheet (`role="dialog"`, `aria-modal`, focus trapped, scrim `rgba(18,20,26,0.24)` at z 49). Slide in 16px plus fade over `--dur-slow`.

**Queue item.** A row inside the queue surface, 64px minimum, padding `--space-3 --space-4`, `--radius-md`, hairline divider between rows. Line 1: kind label ("Macro step" or "Unknown opcode", `--text-label` muted), time (muted, right). Line 2: one short line (`--text-body-strong`, single line with ellipsis). Right: queue pill. Selected item: bg `--accent-soft`.

**Batch row.** Same anatomy as a queue item: file name (strong), kind ("WK1", label), time; short line "98.6% verified, 2 mismatched" (muted); right: the worst status pill present, or a danger "Failed" pill (`--danger-soft` / `--danger`).

**Drop zone.** A surface, `--radius-lg`, min-height 240px (180px on phone), content centred. Behind it, on the canvas, sits a pseudo-element candle glow: `radial-gradient(closest-side, var(--candle-core), var(--accent-glow) 55%, transparent 100%)`, 140% of the zone's size, centred, `pointer-events: none`. Idle: no dashed border. Drag-over: a 1.5px dashed `--accent` outline at 8px inset, and the glow scales 1 to 1.08 over `--dur-slow`. Reduced motion: no scale, only the outline. The zone is one `<button>` that opens the file picker; Enter and Space work.

**Tabs (pill tabs).** Used for steps (Sheet, Macros, Report), sheet tabs (A, B, C) and status filters. Height 32px, padding 0 14px, `--radius-pill`, `--text-small`. Inactive: `--text-muted`, transparent. Active: `--accent-soft` bg, `--text` label, `aria-selected` / `aria-current`. Counts follow in tabular muted text ("Mismatched 3"). Arrow keys move between tabs (roving tabindex).

**Toast.** Bottom-centre (on phone, above the sticky pill), max 420px, surface with `--shadow-raised`, `--radius-md`, padding `--space-3 --space-4`. Info: `role="status"`, dismisses after 4s, pauses on hover and focus. Errors never auto-dismiss: `role="alert"`, a 3px leading bar in `--danger`, and a ghost "Dismiss" button.

**Inline error panel.** A surface with an `h2` title in `--text`, a danger pill ("Could not raise"), and a short reason in body. Diagnostics go in a `--surface-sunken` block in `--text-mono`, one per line: `offset 0x01A4  record 0x000E  formula length past end of record`.

## 4. Screens

The first content on every screen (the `h1` after the slim wordmark bar) is a title, and it sits next to its status line or the one primary pill. Global frame (desktop): canvas, page padding 40px, top bar 72px **on the canvas** (no white bar): wordmark "Lazarus 1-2-3" (`--text-body-strong`) at left, step tabs at centre-left, primary pill at right. Sections are separated by `--space-8`, and the title block sits `--space-10` below the top bar. Phone frame: page padding 16px, top bar 56px with wordmark and current step name, the primary pill sticky at the bottom (16px inset, full width, plus `env(safe-area-inset-bottom)`), and steps reached through a quiet "Sheet / Macros / Report" segmented control under the title.

### 4.1 Summon (drop)

```
1440 ─────────────────────────────────────────────────────────────────────
 Lazarus 1-2-3
                     Raise a Lotus 1-2-3 file                (title 44px)
       WK1, WKS, WK3 and dBase. Every formula rebuilt for Excel
       and checked cell by cell against the numbers it remembers.
                        ( Summon the sample )               (primary pill)
              .  ·  ° candle glow °  ·  .
            ╭──────────────────────────────────────╮
            │              [file glyph]            │
            │   Drop a file or a whole folder here │
            │       Choose file  ·  Choose folder  │  (text buttons)
            ╰──────────────────────────────────────╯
            .wk1 .wks .wk3 .dbf   ·   Files never leave this browser.
```

Column width 640px, centred, starting 96px below the top bar. Title, pill, drop zone and privacy line all sit above the fold at 1440x900. There are no step tabs yet. The sample needs no file and no local model.

```
390 ──────────────────────────
 Lazarus 1-2-3
 Raise a Lotus
 1-2-3 file          (32px)
 WK1, WKS, WK3, dBase. Checked
 cell by cell.
 ╭──────────────────────────╮
 │  Tap to choose a file    │  (glow behind)
 ╰──────────────────────────╯
 Files never leave this browser.
 ( Summon the sample )  ← sticky
```

Phone hides "Choose folder" when `webkitdirectory` is unsupported, and batch stays a desktop feature. The privacy line stays visible.

### 4.2 Sheet grid with proof status

```
1440 ─────────────────────────────────────────────────────────────────────
 Lazarus 1-2-3   [Sheet] Macros 4  Report                 ( Open report )
 ledger-1987.wk1                                           (title 32px)
 WK1 · 3 sheets · 1,204 formulas · raised 14:02             (muted)
 ╭─ totals surface ──────────────────────────────────────────────────╮
 │ Verified           Matched        Mismatched      Unverifiable    │
 │ 98.0%   (56px)     1,180          3               21    (40px)    │
 │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬|‖ │ proof bar
 ╰───────────────────────────────────────────────────────────────────╯
 ╭─ grid surface ────────────────────────────────────────────────────╮
 │ (A) B  C          All 1,204 · Matched · Mismatched 3 · Unverif. 21│
 │     A          B            C            D            E           │
 │  1  Income     1987         1988                                  │
 │  2  Sales      •  41,200    •  44,950                             │
 │  3  Costs      ▌  18,330    •  19,004    (rose row tint on B3)    │
 │  4  Net        ○  22,870    •  25,946    (dotted, ghost ink)      │
 │  …  (sticky header, virtualised rows, 36px)                       │
 ╰───────────────────────────────────────────────────────────────────╯
```

- The proof bar is 8px tall and `--radius-pill`, with segments in the status mark colours in the order matched, mismatched, unverifiable, each 2px apart. Its label is in `aria-describedby`. "Verified" = matched / formula cells, to one decimal place and never rounded up to 100.0% while any cell is not matched.
- Batch (folder dropped): a 320px batch list surface sits to the left of the totals and grid, titled "12 files" with batch rows. The selected file uses `--accent-soft`. It holds content, not navigation icons.
- Above the fold at 1440x900: title, totals and about 14 grid rows.
- Empty filter: "No mismatched cells on this sheet." (muted, centred in the grid surface, 120px tall).

```
390 ──────────────────────────
 ledger-1987.wk1
 WK1 · 3 sheets   Sheet|Macros|Report
 ╭──────────────────────────╮
 │ Verified   98.0%  (40px) │
 │ 1,180 Matched  3 Mism.   │
 │ 21 Unverifiable          │
 │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬|‖   │
 ╰──────────────────────────╯
 (A) B C  ‹ All  Mismatched › (scroll)
 ╭──────────────────────────╮
 │ Mismatched 3             │
 │ B3  @SUM(B5..B9)  18,330 │
 │                [Mismatched]
 │ Unverifiable 21          │
 │ B4  @NOW()        ghost  │
 │ Matched 1,180  Show all ›│
 ╰──────────────────────────╯
 ( Open report )  ← sticky
```

On phone the grid becomes a status list. Rows are grouped by status with Mismatched first and Matched collapsed. Each 64px row shows the address (mono) and short Lotus formula (muted) on the left, and the value (tabular) and pill on the right. Tap opens the drawer as a full-screen sheet.

### 4.3 Cell diff drawer

```
 grid (reflowed)                     ╭─ drawer 440 ────────────────╮
                                     │ Cell                      × │
                                     │ B3   (32px mono) [Mismatched]
                                     │ The numbers disagree.       │
                                     │                             │
                                     │ Remembered       Raised     │
                                     │ 18,330.00        18,330.01  │ (40px)
                                     │ Differs by 0.01. Tolerance  │
                                     │ 1e-9 relative.  (muted)     │
                                     │ ┌ Lotus ─────────────────┐  │ sunken
                                     │ │ @SUM(B5..B9)           │  │
                                     │ ├ Excel ─────────────────┤  │
                                     │ │ =SUM(B5:B9)            │  │
                                     │ └────────────────────────┘  │
                                     │ Inputs  B5 4,100 · B6 …     │
                                     │ Diagnostics                 │
                                     │ · cached value stored as …  │
                                     │ Copy Excel formula          │ text btn
                                     ╰─────────────────────────────╯
```

- The header holds a "Cell" label, the address in `--text-mono` at 32px, the status pill and a ghost close button (aria-label "Close cell details"). Below sits one plain sentence per state. Matched: "Raised value matches what the file remembers." Mismatched: "The numbers disagree." Unverifiable: the reason, e.g. "@NOW changes every time; it cannot be proven."
- The value pair is two stat columns. A missing value shows "Not stored in the file" in muted body, never a dash alone.
- The drawer has no primary pill. The view's primary stays "Open report" in the top bar.
- Phone: full-screen sheet, the same order, with a sticky ghost "Back to list" at the bottom.

### 4.4 Macro approval queue

```
1440 ─────────────────────────────────────────────────────────────────────
 Lazarus 1-2-3   Sheet [Macros 4] Report          (no top-bar pill here)
 Macros                                                     (title 32px)
 4 waiting · 9 approved · 1 rejected
 The model only explains. It never reads or changes a number.  (muted)
 ╭─ queue 520 ────────────────╮  ╭─ detail ─────────────────────────────╮
 │ Macro step         14:03   │  │ \P  Print routine · step 2 of 5      │
 │ /PPR A1..H40~ …  [Waiting] │  │ ┌ Parsed (deterministic) ─────────┐ │
 │────────────────────────────│  │ │ /PP  R  A1..H40 ~  G  Q          │ │
 │ Unknown opcode     14:03   │  │ └─────────────────────────────────┘ │
 │ 0x5A at C7      [Waiting]  │  │ Explanation (local model, unchecked) │
 │────────────────────────────│  │ Prints the range A1 to H40, then … │
 │ Macro step         14:02   │  │                                      │
 │ {GOTO}B2~      [Approved]  │  │ ( Approve )  Reject      A · R       │
 ╰────────────────────────────╯  ╰──────────────────────────────────────╯
```

- The detail panel shows deterministic steps first, in a mono sunken block, then the model's explanation labelled "Explanation (local model, unchecked)" with the model name in muted text.
- "Approve" is this view's single primary pill. On desktop it appears only in the detail panel, next to the item it acts on, and the top-bar slot stays empty on this view. On phone it is the sticky bottom pill of the full-screen detail. "Reject" is always ghost.
- Unknown opcode items show: the bytes, the model's suggestion (e.g. `@ISNUMBER`), a confidence label (Low / Medium / High as text), the rationale, and the line "Approving lets the engine try. The cell is Matched only if the engine reproduces the remembered value." Affected cells are listed with their current proof pills.
- Local model offline: the explanation area reads "Explanation unavailable: the local model is not running. The steps above are complete." Approve stays available.
- Keyboard: the list is a `listbox` with a roving tabindex. Up/Down move, Enter opens detail and focuses Approve. `A` approves and `R` rejects, but only while focus is inside the queue (WCAG 2.1.4), and the hint is shown. Z undoes the last decision, with a toast "Approved. Press Z to undo." After a decision, focus moves to the next waiting item.

```
390 ──────────────────────────
 Macros
 4 waiting · 9 approved
 The model only explains. It
 never changes a number.
 ╭──────────────────────────╮
 │ Macro step       14:03   │
 │ /PPR A1..H40~  [Waiting] │
 │ Unknown opcode   14:03   │
 │ 0x5A at C7     [Waiting] │
 ╰──────────────────────────╯
 (tap → full-screen detail with
  sticky  ( Approve )  Reject )
```

### 4.5 Report and download

```
1440 ─────────────────────────────────────────────────────────────────────
 Lazarus 1-2-3   Sheet  Macros  [Report]                 ( Download XLSX )
 Resurrected                                                (title 32px)
 ledger-1987.wk1 → ledger-1987.xlsx        Download report (HTML) · JSON
 ╭─ hero surface (candle glow behind the number) ─────────────────────╮
 │ 98.0% verified (56px)     1,180 [Matched] 3 [Mismatched] 21 [Unv.] │
 │ Proven cell by cell against the values the original file stored.  │
 ╰───────────────────────────────────────────────────────────────────╯
 ╭─ provenance ────────────────╮  ╭─ not proven, and why ─────────────╮
 │ Source   ledger-1987.wk1    │  │ Volatile @NOW          12 cells   │
 │ SHA-256  3f9a…c21e          │  │ Missing cached value    6 cells   │
 │ Format   WK1 · 3 sheets     │  │ Unknown opcode 0x5A     3 cells   │
 │ Engine   0.4.0 · tol 1e-9   │  │ Mismatched              3 cells › │
 │ Macros   9 approved by you  │  ╰───────────────────────────────────╯
 │          (explained by …)   │
 ╰─────────────────────────────╯
```

- Provenance rows are a two-column definition list: label muted, 120px; value body or mono. Reason rows are scannable (reason, count, link to the filtered grid).
- Use the title "Resurrected" only when nothing is mismatched. Otherwise use "Raised, with 3 disagreements". Never say "correct" or "100% accurate".
- Above the fold: title, both downloads and the hero.
- Phone: title, hero (40px number, pills wrapping below), "not proven" list, then provenance. The sticky primary is "Download XLSX", and the report links sit as text buttons under the title.

## 5. States

| State | Where | Treatment |
|---|---|---|
| Raising (loading) | Summon then Sheet | Drop zone turns into a progress surface: file name, four steps ("Reading records", "Rebuilding formulas", "Recalculating", "Comparing") with the current step in `--text` and the rest muted, plus a 4px `--accent` progress bar. Grid cells appear as not-yet-raised ghosts and solidify. `aria-live="polite"` announces each step. |
| Parse failure | Summon (or batch row) | Inline error panel: "This file could not be raised", reason, diagnostics block, text button "Copy diagnostics". Primary pill becomes "Try another file". |
| Unsupported file | Summon | "This is not a Lotus 1-2-3 or dBase file", list of accepted extensions, primary "Choose another file". No danger pill; this is not our failure. |
| Partial batch | Sheet (batch) | Failed rows get a danger "Failed" pill and a one-line reason. Other files open normally. |
| Empty filter | Sheet | One muted sentence in the grid surface. |
| Model offline | Macros | See 4.4. |
| Download saved | Report | Info toast "ledger-1987.xlsx saved." |

## 6. Motion

- Durations are 150, 200 and 250ms only. There are no loops: no flickering candle and no pulsing ghosts.
- Allowed animations: button hover/press (fast), tab and filter change (base), drawer slide plus fade 16px (slow), ghost solidify (slow), glow bloom on drag-over (slow), toast in/out (base).
- `prefers-reduced-motion: reduce` sets all durations to 0. The glow stays as a static gradient and ghosts swap to solid instantly.

## 7. Copy guide

| Slot | String |
|---|---|
| Summon title | Raise a Lotus 1-2-3 file |
| Summon primary | Summon the sample |
| Drop zone | Drop a file or a whole folder here |
| Privacy line | Files never leave this browser. No upload, no account. |
| Sheet primary | Open report |
| Status pills | Matched / Mismatched / Unverifiable |
| Mismatched sentence | The numbers disagree. |
| Value labels | Remembered (cached in the file) / Raised (recalculated) |
| AI line | The model only explains. It never reads or changes a number. |
| Macro empty | No macros in this file. |
| Report title | Resurrected / Raised, with N disagreements |
| Report primary | Download XLSX |
| Report secondary | Download report (HTML) · JSON |
| Honest limits | Unverifiable cells are not wrong; we could not prove them. The report lists each one and why. |
| Parse failure | This file could not be raised. |

Tone: plain words for executors, archivists and accountants. No exclamation marks and no jokes about death. Seance words go only in titles and primary actions.

## 8. Accessibility checklist

- [ ] Every status shows text and a shape, not colour alone (pills, grid markers, proof bar labels).
- [ ] All pairs in the contrast table pass, and no token is changed without recomputing.
- [ ] `:focus-visible` uses the 2px surface gap plus 2px `--accent` ring on every control, cell, tab and queue item.
- [ ] The grid is `role="grid"` with `aria-rowcount`/`aria-colcount`, arrow keys, Home/End and PageUp/PageDown. Each cell's label reads "B3, 18,330, Mismatched".
- [ ] Drawer: Esc closes and focus returns to the cell. On phone the dialog traps focus.
- [ ] The queue works fully by keyboard (listbox, A/R only while focused, Z undo, focus advances), and decisions are announced via `role="status"`.
- [ ] Drop zone is a button. The file and folder pickers are reachable without drag and drop.
- [ ] Progress and step changes are announced politely. Errors use `role="alert"`.
- [ ] Touch targets are at least 44px, and the phone primary pill sits within thumb reach at the bottom.
- [ ] Reduced motion is honoured. No content depends on animation.
- [ ] One `h1` per screen (the title), and the page title updates with each screen.
- [ ] Text zooms to 200% without loss. On phone the grid is a list, so there is no horizontal scroll trap.

## 9. References

Dribbble shots in `design/refs/` (gitignored, private reference only, never shipped or copied). What each one gave us:

1. **AI Automation Workflow Dashboard - Data Table** (Pickolab): white panels floating on a pale canvas with soft shadows, and the AI assistant kept in its own panel. Borrowed: the floating inset drawer, and keeping model output visibly separate. Rejected: saturated blue primary, icon rail.
2. **Dashboard - Data Table UI** (Harishkumar): card header "PO List" with a count chip and muted subtitle, filter chips with clear, airy 64px rows. Borrowed: card header plus count, chip filters, list row height. Rejected: sectioned sidebar, cyan info banner.
3. **Modern Dashboard Data Table UI** (Mehrad Ghane): short tinted text pills (Success, Failed, Draft). Borrowed: the pill shape and tint-plus-dark-text treatment. Rejected: vertical column dividers, per-row icon action columns.
4. **Motoserve Service & Job Data Table** (Muhammad Wachid): stat numbers above the table. Borrowed: totals above the grid with large numbers. Rejected: their bordered, stacked stat boxes and uppercase headers.
5. **Admin Dashboard UI - Data Tables** (Fateme Kamali): large title with a small muted subtitle, a single dark primary top right, very soft blue-grey canvas. Borrowed: title hierarchy, one dark primary, the canvas mood.
6. **Content Management Dashboard - Media Data Table** (Sharif Khan): right detail drawer with small labels beside values, and tabs with counts. Borrowed: drawer label/value rhythm, "Episodes 12" style tab counts. Rejected: dark drawer, uppercase outlined buttons.
7. **Nobu - AI Spreadsheet Dashboard** (Vektora): spreadsheet inside a rounded surface, muted A/B/C and row numbers, tinted row selection, pill sheet tabs, black "Send" pill, AI side panel. Borrowed: grid chrome, selection tint, pill tabs, near-black pill. Rejected: orange accent (orange plus black is the Halloween cliche we avoid), formatting toolbar (we never edit).
8. **Cloud Storage File Manager - Drag & Drop** (Keitoto): drop zone with a file glyph, "Drop your files here, or click to browse", supported formats and limits line below. Borrowed: drop zone copy structure and the formats line. Rejected: dashed magenta border at rest, full-width saturated button.

What makes these current, and what we keep: pale canvas, borderless white surfaces with wide soft shadows, 16-20px radii, short tinted pills, big tabular numbers, muted small labels, generous row height, and one dark or brand primary. What makes several of them read as admin kits, and what we drop: left nav with many icons, bordered stacked boxes, icon action columns, uppercase headers.
