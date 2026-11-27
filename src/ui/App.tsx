// The app: the reducer and the worker client (useRaise), and the switch between the Summon view and
// a raised file's two steps, Sheet and Macros (requirement 1; macro spec requirement 59). Each view has
// one h1, sets document.title, and takes focus on its h1 when it replaces the other view.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COPY } from "./copy.ts";
import { counts } from "../macro/index.ts";
import { ErrorPanel } from "./components/ErrorPanel.tsx";
import { MacrosStep } from "./components/MacrosView.tsx";
import { ProgressSurface, type ProgressPhase } from "./components/ProgressSurface.tsx";
import { SheetView } from "./components/SheetView.tsx";
import { SummonView, type SummonMode } from "./components/SummonView.tsx";
import { Toasts } from "./components/Toast.tsx";
import { StepTabs } from "./components/StepTabs.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { NARROW, PHONE, useMatchMedia } from "./hooks/useMatchMedia.ts";
import { useRaise } from "./hooks/useRaise.ts";
import type { DownloadKind } from "./model/file-names.ts";
import { collectDropped } from "./io/drop.ts";
import { createAppExplainer } from "./io/explainer.ts";
import { loadSample, SAMPLES, type SampleKind } from "./io/sample.ts";
import type { FoundFile, Skipped } from "./model/entries.ts";

const UNFINISHED = new Set(["queued", "reading", "checking"]);

const SAMPLE_LINE: Record<SampleKind, string> = { proof: COPY.sampleLine, mismatch: COPY.mismatchSampleLine };

const copyText =(text: string) => void navigator.clipboard?.writeText(text);

/** A picked file keeps its path inside a picked folder (requirement 9). */
const fromList = (list: FileList): FoundFile<File>[] => Array.from(list, (file) => ({ path: file.webkitRelativePath || file.name, name: file.name, size: file.size, file }));

