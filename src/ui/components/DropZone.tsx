// The drop zone: one button on a surface with the candle glow behind it and the summoning circle the
// file is dropped into (DESIGN.md section 3, requirements 6 and 13; seance-visuals 10 to 16). The drop handler passes the DataTransfer on synchronously, so the caller
// can read every entry before its first await (requirement 8).
import { useRef, useState, type DragEvent } from "react";
import { COPY } from "../copy.ts";
import { SummoningCircle } from "./SummoningCircle.tsx";

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
          // The page's own window listener would summon the same drop a second time.
          e.stopPropagation();
          leave();
          onDrop(e.dataTransfer);
        }}
      >
        <SummoningCircle />
        <span className="dropzone__text dropzone__text--wide">{COPY.dropZone}</span>
        <span className="dropzone__text dropzone__text--narrow">{COPY.dropZonePhone}</span>
        <span className="dropzone__hint">{COPY.dropZoneHint}</span>
      </button>
    </div>
  );
}
