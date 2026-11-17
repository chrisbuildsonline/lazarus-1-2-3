// The drop zone: one button on a surface with the candle glow behind it (DESIGN.md section 3,
// requirements 6 and 13). The drop handler passes the DataTransfer on synchronously, so the caller
// can read every entry before its first await (requirement 8).
import { useRef, useState, type DragEvent } from "react";
import { COPY } from "../copy.ts";

const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

export function DropZone({ onActivate, onDrop }: { onActivate: () => void; onDrop: (dt: DataTransfer) => void }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const leave = () => {
    depth.current = 0;
    setOver(false);
  };
  return (
    <div className={over ? "dropzone-wrap is-over" : "dropzone-wrap"}>
      <button
        type="button"
        className="dropzone"
        onClick={onActivate}
        onDragEnter={(e) => {
          if (!carriesFiles(e)) return;
          e.preventDefault();
          depth.current++;
          setOver(true);
        }}
        onDragOver={(e) => {
          if (!carriesFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          leave();
          onDrop(e.dataTransfer);
        }}
      >
        <svg className="dropzone__glyph" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M12 17v-6M9.5 13.5 12 11l2.5 2.5" />
        </svg>
        <span className="dropzone__text dropzone__text--wide">{COPY.dropZone}</span>
        <span className="dropzone__text dropzone__text--narrow">{COPY.dropZonePhone}</span>
        <span className="dropzone__hint">{COPY.dropZoneHint}</span>
      </button>
    </div>
  );
}
