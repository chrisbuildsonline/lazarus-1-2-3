# Lazarus 1-2-3: design system

Source of rules: `.kiro/steering/design.md`. This file makes those rules buildable: exact tokens, component specs, a layout for every screen, copy, and an accessibility checklist. If the two disagree, steering wins and this file gets fixed.

The look: a seance held in a dark room. Violet-black canvas, dim floating surfaces, bone-white type, one candle-wax pill per view, and one spectral violet accent. Large titles and large tabular numbers. The seance is in three places a judge sees at a glance: a **summoning circle** that the file is dropped into, a **verification sweep** in which formula cells light up ectoplasm green one by one as each is proven, and a **candle glow** behind the circle and under the one pill. Plus a few quiet words ("Raise", "Resurrected", "remembered").

## 1. Decisions

- **Dark by default (F15).** The app is the seance room: canvas `#0d0b14`, surfaces `#17141f`, text `#efeaf6`. No toggle and no `prefers-color-scheme` switch: the dark room *is* the product. The downloadable HTML report is the one light page (see "Paper palette"), because people print it and browsers drop dark backgrounds when printing.
- **Accent: spectral violet** (`#9d8cff` ring, `#b9adff` ink). Green is already the Matched status. A green accent would make focus rings and selections look like proof. Violet is far from all three status hues (green, rose, slate), so a selected Mismatched cell still reads as Mismatched.
- **Primary: candle wax** (`#f4e9d4` with ink `#15111c`). On a dark room the one pill is the candle: the brightest object in the view, with a warm glow under it. It is a near-white, not orange (orange plus black reads as cartoon Halloween).
- **Matched is ectoplasm green** (`#4fe39a` mark, a faint glow). It is the colour of the sweep: proof is what glows.
- **Candle glow** is a warm-white core fading into a violet halo, behind the summoning circle. The five candle points on the circle use the same warm light.
- **Unverifiable is slate grey, not amber.** It matches the "ghost" idea (half-present, muted) and keeps amber and orange out of the palette.
- **No sidebar.** A top bar on the canvas carries the wordmark, the step tabs and the one primary pill.
- **Font: system stack**, nothing bundled and nothing remote. Formulas and runes use the system monospace stack. Every number uses `font-variant-numeric: tabular-nums`.
- **Proof states apply only to formula cells.** Constants and labels render as plain text with no marker.

## 2. Tokens: `src/ui/tokens.css`

Import it once in `src/ui/main.tsx`. Components use only these variables, with no ad hoc hex values (steering rule).