export function App() {
  const { state, dispatch, summon } = useRaise();
  const phone = useMatchMedia(PHONE);
  const narrow = useMatchMedia(NARROW);
  const explainer = useMemo(createAppExplainer, []);
  const folderSupported = useMemo(() => "webkitdirectory" in document.createElement("input"), []);
  const [fromSample, setFromSample] = useState<SampleKind | null>(null);
  const title = useRef<HTMLHeadingElement | null>(null);
  const firstView = useRef(true);
  const preparing = useRef(false);
  const [preparingKind, setPreparingKind] = useState<DownloadKind | null>(null);

  const selected = state.items.find((i) => i.id === state.selectedId);
  const file = state.view === "sheet" ? selected?.raised : undefined;
  const queue = file && selected ? state.queues[selected.id] : undefined;
  const macros = file !== undefined && queue !== undefined && state.step === "macros";
  const pageTitle = macros ? COPY.macroPageTitle(file.name) : COPY.pageTitle(file ? file.name : COPY.summonTitle);

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  // A chosen row remounts the sheet (it is keyed by file), so the focus goes back to that row.
  const rowFocus = useRef(false);
  useEffect(() => {
    if (!rowFocus.current) return;
    rowFocus.current = false;
    document.querySelector<HTMLElement>(".batch-row.is-selected")?.focus();
  }, [state.selectedId]);
  const selectFile = (id: number) => {
    if (id !== state.selectedId) rowFocus.current = true;
    dispatch({ type: "selectFile", id });
  };

  // Focus the new view's h1 when the view or the step changes, not on the first paint of the page.
  // Arrow keys on the step tabs keep the focus on the tab, as in any tab list. A view that opens with
  // the phone cell sheet (the mismatch sample) keeps the focus in that modal dialog.
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    if (document.activeElement?.closest('.step-tabs, [role="dialog"]')) return;
    (title.current ?? document.querySelector<HTMLElement>("h1"))?.focus();
  }, [state.view, state.step]);

  // Requirement 67: a decision or an undo is announced in an info toast.
  const decide = (id: string, decision: "approve" | "reject") => {
    const item = queue?.items.find((i) => i.id === id);
    if (!item || item.status === (decision === "approve" ? "approved" : "rejected")) return;
    dispatch({ type: "decide", id, decision, at: new Date().toISOString() });
    dispatch({ type: "toast", kind: "info", text: decision === "approve" ? COPY.toastApproved : COPY.toastRejected });
  };
  const undoLast = () => {
    if (!queue || queue.history.length === 0) return;
    dispatch({ type: "undo" });
    dispatch({ type: "toast", kind: "info", text: COPY.toastUndone });
  };

  // The mismatch sample opens filtered to Mismatched with V44's drawer open: the red cell and its cause.
  const summonSample = useCallback(
    async (kind: SampleKind) => {
      try {
        const sample = await loadSample(kind);
        const { name, open } = SAMPLES[kind];
        setFromSample(kind);
        await summon([{ path: name, name, size: sample.size, file: sample }], [], open);
      } catch (e) {
        dispatch({ type: "toast", kind: "error", text: e instanceof Error ? e.message : String(e) });
      }
    },
    [summon, dispatch],
  );

  const summonFiles = useCallback(
    (found: FoundFile<File>[], skipped: Skipped[] = []) => {
      setFromSample(null);
      void summon(found, skipped);
    },
    [summon],
  );

  // collectDropped reads every entry before its first await, so it runs inside the event.
  const summonDropped = useCallback((dt: DataTransfer) => void collectDropped<File>(dt).then(({ found, skipped }) => summonFiles(found, skipped)), [summonFiles]);

  // Requirement 13: a file dropped anywhere on the page never makes the browser open it. A drop
  // beside the zone, or on the Sheet view, starts a new summon like a drop on the zone.
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };
    const dropped = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length > 0) summonDropped(e.dataTransfer);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", dropped);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", dropped);
    };
  }, [summonDropped]);

  // Requirement 56: "Preparing…" is painted before the work starts, then a toast says it started.
  const download = async (kind: DownloadKind) => {
    if (!file || preparing.current) return;
    preparing.current = true;
    setPreparingKind(kind);
    try {
      await new Promise((done) => requestAnimationFrame(done));
      const { buildDownload, saveBlob } = await import("./io/downloads.ts");
      const result = await buildDownload(kind, file, __LAZARUS_VERSION__, queue);
      if (!result.ok) return dispatch({ type: "toast", kind: "error", text: result.reason });
      const { name, data, mime } = result.download;
      saveBlob<HTMLAnchorElement>(document, URL, name, data as BlobPart, mime);
      dispatch({ type: "toast", kind: "info", text: COPY.downloadStarted(name) });
    } catch (e) {
      dispatch({ type: "toast", kind: "error", text: COPY.downloadFailed(e instanceof Error ? e.message : String(e)) });
    } finally {
      preparing.current = false;
      setPreparingKind(null);
    }
  };
  const downloadButton = (kind: DownloadKind, label: string, className: string, disabled = false) => {
    const busy = preparingKind === kind;
    return (
      <button type="button" className={className} aria-disabled={busy || disabled || undefined} onClick={busy || disabled ? undefined : () => void download(kind)}>
        {busy ? COPY.preparing : label}
      </button>
    );
  };

  const dismiss = useCallback((id: number) => dispatch({ type: "dismissToast", id }), [dispatch]);

  let body;
  let primary;
  const steps =
    file && selected && queue ? <StepTabs step={state.step} waiting={counts(queue).pending} under={phone} onStep={(step) => dispatch({ type: "setStep", step })} /> : undefined;
  const titleRef = (el: HTMLHeadingElement | null) => {
    title.current = el;
  };
  if (file && selected && queue && macros) {
    body = (
      <MacrosStep
        key={selected.id}
        queue={queue}
        fileKey={`${state.batchId}:${selected.id}`}
        explainer={explainer}
        lastFocus={state.lastFocus}
        narrow={narrow}
        format={file.format}
        noteLines={file.macroNotes}
        lineCounts={Object.fromEntries(file.macros.map((m) => [m.id, m.lines.length]))}
        steps={phone ? steps : undefined}
        titleRef={titleRef}
        onDecide={decide}
        onUndo={undoLast}
        onExplained={(itemId, explanation) => dispatch({ type: "explained", batchId: state.batchId, fileId: selected.id, itemId, explanation })}
        onFocusDone={() => dispatch({ type: "focusDone" })}
      />
    );
  } else if (file && selected) {
    primary = downloadButton("xlsx", COPY.downloadXlsx, "btn-primary primary-sticky");
    // Requirement 53: without a fingerprint the reports are off, with the reason in view.
    const noHash = file.sha256 === null;
    body = (
      <SheetView
        key={selected.id}
        file={file}
        items={state.items}
        skipped={state.skipped}
        selectedId={state.selectedId}
        phone={phone}
        filter={state.filter}
        sheetIndex={state.sheetIndex}
        onSelectSheet={(index) => dispatch({ type: "selectSheet", index })}
        cell={state.cell?.address ?? null}
        sampleLine={fromSample !== null && file.name === SAMPLES[fromSample].name ? SAMPLE_LINE[fromSample] : null}
        titleRef={titleRef}
        steps={phone ? steps : undefined}
        links={
          <>
            {downloadButton("report-html", COPY.downloadHtml, "btn-text", noHash)}
            <span aria-hidden="true">·</span>
            {downloadButton("report-json", COPY.downloadJson, "btn-text", noHash)}
            {noHash && <span className="sheet__reason">{COPY.noFingerprint}</span>}
          </>
        }
        onSelectFile={selectFile}
        onFilter={(filter) => dispatch({ type: "setFilter", filter })}
        onOpenCell={(address) => dispatch({ type: "openCell", address })}
        onCloseCell={() => dispatch({ type: "closeCell" })}
        onCopy={copyText}
      />
    );
  } else {
    title.current = null;
    const index = state.items.findIndex((i) => UNFINISHED.has(i.phase));
    const current = state.items[index];
    const panel = state.panel;
    const mode: SummonMode = panel === null ? "idle" : panel.kind === "unsupported" || panel.kind === "skipped" ? "unsupported" : "failed";
    const reason = state.items.find((i) => i.failure)?.failure?.reason;
    body = (
      <SummonView
        mode={mode}
        folderSupported={folderSupported}
        busy={current && <ProgressSurface name={current.name} phase={current.phase as ProgressPhase} index={index} count={state.items.length} />}
        panel={panel && <ErrorPanel kind={panel.kind} reason={reason} lines={panel.lines} onCopy={copyText} />}
        onSample={() => void summonSample("proof")}
        onMismatch={() => void summonSample("mismatch")}
        onFiles={(list) => summonFiles(fromList(list))}
        onDrop={summonDropped}
      />
    );
  }

  return (
    <div className="page">
      <TopBar view={macros ? COPY.macrosTitle : file ? COPY.viewSheet : COPY.viewSummon} primary={primary} steps={phone ? undefined : steps} />
      {body}
      <Toasts toasts={state.toasts} onDismiss={dismiss} />
    </div>
  );
}
