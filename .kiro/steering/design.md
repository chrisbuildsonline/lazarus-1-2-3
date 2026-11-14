---
inclusion: fileMatch
fileMatchPattern: "{src/ui/**,index.html,e2e/**,**/*.css}"
---

# Design: the seance

The look is current Dribbble dashboard work: calm, soft, spacious. It is never a generic admin kit and never a cartoon Halloween theme.

## Canvas and surfaces

- Canvas: soft neutral around `#eef0f4`.
- Content sits on white floating surfaces (cards, panels, the sheet grid).
- Corner radius 16 to 20px on surfaces. Smaller inner elements may use 10 to 12px.
- Soft, low-contrast shadow, wide blur, slight vertical offset, e.g. `0 12px 32px rgba(20, 24, 40, 0.08)`. No hard borders; use a hairline only where needed.
- Generous padding and whitespace. Avoid dense tables chrome.

## Colour

- Text and primary action: near-black (`#12141a`-ish).
- One accent colour, used sparingly (a pale spectral violet or ectoplasm green; choose one and keep it). It marks focus, selection and the candle glow only.
- Define colours as CSS variables in one tokens file. No ad hoc hex values in components.

## Type

- One clean sans (system or a bundled font; no remote fonts).
- Large titles and large numbers are the focal point: the matched count, the percentage verified, the cell value in detail view. Labels stay small and muted.
- Use tabular figures for numbers.

## Primary action

- One near-black pill button per view (e.g. "Raise this file", "Download XLSX"). Everything else is a quiet text or ghost button.

## Status pills

Short, tinted, pill-shaped, with text as well as colour (never colour alone):

- matched: soft green tint, "Matched"
- mismatched: soft red/rose tint, "Mismatched"
- unverifiable: soft amber or grey tint, "Unverifiable"

Use the same pills in the grid, the report, and the approval queue. Meet WCAG AA contrast.

## Halloween touches (restrained)

- Candle glow: a faint warm radial glow behind the drop zone or the primary number.
- Ghost cells: unverifiable or not-yet-raised cells render translucent, as if half-present, and solidify when verified.
- Small, quiet copy touches ("Raise", "Resurrected") are fine. No skulls, bats, drip fonts, or orange-and-black themes.

## Motion and accessibility

- Short, gentle transitions (150 to 250ms). Respect `prefers-reduced-motion`; glow and ghost fades become static.
- Keyboard reachable everywhere, visible focus ring in the accent colour, labelled controls.
- The approval queue must be fully operable by keyboard.