```css
:root {
  color-scheme: dark;

  /* colour: neutrals (the seance room) */
  --canvas: #0d0b14;              /* violet-black */
  --surface: #17141f;
  --surface-sunken: #211d2c;      /* code blocks, inset rows inside a surface */
  --text: #efeaf6;                /* bone */
  --text-muted: #a59fb7;
  --hairline: #2d2839;            /* grid lines, list dividers; never a box border */
  --on-primary: #15111c;          /* dark ink on the wax pill */
  --primary: #f4e9d4;             /* candle wax: the one pill */
  --primary-hover: #fff4de;

  /* colour: the one accent (spectral violet) */
  --accent: #9d8cff;              /* focus ring, selection edge, circle rings, progress */
  --accent-ink: #b9adff;          /* accent text and links */
  --accent-soft: #2a2448;         /* selected row/cell/tab fill */
  --accent-glow: rgba(157, 140, 255, 0.22);
  --candle-core: rgba(255, 236, 200, 0.9);
  --candle-warm: rgba(244, 200, 120, 0.32);   /* candle points and the glow under the pill */

  /* colour: status (pill bg / pill text / grid marker) */
  --status-matched-bg: #11291f;
  --status-matched-fg: #86f0b4;
  --status-matched-mark: #4fe39a;  /* ectoplasm */
  --status-mismatched-bg: #3a1622;
  --status-mismatched-fg: #ffa3b5;
  --status-mismatched-mark: #ff6b86;
  --status-unverifiable-bg: #25222f;
  --status-unverifiable-fg: #bdb7cc;
  --status-unverifiable-mark: #8f89a3;
  --glow-matched: 0 0 8px rgba(79, 227, 154, 0.75);   /* the lit matched dot */

  /* colour: errors (parse failure, unsupported file, failed batch item) */
  --danger: #ffa3b5;
  --danger-soft: #3a1622;

  /* ghost cells */
  --ghost-ink: #a59fb7;                       /* unverifiable and unlit value text */
  --ghost-fill: rgba(239, 234, 246, 0.08);    /* not-yet-raised bar, proof track */

  /* radius */
  --radius-xs: 6px;      /* grid selection ring, small chips */
  --radius-sm: 10px;     /* inputs, code blocks */
  --radius-md: 12px;     /* queue items, inner panels */
  --radius-lg: 20px;     /* surfaces, drawer, drop zone */
  --radius-pill: 999px;

  /* shadow */
  --shadow-surface: 0 12px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(239, 234, 246, 0.06);  /* + a faint rim light */
  --shadow-raised: 0 24px 64px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(239, 234, 246, 0.08);
  --shadow-primary: 0 6px 24px var(--candle-warm), 0 1px 2px rgba(0, 0, 0, 0.4);

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
  --text-label: 500 12px/1.3 var(--font-sans);     /* muted labels, column letters, runes */
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
  --dur-slow: 250ms;   /* drawer slide, ghost solidify, glow bloom, a cell lighting */
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --focus-ring: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent);
}

@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 0ms; --dur-base: 0ms; --dur-slow: 0ms; }
}

body { background: var(--canvas); color: var(--text); font: var(--text-body); font-variant-numeric: tabular-nums; }
```

### Paper palette (HTML report)

The downloadable report (`src/report/html.ts`) is the one light page: it gets printed, and browsers drop dark backgrounds when printing, which would leave bone text on white paper. It uses the same token names with these values. Every colour, ghost and shadow name of the block above is here (checked by `tests/unit/ui/tokens-css.test.ts`); radius, spacing and type are shared. `TOKENS` in `src/report/tokens.ts` follows this block for these names and the block above for the rest.

```css
:root {
  --canvas: #eef0f4;
  --surface: #ffffff;
  --surface-sunken: #f5f6f9;
  --text: #12141a;
  --text-muted: #646a7b;
  --hairline: #e6e8ee;
  --on-primary: #ffffff;
  --primary: #12141a;
  --primary-hover: #2b2f3a;
  --accent: #7563e6;
  --accent-ink: #5b4bd1;
  --accent-soft: #efecff;
  --accent-glow: rgba(117, 99, 230, 0.18);
  --candle-core: rgba(255, 248, 236, 0.95);
  --candle-warm: rgba(255, 214, 160, 0.3);
  --status-matched-bg: #e2f3e9;
  --status-matched-fg: #1d6b43;
  --status-matched-mark: #2f9e62;
  --status-mismatched-bg: #fbe6eb;
  --status-mismatched-fg: #a4243f;
  --status-mismatched-mark: #a4243f;
  --status-unverifiable-bg: #e8eaf0;
  --status-unverifiable-fg: #4b5163;
  --status-unverifiable-mark: #8a90a2;
  --danger: #b42318;
  --danger-soft: #fdecea;
  --ghost-ink: #646a7b;
  --ghost-fill: rgba(18, 20, 26, 0.06);
  --shadow-surface: 0 12px 32px rgba(20, 24, 40, 0.08), 0 1px 2px rgba(20, 24, 40, 0.04);
  --shadow-raised: 0 24px 64px rgba(20, 24, 40, 0.16), 0 2px 6px rgba(20, 24, 40, 0.06);
  --shadow-primary: 0 6px 16px rgba(18, 20, 26, 0.18);
}
```

The paper ratios are the F8 table (all pass): muted on white 5.40, matched pill 5.63, mismatched pill 6.07, unverifiable pill 6.57, accent ink on white 6.23, danger on white 6.57.

Breakpoints (constants, since media queries cannot read variables): phone `max-width: 640px`, tablet `641-1023px` (drawer overlays the grid), desktop `>= 1024px`. Content max width is 1360px, centred.

