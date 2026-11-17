// The Summon view (DESIGN.md 4.1, requirements 4 to 7 and 15): title, subtitle, the one primary pill,
// the drop zone with its two pickers, the privacy and limits lines. A failed or unsupported file
// changes the pill; the panel sits above the drop zone, and a busy surface replaces it.
import { useRef, type ChangeEvent, type ReactNode } from "react";
import { COPY } from "../copy.ts";
import { DropZone } from "./DropZone.tsx";

export type SummonMode = "idle" | "failed" | "unsupported";

export type SummonViewProps = {
  mode: SummonMode;
  folderSupported: boolean;
  /** Progress surface; replaces the drop zone while a summon runs. */
  busy?: ReactNode;
  /** Error or unsupported panel. */
  panel?: ReactNode;
  onSample: () => void;
  onFiles?: (files: FileList, from: "files" | "folder") => void;
  onDrop?: (dt: DataTransfer) => void;
};

const PRIMARY: Record<SummonMode, string> = { idle: COPY.summonPrimary, failed: COPY.tryAnother, unsupported: COPY.chooseAnother };

/** React has no typed prop for it; rendered as the plain attribute. */
const FOLDER_ATTRS = { webkitdirectory: "" } as Record<string, string>;

export function SummonView({ mode, folderSupported, busy, panel, onSample, onFiles, onDrop }: SummonViewProps) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const pickFiles = () => files.current?.click();
  const picked = (from: "files" | "folder") => (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.currentTarget.files;
    if (list && list.length > 0) onFiles?.(list, from);
    e.currentTarget.value = "";
  };
  return (
    <main className="summon">
      <div className="summon__head">
        <h1 className="title title--summon" tabIndex={-1}>
          {COPY.summonTitle}
        </h1>
        <p className="summon__subtitle">{COPY.summonSubtitle}</p>
      </div>
      <button type="button" className="btn-primary primary-sticky summon__primary" onClick={mode === "idle" ? onSample : pickFiles}>
        {PRIMARY[mode]}
      </button>
      {panel}
      {busy ?? (
        <div className="summon__drop">
          <DropZone onActivate={pickFiles} onDrop={(dt) => onDrop?.(dt)} />
          <div className="summon__pickers">
            <button type="button" className="btn-text" onClick={pickFiles}>
              {COPY.chooseFile}
            </button>
            {folderSupported && (
              <>
                <span className="summon__dot" aria-hidden="true">
                  ·
                </span>
                <button type="button" className="btn-text" onClick={() => folder.current?.click()}>
                  {COPY.chooseFolder}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <input ref={files} type="file" accept=".wk1,.wks" multiple hidden onChange={picked("files")} />
      {folderSupported && <input ref={folder} type="file" multiple hidden {...FOLDER_ATTRS} onChange={picked("folder")} />}
      <div className="summon__foot">
        <p className="summon__privacy">{COPY.privacy}</p>
        <p className="summon__limits">{COPY.limits}</p>
      </div>
    </main>
  );
}
