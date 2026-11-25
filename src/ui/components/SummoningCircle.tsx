// The summoning circle the file is dropped into (DESIGN.md section 3 "Drop zone"; seance-visuals
// requirements 10 to 15). Pure decoration: aria-hidden, nothing focusable, no text in the accessible
// name. Two violet rings, a ring of Lotus @functions as runes, five candles, a spreadsheet lattice in
// the inner circle and the file glyph at its centre. Colours come from app.css classes (tokens only).
import { useId } from "react";
import { RUNES } from "../model/runes.ts";

const C = 120;
const RUNE_R = 98;
const CANDLE_R = 112;
const INNER_R = 84;
const CANDLES = [0, 72, 144, 216, 288];
/** Lattice lines of the inner circle: a spreadsheet seen through the ring. */
const LATTICE = [-56, -28, 0, 28, 56];
const runeText = `${RUNES.join(" · ")} · `;

export function SummoningCircle() {
  const id = useId();
  const path = `${id}runes`;
  const glow = `${id}glow`;
  const clip = `${id}clip`;
  const aura = `${id}aura`;
  return (
    <svg className="summoning-circle" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={glow}>
          <stop offset="0" className="circle__stop circle__stop--core" />
          <stop offset="0.35" className="circle__stop circle__stop--warm" />
          <stop offset="1" className="circle__stop circle__stop--edge" />
        </radialGradient>
        <radialGradient id={aura}>
          <stop offset="0" className="circle__stop circle__stop--aura" />
          <stop offset="1" className="circle__stop circle__stop--edge-aura" />
        </radialGradient>
        <path id={path} d={`M ${C} ${C - RUNE_R} a ${RUNE_R} ${RUNE_R} 0 1 1 0 ${2 * RUNE_R} a ${RUNE_R} ${RUNE_R} 0 1 1 0 ${-2 * RUNE_R}`} />
        <clipPath id={clip}>
          <circle cx={C} cy={C} r={INNER_R} />
        </clipPath>
      </defs>
      <circle className="circle__aura" cx={C} cy={C} r={INNER_R} fill={`url(#${aura})`} />
      <g className="circle__lattice" clipPath={`url(#${clip})`}>
        {LATTICE.map((d) => (
          <path key={d} d={`M ${C + d} ${C - INNER_R} V ${C + INNER_R} M ${C - INNER_R} ${C + d} H ${C + INNER_R}`} />
        ))}
      </g>
      <circle className="circle__ring circle__ring--outer" cx={C} cy={C} r={CANDLE_R} />
      <circle className="circle__ring circle__ring--inner" cx={C} cy={C} r={INNER_R} />
      <g className="circle__runes">
        <text className="circle__rune-text">
          <textPath href={`#${path}`} textLength={Math.floor(2 * Math.PI * RUNE_R)} lengthAdjust="spacing">
            {runeText}
          </textPath>
        </text>
      </g>
      {CANDLES.map((angle) => (
        <g className="circle__candle" key={angle} transform={`rotate(${angle} ${C} ${C})`}>
          <circle className="circle__candle-glow" cx={C} cy={C - CANDLE_R} r="22" fill={`url(#${glow})`} />
          <circle className="circle__flame" cx={C} cy={C - CANDLE_R} r="3" />
        </g>
      ))}
      <circle className="circle__core" cx={C} cy={C} r="30" />
      <g className="circle__glyph">
        <g transform={`translate(${C - 18} ${C - 18}) scale(1.5)`} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M12 17v-6M9.5 13.5 12 11l2.5 2.5" />
        </g>
      </g>
    </svg>
  );
}
