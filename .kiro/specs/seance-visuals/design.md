# Design: Seance visuals (F15)

Requirement numbers refer to requirements.md. Existing names (`Grid`, `TotalsSurface`, `ProofBar`, `headline`, `proofSegments`, `LAYOUT`, `SheetVerification`) are from the code as it stands.

## 1. Tokens

`src/ui/tokens.css` stays a copy of the first css block of `design/DESIGN.md` section 2. That block becomes the seance palette. Only values change, plus one new name, `--candle-warm`. Radius, spacing, type, layering and motion tokens are unchanged.

```css
:root {
  color-scheme: dark;
  --canvas: #0d0b14;
  --surface: #17141f;
  --surface-sunken: #211d2c;
  --text: #efeaf6;
  --text-muted: #a59fb7;
  --hairline: #2d2839;              /* decorative grid lines, exempt from contrast */
  --on-primary: #15111c;            /* dark ink on the wax pill */
  --primary: #f4e9d4;               /* candle wax */
  --primary-hover: #fff4de;
  --accent: #9d8cff;                /* ring, selection edge, rings of the circle */
  --accent-ink: #b9adff;
  --accent-soft: #2a2448;
  --accent-glow: rgba(157, 140, 255, 0.22);
  --candle-core: rgba(255, 236, 200, 0.9);
  --candle-warm: rgba(244, 200, 120, 0.32);   /* new: glow of candles and of the primary pill */
  --status-matched-bg: #11291f;   --status-matched-fg: #86f0b4;   --status-matched-mark: #4fe39a;
  --status-mismatched-bg: #3a1622; --status-mismatched-fg: #ffa3b5; --status-mismatched-mark: #ff6b86;
  --status-unverifiable-bg: #25222f; --status-unverifiable-fg: #bdb7cc; --status-unverifiable-mark: #8f89a3;
  --danger: #ffa3b5;
  --danger-soft: #3a1622;
  --ghost-ink: #a59fb7;
  --ghost-fill: rgba(239, 234, 246, 0.08);
  --shadow-surface: 0 12px 32px rgba(0, 0, 0, 0.45), 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-raised: 0 24px 64px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.35);
  --shadow-primary: 0 6px 24px var(--candle-warm), 0 1px 2px rgba(0, 0, 0, 0.4);
  /* everything else as in DESIGN.md today */
}
```

The `--focus-ring` formula is unchanged (`2px var(--surface)` gap, then `2px var(--accent)`), so every focus ring is a violet ring next to a violet-black gap.

**Paper block.** A second css block follows in section 2, under the heading "Paper palette (HTML report)". It lists every colour, ghost and shadow token of the seance block (the same names, as a set) with the light values that DESIGN.md has today (`--canvas: #eef0f4` and so on). Radius, spacing and type are not repeated. The report page cannot use the dark palette: people print it, and browsers drop dark backgrounds when printing, which would leave pale text on white paper.

`src/report/tokens.ts` keeps its values, which are the paper values. Its test changes to: for names in the paper block, equal to the paper block; for all other names, equal to the seance block.

### Contrast pairs

All ratios are computed in a unit test with the WCAG 2.x relative luminance formula. Text pairs need 4.5. Graphic pairs and focus-ring pairs need 3.0.

| Group | Pairs (foreground on background) |
|---|---|
| Text | `--text` on canvas, surface, sunken, accent-soft, mismatched bg, matched bg |
| Text | `--text-muted` on canvas, surface, sunken, accent-soft, mismatched bg, matched bg |
| Text | `--on-primary` on `--primary` |
| Text | `--accent-ink` on canvas, surface, sunken, accent-soft |
| Text | the three status pill texts on their pill backgrounds |
| Text | `--danger` on surface and on `--danger-soft` |
| Text | `--ghost-ink` on surface and sunken |
| Graphic | the three status marks on canvas, surface, sunken, and on their own pill background |
| Graphic | `--accent` (rings of the circle, selection edge) on canvas, surface, sunken |
| Focus ring | `--accent` on canvas, surface, sunken, accent-soft, matched bg, mismatched bg |

The pair "accent on primary" is not listed: the focus ring is drawn with a 2px surface gap, so it never touches the wax pill. A rough hand check of the new values (not a replacement for the test) puts every text pair above 5 and every graphic pair above 4.9. The exact two-decimal figures come from the test output (requirement 6), and the pipeline that produced the old table (`bun -e`) is replaced by the test's own computation.

## 2. Dark theme pass

- `index.html` gets `<meta name="color-scheme" content="dark">` so the page does not flash white before the CSS loads. The CSP is unchanged.
- `app.css` already uses tokens only. The pass is about places that assumed light: the grid header, selected-cell fill, ghost cell effect (the unlit and unverifiable ghost uses `--ghost-ink` and `--ghost-fill`, never opacity on a real value), the proof bar track (`--ghost-fill`), toast and drawer shadows, and scrim. The scrim rgba value moves into a token, `--scrim`, only if the css-tokens test flags it; otherwise it is left.
- Where something still looks white (an `<input>` for the hidden file picker is hidden, so none is expected), fix it with a token, never a literal.

