# Requirements: Seance visuals (F15)

Feature F15 changes how the browser app looks and moves. It adds three things: a dark seance palette as the default theme, a summoning circle around the drop zone, and a verification sweep on the Sheet view. It changes no parser, engine, XLSX or report logic, and no verification result.

Terms. **Seance palette**: the dark tokens of design.md "Tokens". **Paper palette**: the light tokens kept for the downloadable HTML report. **Sweep**: the one-shot presentation in which formula cells light up and the totals count up. **Verify order**: the order of `SheetVerification.cells`. **Engine totals**: `SheetVerification.totals`. **Reduced motion**: `prefers-reduced-motion: reduce`.

## Theme

1. The app SHALL render with the seance palette by default, with no toggle and no switch on `prefers-color-scheme`. The computed `background-color` of `body` SHALL be `rgb(13, 11, 20)` (`#0d0b14`).
2. The seance palette SHALL use these values: canvas `#0d0b14`, surface `#17141f`, sunken `#211d2c`, text `#efeaf6`, muted text `#a59fb7`, accent ring `#9d8cff`, accent ink `#b9adff`, accent soft fill `#2a2448`.
3. The one primary pill per view SHALL have candle wax `#f4e9d4` as its fill, dark ink `#15111c` as its text, and a warm candle glow as its shadow. The rule "exactly one primary pill per view" SHALL stay.
4. The status colours SHALL be: Matched mark `#4fe39a`, pill text `#86f0b4` on `#11291f`; Mismatched mark `#ff6b86`, pill text `#ffa3b5` on `#3a1622`; Unverifiable mark `#8f89a3`, pill text `#bdb7cc` on `#25222f`. The status pill SHALL keep its text and its shape glyph, so colour is never the only signal.
5. Every text pair of the seance palette listed in design.md "Contrast pairs" SHALL have a WCAG 2.x contrast ratio of at least 4.5. Every graphic pair and every focus-ring pair listed there SHALL have at least 3.0. A unit test SHALL compute the ratios from `src/ui/tokens.css` and fail below these limits.
6. `design/DESIGN.md` section 2 SHALL list the computed ratio of every pair of design.md "Contrast pairs", to two decimals, taken from the output of that test and not from memory.
7. The downloadable HTML report SHALL keep a light paper palette. Section 2 of `design/DESIGN.md` SHALL hold a second css block, the paper block, with the same token names for every colour, ghost and shadow token of the seance block. `TOKENS` in `src/report/tokens.ts` SHALL equal the paper block for those names and the seance block for all other names. The report HTML SHALL contain none of the seance canvas, surface or text values.
8. WHEN the paper block is the only thing that differs from the seance block for a name, THE tokens test SHALL still require the same set of names in both blocks.
9. Components and CSS SHALL use tokens only. The existing token-only CSS test SHALL pass unchanged in its rules (no colour literal, no literal duration, no `infinite`, no `!important`).

## Summoning-circle drop zone

10. The drop zone SHALL show a summoning circle made of: two thin rings in the accent ring colour, a ring of Lotus 1-2-3 function names set as runes (at least 8 names, each starting with `@`, for example `@SUM`, `@IF`, `@VLOOKUP`, `@NPV`, `@PMT`, `@ROUND`, `@DATE`, `@CHOOSE`), five candle points with a warm glow, and the file glyph in the centre. The file is drawn into the circle: the glyph sits in the centre and rises by at most 4px on drag-over.
11. The drop zone SHALL stay one `<button>` that opens the file picker. Its accessible name SHALL be the same as before F15. The circle SHALL be decoration: the `<svg>` SHALL be `aria-hidden="true"`, hold no focusable element, and add nothing to the accessible name.
12. The drop zone SHALL keep accepting a drop (single file, several files, folder), the file picker, the folder picker, and Enter and Space on the button. No existing behaviour test of these SHALL change.
13. WHEN the pointer hovers the drop zone, OR a drag carrying files is over it, THE candles SHALL brighten and the rune ring SHALL turn by at most 12 degrees. Both changes SHALL be one-shot transitions of `--dur-slow`, with no animation that loops and no flicker.
14. WHILE reduced motion is on, THE rune ring SHALL NOT turn and the glyph SHALL NOT move. The candles MAY change brightness at once.
15. Rune and ring colours SHALL be solid token colours, with no opacity on rune text, so that their contrast stays measurable. The runes SHALL be SVG text in the system font. No remote font, image or script SHALL load.
16. At 1440x900 the Summon view SHALL still show the `h1`, the primary pill, the drop zone and the privacy line inside the viewport. At 390x844 it SHALL have no sideways scroll.

## Verification sweep

17. WHEN a raised file's sheet is shown for the first time, THE Sheet view SHALL run the sweep once for that sheet. It SHALL NOT run again for the same sheet on a later tab switch, filter change, drawer open or re-render.
18. During the sweep, formula cells SHALL light up one by one in verify order. A cell lights green when its status is Matched, rose when Mismatched and grey when Unverifiable (for example every WK3 formula). Before its turn a formula cell SHALL show as an unlit ghost with no status marker.
19. During the sweep, the totals (headline percent, the three counts, the proof bar) SHALL count up from zero. Every shown count SHALL equal the number of lit cells of that status. The headline denominator SHALL be the engine's formula count, so the headline climbs from `0.0%`. No shown figure SHALL ever decrease.
20. When the sweep ends, the totals SHALL be exactly `SheetVerification.totals`, and every formula cell SHALL show its real status.
21. The sweep SHALL be presentation only. It SHALL NOT change a `SheetVerification` value, a downloaded XLSX byte, the JSON or HTML report, a drawer value, or an approval-queue item. The `aria-label` of every cell SHALL carry the real status from the first frame, lit or not. The screen-reader text of the totals SHALL carry the engine totals from the first frame, and the counting figures SHALL be `aria-hidden` while they count.
22. The sweep SHALL end no later than 2.5 seconds after it starts, whatever the formula count. The schedule SHALL show at most one new step per 50 ms.
23. WHILE reduced motion is on, THE Sheet view SHALL NOT run the sweep. It SHALL show the final state at once and have no running CSS or Web animation.
24. WHEN the user acts during the sweep (scrolls, moves focus, presses a key, opens a cell, changes filter, sheet or file, or summons again), THE app SHALL respond at once. A filter, sheet or file change SHALL end the sweep in its final state.
25. WHEN the sheet has no formulas, OR is a DBF table, THE sweep SHALL NOT run. On a phone, where the status list replaces the grid, the totals SHALL still count up and the list SHALL show real statuses at once.
26. The grid SHALL open scrolled just far enough to show the first formula column: `scrollLeft` is 0 when that column already fits, and otherwise the least value that brings its right edge into view. This applies once per sheet, also under reduced motion, and never after the user scrolled.
27. WHEN the Sheet view unmounts or the file changes, THE sweep SHALL cancel its frame request and leave no timer or listener behind.

## Tests and limits

28. Tests SHALL come first (red, then green). Unit tests SHALL cover the sweep schedule and partial totals: monotonic, last step equal to the engine totals, input never mutated. Playwright SHALL cover: the default dark theme, the circle and the three drop paths, the sweep on the sample, reduced motion, and axe at 1440 and 390.
29. Axe SHALL report no `serious` or `critical` violation on any view at 1440 and 390, in the dark theme, with no rule disabled.
30. F15 SHALL NOT change `src/parser`, `src/formula`, `src/verify`, `src/xlsx`, `src/macro`, `fixtures/` or `mcp/`. It SHALL NOT add a dependency, a network request, storage, sound or a looping animation.
