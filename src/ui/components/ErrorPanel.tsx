// The inline error panel (DESIGN.md sections 3 and 5, requirements 21 and 22). A failed file and a
// failed worker are alerts with a danger pill; an unsupported file is not our failure, so it is calm.
import { COPY } from "../copy.ts";

export type ErrorPanelProps = {
  kind: "failed" | "unsupported" | "skipped" | "worker";
  /** The first reason, shown in body text. */
  reason?: string;
  /** Diagnostics, one per line. */
  lines: readonly string[];
  onCopy?: (text: string) => void;
};

const EXTENSIONS = [".wk1", ".wks"];

export function ErrorPanel({ kind, reason, lines, onCopy }: ErrorPanelProps) {
  // Skipped before reading (too large, unreadable): calm, and the lines say why, as in a batch.
  if (kind === "skipped") {
    const [title, ...rest] = lines;
    return (
      <section className="surface panel">
        <h2 className="panel__title">{title}</h2>
        {rest.map((l) => (
          <p key={l} className="panel__reason">
            {l}
          </p>
        ))}
      </section>
    );
  }
  if (kind === "unsupported") {
    return (
      <section className="surface panel">
        <h2 className="panel__title">{COPY.unsupportedTitle}</h2>
        <p className="panel__reason">
          {COPY.acceptedExtensions}:{" "}
          {EXTENSIONS.map((e) => (
            <code key={e} className="chip">
              {e}
            </code>
          ))}
        </p>
      </section>
    );
  }
  return (
    <section className="surface panel panel--danger" role="alert">
      <div className="panel__head">
        <h2 className="panel__title">{kind === "failed" ? COPY.parseFailure : COPY.workerTitle}</h2>
        <span className="pill pill--danger">
          <span className="pill__glyph glyph--cross" aria-hidden="true" />
          {COPY.couldNotRaisePill}
        </span>
      </div>
      {reason && <p className="panel__reason">{reason}</p>}
      {lines.length > 0 && (
        <pre className="mono-block">
          {lines.map((l, i) => (
            <span key={i} className="mono-block__line">
              {l}
            </span>
          ))}
        </pre>
      )}
      <button type="button" className="btn-text" onClick={() => onCopy?.(lines.join("\n"))}>
        {COPY.copyDiagnostics}
      </button>
    </section>
  );
}