### Contrast (WCAG 2.x relative luminance)

Computed by `tests/unit/ui/tokens-css.test.ts` from `src/ui/tokens.css` and pasted from its output; the test fails if a ratio here drifts from the tokens or drops below its limit. Text needs 4.5. Graphics (status marks, circle rings) and the focus ring need 3.0. The focus ring is drawn with a 2px surface gap, so it never touches the wax pill. Decorative hairlines are exempt.

| Pair | Ratio | Needs | Values |
|---|---|---|---|
| `--text` on `--canvas` | 16.53 | 4.5 (text) | `#efeaf6` on `#0d0b14` |
| `--text` on `--surface` | 15.37 | 4.5 (text) | `#efeaf6` on `#17141f` |
| `--text` on `--surface-sunken` | 13.92 | 4.5 (text) | `#efeaf6` on `#211d2c` |
| `--text` on `--accent-soft` | 12.30 | 4.5 (text) | `#efeaf6` on `#2a2448` |
| `--text` on `--status-mismatched-bg` | 13.48 | 4.5 (text) | `#efeaf6` on `#3a1622` |
| `--text` on `--status-matched-bg` | 13.06 | 4.5 (text) | `#efeaf6` on `#11291f` |
| `--text-muted` on `--canvas` | 7.67 | 4.5 (text) | `#a59fb7` on `#0d0b14` |
| `--text-muted` on `--surface` | 7.13 | 4.5 (text) | `#a59fb7` on `#17141f` |
| `--text-muted` on `--surface-sunken` | 6.46 | 4.5 (text) | `#a59fb7` on `#211d2c` |
| `--text-muted` on `--accent-soft` | 5.71 | 4.5 (text) | `#a59fb7` on `#2a2448` |
| `--text-muted` on `--status-mismatched-bg` | 6.26 | 4.5 (text) | `#a59fb7` on `#3a1622` |
| `--text-muted` on `--status-matched-bg` | 6.06 | 4.5 (text) | `#a59fb7` on `#11291f` |
| `--on-primary` on `--primary` | 15.46 | 4.5 (text) | `#15111c` on `#f4e9d4` |
| `--accent-ink` on `--canvas` | 9.75 | 4.5 (text) | `#b9adff` on `#0d0b14` |
| `--accent-ink` on `--surface` | 9.07 | 4.5 (text) | `#b9adff` on `#17141f` |
| `--accent-ink` on `--surface-sunken` | 8.21 | 4.5 (text) | `#b9adff` on `#211d2c` |
| `--accent-ink` on `--accent-soft` | 7.26 | 4.5 (text) | `#b9adff` on `#2a2448` |
| `--status-matched-fg` on `--status-matched-bg` | 11.12 | 4.5 (text) | `#86f0b4` on `#11291f` |
| `--status-mismatched-fg` on `--status-mismatched-bg` | 8.47 | 4.5 (text) | `#ffa3b5` on `#3a1622` |
| `--status-unverifiable-fg` on `--status-unverifiable-bg` | 8.02 | 4.5 (text) | `#bdb7cc` on `#25222f` |
| `--danger` on `--surface` | 9.65 | 4.5 (text) | `#ffa3b5` on `#17141f` |
| `--danger` on `--danger-soft` | 8.47 | 4.5 (text) | `#ffa3b5` on `#3a1622` |
| `--ghost-ink` on `--surface` | 7.13 | 4.5 (text) | `#a59fb7` on `#17141f` |
| `--ghost-ink` on `--surface-sunken` | 6.46 | 4.5 (text) | `#a59fb7` on `#211d2c` |
| `--status-matched-mark` on `--canvas` | 11.89 | 3 (graphic) | `#4fe39a` on `#0d0b14` |
| `--status-matched-mark` on `--surface` | 11.06 | 3 (graphic) | `#4fe39a` on `#17141f` |
| `--status-matched-mark` on `--surface-sunken` | 10.01 | 3 (graphic) | `#4fe39a` on `#211d2c` |
| `--status-matched-mark` on `--status-matched-bg` | 9.40 | 3 (graphic) | `#4fe39a` on `#11291f` |
| `--status-mismatched-mark` on `--canvas` | 7.16 | 3 (graphic) | `#ff6b86` on `#0d0b14` |
| `--status-mismatched-mark` on `--surface` | 6.66 | 3 (graphic) | `#ff6b86` on `#17141f` |
| `--status-mismatched-mark` on `--surface-sunken` | 6.03 | 3 (graphic) | `#ff6b86` on `#211d2c` |
| `--status-mismatched-mark` on `--status-mismatched-bg` | 5.84 | 3 (graphic) | `#ff6b86` on `#3a1622` |
| `--status-unverifiable-mark` on `--canvas` | 5.84 | 3 (graphic) | `#8f89a3` on `#0d0b14` |
| `--status-unverifiable-mark` on `--surface` | 5.43 | 3 (graphic) | `#8f89a3` on `#17141f` |
| `--status-unverifiable-mark` on `--surface-sunken` | 4.91 | 3 (graphic) | `#8f89a3` on `#211d2c` |
| `--status-unverifiable-mark` on `--status-unverifiable-bg` | 4.65 | 3 (graphic) | `#8f89a3` on `#25222f` |
| `--accent` on `--canvas` | 7.10 | 3 (graphic) | `#9d8cff` on `#0d0b14` |
| `--accent` on `--surface` | 6.60 | 3 (graphic) | `#9d8cff` on `#17141f` |
| `--accent` on `--surface-sunken` | 5.98 | 3 (graphic) | `#9d8cff` on `#211d2c` |
| `--accent` on `--accent-soft` | 5.28 | 3 (graphic) | `#9d8cff` on `#2a2448` |
| `--accent` on `--status-matched-bg` | 5.61 | 3 (graphic) | `#9d8cff` on `#11291f` |
| `--accent` on `--status-mismatched-bg` | 5.79 | 3 (graphic) | `#9d8cff` on `#3a1622` |

