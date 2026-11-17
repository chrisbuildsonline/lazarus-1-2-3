// The progress surface (DESIGN.md section 5, requirement 19): the file name, the two stages the worker
// can observe, a 4px accent bar that moves by stages (0, 50, 100 per file), and a polite live region.
import { COPY } from "../copy.ts";

export type ProgressPhase = "queued" | "reading" | "checking" | "raised";

const STAGES = [COPY.stages.read, COPY.stages.check] as const;
const DONE: Record<ProgressPhase, number> = { queued: 0, reading: 0, checking: 0.5, raised: 1 };

export function ProgressSurface({ name, phase, index, count }: { name: string; phase: ProgressPhase; index: number; count: number }) {
  const current = phase === "checking" || phase === "raised" ? 1 : 0;
  const fraction = Math.min(1, (index + DONE[phase]) / Math.max(1, count));
  const value = Math.floor(fraction * 100);
  return (
    <section className="surface progress" aria-label={name}>
      <div className="progress__head">
        <p className="progress__name">{name}</p>
        {count > 1 && <p className="progress__count">{COPY.batchProgress(index + 1, count)}</p>}
      </div>
      <ol className="progress__stages">
        {STAGES.map((s, i) => (
          <li key={s} className={i === current ? "progress__stage is-current" : "progress__stage"} aria-current={i === current ? "step" : undefined}>
            {s}
          </li>
        ))}
      </ol>
      <div className="progress__bar" role="progressbar" aria-label={name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <span className="progress__fill" style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <p className="visually-hidden" aria-live="polite">
        {`${STAGES[current]}: ${name}`}
      </p>
    </section>
  );
}
