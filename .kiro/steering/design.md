---
inclusion: fileMatch
fileMatchPattern: "{src/ui/**,index.html,e2e/**,**/*.css}"
---

# Design: the seance

The look is a calm, soft, spacious dark dashboard, lit by candles. It is never a generic admin kit and never a cartoon Halloween theme. The exact tokens, contrast ratios and layouts are in `design/DESIGN.md`; the F15 spec is `.kiro/specs/seance-visuals/`.

## Canvas and surfaces

- Dark by default, with no toggle and no switch on `prefers-color-scheme`. Canvas: violet-black `#0d0b14`. Surfaces: `#17141f`. Sunken inset areas (code blocks, inner rows): `#211d2c`.
- Content sits on floating surfaces (cards, panels, the sheet grid).
- Corner radius 16 to 20px on surfaces. Smaller inner elements may use 10 to 12px.
- Soft shadows with a wide blur and a slight vertical offset, in near-black with enough alpha to read on the dark canvas. No hard borders; use a hairline only where needed.
- Generous padding and whitespace. Avoid dense table chrome.
- The downloadable HTML report is the exception: it keeps a light paper palette, because it gets printed and browsers drop dark backgrounds when printing. It uses the same token names, with the paper block of DESIGN.md section 2.

## Colour

- Text: bone `#efeaf6`. Muted text: `#a59fb7`.
- Primary action: candle wax `#f4e9d4` with dark ink `#15111c` and a warm candle glow as its shadow.
- One accent, spectral violet: ring `#9d8cff`, ink `#b9adff`, soft fill `#2a2448`. It marks focus, selection, the rings of the summoning circle and the candle glow only.
- Status: Matched is ectoplasm green (mark `#4fe39a`, pill `#86f0b4` on `#11291f`). Mismatched is rose (mark `#ff6b86`, pill `#ffa3b5` on `#3a1622`). Unverifiable is slate (mark `#8f89a3`, pill `#bdb7cc` on `#25222f`).
- Every text pair meets WCAG AA 4.5. Every graphic and focus ring meets 3.0. The computed ratios are listed in DESIGN.md and checked by a unit test. Do not change a token without recomputing.
- Define colours as CSS variables in one tokens file. No ad hoc hex values in components.

## Type

- One clean sans (system or a bundled font; no remote fonts).
- Large titles and large numbers are the focal point: the matched count, the percentage verified, the cell value in detail view. Labels stay small and muted.
- Use tabular figures for numbers.

## Primary action

- One candle-wax pill button per view (e.g. "Raise this file", "Download XLSX"). Everything else is a quiet text or ghost button.

## Status pills

Short, tinted, pill-shaped, with text and a shape glyph as well as colour (never colour alone):

- matched: ectoplasm green tint, "Matched"
- mismatched: rose tint, "Mismatched"
- unverifiable: slate tint, "Unverifiable"

Use the same pills in the grid, the report, and the approval queue.

## Seance touches (restrained)

- Candle glow: a faint warm radial glow behind the drop zone, the candles of the summoning circle, and the primary pill.
- Summoning circle: the drop zone shows two thin violet rings, a ring of Lotus 1-2-3 function names as runes (`@SUM`, `@IF`, `@VLOOKUP`, ...), five candle points and the file glyph in the centre. It is decoration (`aria-hidden`), and the drop zone stays one button with the same accessible name. Hover and drag-over brighten the candles and turn the rune ring by a few degrees, once. Runes and rings use solid token colours so their contrast stays measurable.
- Ghost cells: unverifiable or not-yet-raised cells render as ghosts (muted ink, dotted underline, marker bar) and solidify when verified. Ghost effects never put opacity on a real value.
- Verification sweep: when a raised file first appears, formula cells light up one by one in verify order (green matched, rose mismatched, grey unverifiable) while the totals count up from zero to the engine's numbers. It is presentation only: cell labels carry the real status from the first frame, it ends with totals equal to the engine totals, it lasts at most about 2.5 seconds, and it never repeats for the same sheet. The grid opens scrolled just far enough to show the first formula column.
- Small, quiet copy touches ("Raise", "Resurrected") are fine. No skulls, bats, drip fonts, or orange-and-black themes.

## Motion and accessibility

- Short, gentle transitions (150 to 250ms). The sweep is the one longer motion (at most 2.5 s, one time). No animation loops, no flicker, no pulsing.
- Respect `prefers-reduced-motion`: no sweep (the final state at once), no turning runes, no moving glyph, no running animation on the Sheet view. Candle brightness may change at once.
- Keyboard reachable everywhere, visible focus ring in the accent colour (2px gap in the surface colour, then 2px of accent), labelled controls.
- The approval queue must be fully operable by keyboard.
- Axe stays at zero serious or critical findings in the dark theme at 1440 and 390, with no rule disabled.