Every pair has headroom: the tightest text pair is muted text on accent-soft (5.71), the tightest graphic pair is the unverifiable mark on its own pill tint (4.65). Do not change a token without rerunning the test.

## 3. Components

All interactive components show `box-shadow: var(--focus-ring)` on `:focus-visible`. Hover and press transitions use `--dur-fast var(--ease-out)`.

**Pill button, primary.** Height 44px (48px on phone), padding 0 22px, `--radius-pill`, bg `--primary` (candle wax), text `--on-primary` in `--text-body-strong`, `--shadow-primary` (a warm candle glow under it). Hover `--primary-hover`. Press: translateY(1px). Disabled: opacity 0.4 with `aria-disabled` and a visible reason next to it. **Exactly one per view.**

**Pill button, ghost.** Same shape and height. Transparent bg, `--text` label, no border. Hover bg `--surface-sunken`. **Text button**: `--accent-ink` label with an underline on hover; used for "Choose folder", "Copy diagnostics" and similar.

**Status pill.** Inline-flex, height 24px, padding 0 10px, `--radius-pill`, `--text-small`, bg and fg from the status tokens. A 6px leading glyph carries a shape cue so colour is never the only signal: Matched is a filled dot, Mismatched is a short vertical bar, Unverifiable is a hollow ring. Text is always "Matched", "Mismatched" or "Unverifiable", and counts sit outside the pill. The same component is used in the grid legend, filters, drawer, report and queue.

**Queue pill** (approval state, kept separate from proof state): Waiting uses `--accent-soft` with `--accent-ink`. Approved uses `--surface-sunken` with `--text` and a check glyph. Rejected uses `--surface-sunken` with `--text-muted` and a cross glyph.

**Surface (card).** bg `--surface` (a dim panel floating on the dark canvas), `--radius-lg`, `--shadow-surface`, padding `--space-6` (`--space-4` on phone). It sits only on the canvas. Never nest a shadowed surface inside another surface. Inner grouping uses `--surface-sunken` with `--radius-md` and no shadow, or whitespace. No borders. Hairlines appear only as grid lines and list dividers.