## 3. Summoning circle

New file `src/ui/components/SummoningCircle.tsx`, used only by `DropZone.tsx`. It renders one `<svg class="summoning-circle" viewBox="0 0 240 240" aria-hidden="true" focusable="false">`:

- Two rings: `<circle class="circle__ring circle__ring--outer" r="112">` and `--inner r="84"`. Stroke `var(--accent)`, width 1, no fill.
- Rune ring: `<g class="circle__runes">` with a `<path id>` circle of radius 98 and one `<text><textPath>` with the function names joined by a thin separator: `@SUM · @IF · @VLOOKUP · @NPV · @PMT · @ROUND · @DATE · @CHOOSE · @AVG · @COUNT`. The names are a constant `RUNES` in `src/ui/model/runes.ts` (pure, tested for count and the `@` prefix). Fill `var(--text-muted)`, font `var(--font-sans)` through a class, font size from a custom property. The `id` is made with `useId`.
- Five candles: `<g class="circle__candle">` at angles 0, 72, 144, 216, 288 degrees on radius 112. Each has a glow `<circle>` (radial gradient from `--candle-core` to transparent, via `fill` on a `<radialGradient>` whose stops use `stop-color: var(--candle-warm)` in CSS) and a small flame point.
- Centre: the existing file glyph, moved into the svg (24px, scaled to 40px) so it sits inside the rings.

Gradients and `stop-color` are set through classes in `app.css`, so no colour literal appears in the markup. The drop zone button keeps its children text: the circle sits above the copy inside the button, and `SummoningCircle` adds no text to the accessible name because the whole svg is `aria-hidden`.

Motion, all in `app.css`:

- Idle: static.
- `.dropzone:hover` and `.dropzone-wrap.is-over`: `.circle__candle` glow opacity `0.55 -> 1`, `transition: opacity var(--dur-slow) var(--ease-out)`; `.circle__runes` `transform: rotate(10deg)` with `transition: transform var(--dur-slow) var(--ease-out)`; rune fill moves to `--accent-ink`; the glyph `translateY(-4px)` only on `.is-over`.
- Under `@media (prefers-reduced-motion: reduce)`: `transform: none` for runes and glyph; the candle opacity change stays (it is not motion).
- No `animation`, no `infinite`, no `@keyframes` for the circle.

