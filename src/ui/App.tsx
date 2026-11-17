// The app: the reducer and the worker client (useRaise), and the switch between the Summon and
// Sheet views (requirement 1). Each view has one h1, sets document.title, and takes focus on its h1
// when it replaces the other view.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COPY } from "./copy.ts";
import { ErrorPanel } from "./components/ErrorPanel.tsx";
import { ProgressSurface, type ProgressPhase } from "./components/ProgressSurface.tsx";
import { SheetView } from "./components/SheetView.tsx";
import { SummonView, type SummonMode } from "./components/SummonView.tsx";
import { Toasts } from "./components/Toast.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { PHONE, useMatchMedia } from "./hooks/useMatchMedia.ts";
import { useRaise } from "./hooks/useRaise.ts";
import type { DownloadKind } from "./model/file-names.ts";
import { loadSample, SAMPLE_NAME } from "./io/sample.ts";

const UNFINISHED = new Set(["queued", "reading", "checking"]);

const copyText = (text: string) => void navigator.clipboard?.writeText(text);

export function App() {
  const { state, dispatch, summon } = useRaise();
  const phone = useMatchMedia(PHONE);
  const folderSupported = useMemo(() => "webkitdirectory" in document.createElement("input"), []);
  const [fromSample, setFromSample] = useState(false);
  const title = useRef<HTMLHeadingElement | null>(null);
  const firstView = useRef(true);

  const selected = state.items.find((i) => i.id === state.selectedId);
  const file = state.view === "sheet" ? selected?.raised : undefined;
  const viewTitle = file ? file.name : COPY.summonTitle;

  useEffect(() => {
    document.title = COPY.pageTitle(viewTitle);
  }, [viewTitle]);

  // Focus the new view's h1 when the view changes, not on the first paint of the page.
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    (title.current ?? document.querySelector<HTMLElement>("h1"))?.focus();
  }, [state.view]);

  const summonSample = useCallback(async () => {
    try {
      const sample = await loadSample();
      setFromSample(true);
      await summon([{ path: SAMPLE_NAME, name: SAMPLE_NAME, size: sample.size, file: sample }]);
    } catch (e) {
      dispatch({ type: "toast", kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }, [summon, dispatch]);

  const download = async (kind: DownloadKind) => {
    if (!file) return;
    const { buildDownload, saveBlob } = await import("./io/downloads.ts");
    const result = await buildDownload(kind, file, __LAZARUS_VERSION__);
    if (!result.ok) return dispatch({ type: "toast", kind: "error", text: result.reason });
    const { name, data, mime } = result.download;
    saveBlob<HTMLAnchorElement>(document, URL, name, data as BlobPart, mime);
  };

  const dismiss = useCallback((id: number) => dispatch({ type: "dismissToast", id }), [dispatch]);

  let body;
  let primary;
  if (file && selected) {
    primary = (
      <button type="button" className="btn-primary primary-sticky" onClick={() => void download("xlsx")}>
        {COPY.downloadXlsx}
      </button>
    );
    body = (
      <SheetView
        key={selected.id}
        file={file}
        items={state.items}
        skipped={state.skipped}
        selectedId={state.selectedId}
        phone={phone}
        filter={state.filter}
        cell={state.cell?.address ?? null}
        sample={fromSample && file.name === SAMPLE_NAME}
        titleRef={(el) => {
          title.current = el;
        }}
        links={
          <>
            <button type="button" className="btn-text" onClick={() => void download("report-html")}>
              {COPY.downloadHtml}
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" className="btn-text" onClick={() => void download("report-json")}>
              {COPY.downloadJson}
            </button>
          </>
        }
        onSelectFile={(id) => dispatch({ type: "selectFile", id })}
        onFilter={(filter) => dispatch({ type: "setFilter", filter })}
        onOpenCell={(address) => dispatch({ type: "openCell", address })}
      />
    );
  } else {
    title.current = null;
    const index = state.items.findIndex((i) => UNFINISHED.has(i.phase));
    const current = state.items[index];
    const panel = state.panel;
    const mode: SummonMode = panel === null ? "idle" : panel.kind === "unsupported" ? "unsupported" : "failed";
    const reason = state.items.find((i) => i.failure)?.failure?.reason;
    body = (
      <SummonView
        mode={mode}
        folderSupported={folderSupported}
        busy={current && <ProgressSurface name={current.name} phase={current.phase as ProgressPhase} index={index} count={state.items.length} />}
        panel={panel && <ErrorPanel kind={panel.kind} reason={reason} lines={panel.lines} onCopy={copyText} />}
        onSample={() => void summonSample()}
      />
    );
  }

  return (
    <div className="page">
      <TopBar view={file ? COPY.viewSheet : COPY.viewSummon} primary={primary} />
      {body}
      <Toasts toasts={state.toasts} onDismiss={dismiss} />
    </div>
  );
}