**Stat tile.** Not a box. It is a column inside the totals surface: a label (`--text-label`, muted), then a number (`--text-display-sm`, `--tracking-display`, tabular), then a status pill or a muted short line. The headline tile ("% verified") uses `--text-display`. Tiles are separated by `--space-10`, not by dividers.

**Grid cell** (inside the grid surface; row 36px; column header 32px; row-number column 48px; 1px `--hairline` lines; no zebra stripes; header row is sticky white with `--text-label` muted letters A, B, C):

| State | Visual | Non-colour cue |
|---|---|---|
| Matched | value in `--text`, solid | 6px filled dot `--status-matched-mark` with `--glow-matched`, leading edge |
| Mismatched | bg `--status-mismatched-bg`, value in `--text` | 2px inset bar `--status-mismatched-mark` on leading edge |
| Unverifiable (ghost) | value in `--ghost-ink`, 1px dotted underline `--status-unverifiable-mark`, transparent bg | 6px hollow ring |
| Not yet raised (ghost) | value hidden; `--ghost-fill` bar 60% width x 8px, `--radius-xs`; `opacity: 0.5` | `aria-busy="true"` |
| Unlit (sweep, before its turn) | value in `--ghost-ink`, no status marker, no status tint | none: the `aria-label` already carries the real status |
| Lit during the sweep | the status look above, plus the status tint as background (`--status-matched-bg` for Matched); the matched dot glows (`--glow-matched`) | as the status |
| Selected | 2px inset ring `--accent` (`--radius-xs`); bg `--accent-soft` unless Mismatched (keeps rose) | ring |
| Plain (constant/label) | value in `--text`, no marker | none |

Solidify: when a value arrives the cell goes from `opacity 0.35; filter: blur(1px)` to `opacity 1; blur(0)` over `--dur-slow --ease-out`. Under reduced motion it swaps instantly. The ghost effect uses colour and ink, never opacity on real values, so contrast stays measurable.

**Drawer.** Desktop: a floating panel 440px wide, inset 16px from the top, right and bottom of the viewport, `--radius-lg`, `--shadow-raised`, `z-index: var(--z-drawer)`. It is non-modal (`role="complementary"`, labelled "Cell B12"): the grid reflows to leave room, arrow keys keep moving through cells and the drawer follows, Esc closes it and returns focus to the cell. Tablet: same panel overlaying the grid. Phone: full-screen modal sheet (`role="dialog"`, `aria-modal`, focus trapped, scrim: `--canvas` at 72% opacity, at z 49). Slide in 16px plus fade over `--dur-slow`.

**Queue item.** A row inside the queue surface, 64px minimum, padding `--space-3 --space-4`, `--radius-md`, hairline divider between rows. Line 1: kind label ("Macro step" or "Unknown opcode", `--text-label` muted), time (muted, right). Line 2: one short line (`--text-body-strong`, single line with ellipsis). Right: queue pill. Selected item: bg `--accent-soft`.

**Batch row.** Same anatomy as a queue item: file name (strong), kind ("WK1", label), time; short line "98.6% verified, 2 mismatched" (muted); right: the worst status pill present, or a danger "Failed" pill (`--danger-soft` / `--danger`).

**Drop zone: the summoning circle.** A surface, `--radius-lg`, min-height 320px (240px on phone), content centred, one `<button>` that opens the file picker (Enter and Space work, its accessible name is its text: "Drop a file or a whole folder here" and the hint). Inside it, above the words, sits the summoning circle the file is dropped into: `src/ui/components/SummoningCircle.tsx`, one `aria-hidden` SVG, 220px (140px on phone):

- two thin rings (`--accent`, 1px) at radius 112 and 84 of a 240 viewBox;
- between them, a ring of Lotus 1-2-3 function names set as runes on a circular `textPath` (`@SUM · @IF · @VLOOKUP · @NPV …`, from `src/ui/model/runes.ts`), `--text-muted`, `--text-label`, solid colour, never opacity, so its contrast stays measurable (7.13 on the surface);
- five candles on the outer ring at 72 degree steps: a warm glow disc (`--candle-warm`) and a small flame point (`--candle-core`);
- the file glyph at the centre, on a `--surface-sunken` disc.

