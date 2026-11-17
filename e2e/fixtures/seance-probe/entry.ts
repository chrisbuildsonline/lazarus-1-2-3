// Test-only browser entry for e2e/seance-probe.spec.ts: built by Vite as a small app, then served
// by `vite preview`. It answers what the Seance UI depends on: asset URLs with ?url&no-inline, a module
// worker emitted under /assets/, folder inputs, drop events, and Web Crypto on http://localhost.
import functionsUrl from "../../../fixtures/functions/functions.wk1?url&no-inline";
import ksbaseUrl from "../../../fixtures/ksbase/KSBASE.WK1?url&no-inline";

type DropRecord = { items: { kind: string; entry: null | { isFile: boolean; isDirectory: boolean; name: string; fullPath: string } }[]; files: { name: string; size: number }[] };

const drops: DropRecord[] = [];
const zone = document.getElementById("zone")!;
zone.addEventListener("dragover", (e) => e.preventDefault());
zone.addEventListener("drop", (e) => {
  e.preventDefault();
  const items = [...(e.dataTransfer?.items ?? [])];
  drops.push({
    items: items.map((i) => {
      const entry = i.webkitGetAsEntry?.() ?? null;
      return { kind: i.kind, entry: entry && { isFile: entry.isFile, isDirectory: entry.isDirectory, name: entry.name, fullPath: entry.fullPath } };
    }),
    files: [...(e.dataTransfer?.files ?? [])].map((f) => ({ name: f.name, size: f.size })),
  });
});

async function hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function asset(url: string): Promise<{ url: string; length: number; sha256: string }> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  return { url, length: buffer.byteLength, sha256: await hex(buffer) };
}

function askWorker(): Promise<{ steps: string[]; type: string; id: unknown; totals: unknown; sha256: unknown; transferred: boolean }> {
  const worker = new Worker(new URL("../../../src/workers/raise.worker.ts", import.meta.url), { type: "module" });
  const steps: string[] = [];
  let transferred = false;
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === "progress") return void steps.push(e.data.step);
      worker.terminate();
      resolve({ steps, type: e.data.type, id: e.data.id, totals: e.data.file?.verification?.totals ?? null, sha256: e.data.file?.sha256 ?? null, transferred });
    };
    worker.onerror = (e) => reject(new Error(`worker error: ${e.message}`));
    fetch(ksbaseUrl)
      .then((r) => r.arrayBuffer())
      .then((bytes) => {
        worker.postMessage({ type: "raise", id: 7, name: "KSBASE.WK1", bytes }, [bytes]);
        transferred = bytes.byteLength === 0;
      });
  });
}

const probe = {
  urls: { ksbase: ksbaseUrl, functions: functionsUrl },
  asset,
  askWorker,
  drops,
  subtle: typeof crypto !== "undefined" && typeof crypto.subtle?.digest === "function",
  secure: window.isSecureContext,
  folderInputSupported: "webkitdirectory" in document.createElement("input"),
  picked: () => [...((document.getElementById("dir") as HTMLInputElement).files ?? [])].map((f) => ({ name: f.name, path: f.webkitRelativePath, size: f.size })),
};

(globalThis as unknown as { probe: typeof probe }).probe = probe;
document.title = "probe ready";