Size: 220px square on desktop and 140px on phone (`LAYOUT`-style constants in CSS custom properties built from tokens are not needed; the sizes are in the css-tokens test's allowed list update). The drop zone's min-height rises to fit the circle plus one line of copy: 320px desktop, 240px phone. If the Summon layout test (above the fold at 1440x900) fails, the title block spacing shrinks first, and the circle shrinks to 200px second.

## 4. Verification sweep

### Pure model: `src/ui/model/sweep.ts`

```ts
export const SWEEP = { maxMs: 2500, frameMs: 50, minMs: 400, perCellMs: 15 } as const;

export type SweepPlan = {
  durationMs: number;        // clamp(n * perCellMs, minMs, maxMs); 0 when n === 0
  steps: number;             // min(n, floor(durationMs / frameMs)); 0 when n === 0
  rank: ReadonlyMap<string, number>;  // address -> index in verify order
};

export function planSweep(cells: readonly CellResult[]): SweepPlan;
/** Number of cells lit at time t (ms since start), 0 .. n. Monotonic in t, n at t >= durationMs. */
export function litAt(plan: SweepPlan, n: number, t: number): number;
/** Totals of the first `lit` cells in verify order. `formulas` is the engine's value. At lit === n it returns the engine totals object's values. */
export function partialTotals(cells: readonly CellResult[], engine: Totals, lit: number): Totals;
/** scrollLeft that shows the first formula column: 0 if it fits, else the least value that shows its right edge. */
export function initialScrollLeft(firstFormulaCol: number | null, colWidth: number, bodyWidth: number): number;
```

Rules:

- Pure. No React, no DOM, no clock. `cells` and `engine` are never mutated (the tests freeze them).
- `litAt` uses `steps`: lit is `ceil(n * min(k, steps) / steps)` where `k = floor(t / frameMs)` clamped to `steps`. So at most one new step per `frameMs` and `lit` is `n` once `t >= durationMs`.
- `partialTotals` counts statuses among the first `lit` cells. For `lit >= n` it returns the engine totals field by field (not a recount), so the final figures are the engine's even if a cell list were ever inconsistent with them. `formulas` always equals the engine's `formulas`.
- 160 cells (the sample) give `durationMs` 2400 and 48 steps.

`proofSegments(totals)` normalises by the sum of the counts, so mid-sweep it would draw a full bar. The sweep view therefore does not pass partial totals to `proofSegments` directly. A new function `sweepSegments(partial, engine)` in `sweep.ts` returns the same segment list with each fraction taken over `engine.formulas`, so the bar fills from empty to the final proportions; at the end it equals `proofSegments(engine)` (tested). Existing `proofSegments` and `headline` are not changed. `headline(partial)` is used with the engine's `formulas` as the denominator, so the figure climbs from `0.0%` and a partial figure never rounds up to `100.0%`.

### Hook: `src/ui/hooks/useSweep.ts`

`useSweep({ key, cells, engine, enabled })` returns `{ lit, running, partial }`.

- `key` is `${fileId}:${sheetIndex}`. A module-level `Set<string>` is not used; the hook keeps a `useRef<Set<string>>` of keys already swept, in `SheetView`, so a re-render or a tab back never restarts it (requirement 17). It is cleared when the app resets.
- `enabled` is false when reduced motion is on (existing `useMatchMedia`), the sheet is a DBF, or `engine.formulas === 0`. When not enabled, `lit` is `n` and `running` is false from the first render.
- Otherwise it drives one `requestAnimationFrame` loop. Each frame: `t = performance.now() - start`, `lit = litAt(plan, n, t)`, and state is set only when `lit` changes (at most 48 times for the sample). It stops at `lit === n`. Cleanup cancels the frame (requirement 27).
- A filter, sheet or file change makes `enabled` false for that key, so the next render is the final state (requirement 24).

### Wiring

- `SheetView.tsx`: calls `useSweep` for the current sheet, passes `lit` and `plan.rank` to `Grid`, and `partial`, `engine` and `running` to `TotalsSurface`. On a phone the status list ignores `lit` (requirement 25) and the totals still count.
- `Grid.tsx`: new optional props `sweep?: { lit: number; rank: ReadonlyMap<string, number> }`. For a formula cell with `rank >= lit` it adds the class `cell--unlit` and `data-sweep="unlit"` and suppresses the status class and marker; for the others it renders as today and adds `data-sweep="lit"`. The cell's `aria-label` is built from the real status, as now. The grid root gets `data-sweep="running" | "done"` and `data-lit` (the lit count). Without the `sweep` prop (all other callers and tests) nothing changes.
- First-column scroll: `Grid` gets `firstFormulaCol?: number`. In its existing layout effect, on first measurement of a new `label`/model, if the user has not scrolled (`scrollLeft === 0` and no key moved), it sets `el.scrollLeft = initialScrollLeft(firstFormulaCol, LAYOUT.colWidth, bodyWidth)` and updates its scroll state. `firstFormulaCol` is `Math.min(...model.formulaCells.map(c => c.col))`, or null.
- `TotalsSurface.tsx`: new optional props `partial?: Totals` and `running?: boolean`. While `running`, the visible figures and the headline come from `partial`, wrapped in `aria-hidden="true"`; a `visually-hidden` span carries the engine figures from the first frame; the proof bar uses `sweepSegments` and keeps its `aria-label` from the engine totals (`describeTotals(engine)`). When not running, the markup is exactly what it is today.
- CSS: `.cell--unlit` is the ghost style (`--ghost-ink` text, `--ghost-fill` marker bar, no status colour). Lighting is a `transition` on the marker and background colours of `--dur-slow` (no keyframes), so at most the cells lit in the last 250 ms are animating. Under reduced motion the durations are 0 and the sweep never runs anyway.

### Why this is safe

Status, value, text and label of every cell come from the same model as before. The sweep only decides how many of the first `n` cells display their status yet. A single test (task 4) reads the engine's status of every cell from `verifyBytes` and compares it with the cell's class after the sweep.

## 5. Tests

| Test | File |
|---|---|
| Palette values, pairs and ratios, paper block names and values | `tests/unit/ui/tokens-css.test.ts`, `tests/unit/report/tokens.test.ts` |
| Runes constant | `tests/unit/ui/model/runes.test.ts` |
| Sweep plan, litAt, partialTotals, sweepSegments, initialScrollLeft (with fast-check) | `tests/unit/ui/model/sweep.test.ts` |
| Circle markup, button name, `aria-hidden`, sweep markup without and with the prop | `tests/unit/ui/components/summoning-circle.test.tsx`, `grid.test.tsx`, `totals-surface.test.tsx` |
| Dark default, circle, drop, pick, keys | `e2e/seance-visuals-theme.spec.ts`, `e2e/seance-visuals-circle.spec.ts` |
| Sweep on the sample, reduced motion | `e2e/seance-visuals-sweep.spec.ts` |
| Axe at 1440 and 390 on Summon, Sheet, drawer, phone dialog, batch | `e2e/seance-a11y.spec.ts` (extended) |

Expected values come from `golden.json`, `fixtures/manifest.json` or `verifyBytes`, never from the UI output.

## 6. Risks

- **Tests that assert light values.** Any existing test or e2e check with a light hex must be found by running the suite after task 1 and changed to read the token. Tasks 1 and 2 list what changed in `evidence.md`.
- **Virtualised grid.** Only mounted cells have a class, so the sweep e2e checks `data-lit` on the grid root for the count of 160, and checks classes of the mounted cells against the engine.
- **Timing flake.** The e2e never asserts a time between frames. It samples the totals text and asserts monotonic non-decreasing values, a final value equal to the engine, and an end within 3.5 seconds of the first sample (2.5 s plus headroom).
- **Axe and SVG text.** The runes are in an `aria-hidden` svg, and they still use `--text-muted`, which passes 4.5 on every surface.
- **Print.** Only the report is printed. The app is not given a print stylesheet.