Behind the zone, on the canvas, sits the candle glow pseudo-element: `radial-gradient(closest-side, var(--candle-warm), var(--accent-glow) 55%, transparent 100%)`, 140% of the zone, `pointer-events: none`.

Hover and drag-over: the candles brighten (glow opacity 0.55 to 1), the rune ring turns 10 degrees, the rune ink moves to `--accent-ink`, and on drag-over the glyph rises 4px into the circle (the file is being summoned) and a 1.5px dashed `--accent` outline appears at 8px inset. All are one-shot transitions of `--dur-slow`; no keyframes, no loop. Reduced motion: no turn and no rise; the candle brightness and outline still change.

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
            │          ∘  ·@SUM·@IF·@NPV·  ∘        │
            │        ·  ╭───────────────╮  ·       │  summoning circle 220px:
            │       @PMT│  [file glyph] │@DATE     │  two violet rings, runes,
            │        ·  ╰───────────────╯  ·       │  five candles (∘)
            │          ∘  ·@ROUND·@AVG·    ∘        │
            │   Drop a file or a whole folder here │
            ╰──────────────────────────────────────╯
                  Choose file  ·  Choose folder     (text buttons)
            .wk1 .wks .wk3 .dbf   ·   Files never leave this browser.
```

Column width 640px, centred, starting 56px below the top bar (the taller circle zone needs the room). Title, pill, drop zone and privacy line all sit above the fold at 1440x900. There are no step tabs yet. The sample needs no file and no local model.

```
390 ──────────────────────────
 Lazarus 1-2-3
 Raise a Lotus
 1-2-3 file          (32px)
 WK1, WKS, WK3, dBase. Checked
 cell by cell.
 ╭──────────────────────────╮
 │  (circle 140px)          │
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

- **Verification sweep (F15).** When a raised file's sheet first appears, its formula cells light up one by one in verify order: ectoplasm green as each formula is re-derived and matches its remembered value, rose for a mismatch, slate for unverifiable (every WK3 formula). A cell before its turn is an unlit ghost (ghost ink, no marker). Meanwhile the totals count up from zero: the headline percent (denominator: the engine's formula count, so it climbs from 0.0%), the three counts, and the proof bar, which fills from empty. While it runs, lit cells keep their status tint; when it ends they settle to the normal look over `--dur-slow`. Schedule (`src/ui/model/sweep.ts`): `clamp(n × 15ms, 400ms, 2500ms)`, at most one step per 50ms (the 160-formula sample: 2.4s in 48 steps). It runs once per Sheet view, never again on a filter, sheet or drawer change, and a filter or sheet change ends it in its final state. It is presentation only: every cell's `aria-label` and the totals' screen-reader text carry the engine's figures from the first frame, and the end state is exactly `SheetVerification.totals`. Reduced motion, a DBF, or no formulas: no sweep, the final state at once. On a phone the totals still count; the status list shows real statuses at once.
- **The grid opens on the proof.** It starts scrolled just far enough to show the first formula column (`scrollLeft` 0 when that column already fits), once per sheet, never after the user scrolled. The sample's formulas live in columns N and O; without this the sweep would run off-screen.
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

- Durations are 150, 200 and 250ms only. The one longer motion is the verification sweep: one time, at most 2.5s, made of 250ms cell transitions in sequence. There are no loops: no flickering candle, no spinning circle and no pulsing ghosts.
- Allowed animations: button hover/press (fast), tab and filter change (base), drawer slide plus fade 16px (slow), ghost solidify (slow), circle turn and candle brighten on hover and drag-over (slow), glow bloom on drag-over (slow), the sweep (one cell lighting per step, slow), toast in/out (base).
- `prefers-reduced-motion: reduce` sets all durations to 0, skips the sweep (final state at once), and keeps the circle still. The glow stays as a static gradient and ghosts swap to solid instantly. The Sheet view has no running animation.

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
- [ ] Reduced motion is honoured. No content depends on animation: the sweep never hides a status from assistive tech (labels carry the real status from the first frame).
- [ ] The summoning circle is `aria-hidden` decoration; the drop zone's accessible name is its text.
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
