// The explainer (ai-boundaries.md): the local model writes plain-English text and nothing else.
// The request carries only the macro text and its step labels, or the opcode. The answer is kept
// as text: it is never read as a number, never parsed as data, and never written to a cell.
// The app asks a recorded fixture first (works with no model and no key), then local Ollama.

export type Confidence = "Low" | "Medium" | "High";
export type ExplainRequest = { kind: "macro"; text: string; stepLabels: string[] } | { kind: "unknown-opcode"; opcode: string };
export type Explanation = { suggestion: string; rationale: string | null; confidence: Confidence | null; model: string };
export interface Explainer {
  name: string;
  explain(request: ExplainRequest, signal?: AbortSignal): Promise<Explanation | null>;
}
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type RecordedEntry = { suggestion: string; rationale: string | null; confidence: Confidence | null };

export const OLLAMA_URL = "http://localhost:11434/v1/chat/completions";
const MODELS = ["qwen3", "qwen2.5"];
const TIMEOUT_MS = 15_000;
const MAX_TEXT = 1200;

/** A constant: how to answer. It holds no data from the file. */
const SYSTEM = [
  "You explain Lotus 1-2-3 Release 2 macros and formula codes to an archivist, in plain words.",
  "For a macro, answer with one line: Suggestion: what the macro does.",
  "For an unknown opcode, answer with three lines: Suggestion: the @function or operator it may be. Rationale: why. Confidence: Low, Medium or High.",
  "Say so when you are unsure. Never compute, change or return a number from a sheet.",
].join("\n");

/** The one canonical text of a request: the user message, and the key of recorded answers. */
export function requestText(request: ExplainRequest): string {
  if (request.kind === "macro") {
    return ["Kind: macro", `Macro text: ${request.text}`, "Steps:", ...request.stepLabels.map((l, i) => `${i + 1}. ${l}`)].join("\n");
  }
  return ["Kind: unknown-opcode", "Format: Lotus 1-2-3 Release 2 (WK1) formula token", `Opcode: ${request.opcode}`].join("\n");
}

const LEVELS: Record<string, Confidence> = { low: "Low", medium: "Medium", high: "High" };
const cut = (s: string) => s.slice(0, MAX_TEXT).trim();

/** Plain text only: think blocks and control characters out, labelled lines read, each field cut. */
export function sanitizeModelText(raw: string): Omit<Explanation, "model"> {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const open = text.search(/<think>/i);
  if (open !== -1) text = text.slice(0, open);
  text = text.replace(/[\u0000-\u0008\u000B-\u001F\u007F﻿]/g, "");
  const lines = text.split("\n");
  const field = (label: string): string | null => {
    const re = new RegExp(`^\\s*${label}\\s*:(.*)$`, "i");
    for (const line of lines) {
      const m = re.exec(line);
      if (m) return m[1]!.trimStart();
    }
    return null;
  };
  const suggestion = field("Suggestion");
  const rationale = field("Rationale");
  const level = field("Confidence");
  if (suggestion === null && rationale === null && level === null) return { suggestion: cut(text.trim()), rationale: null, confidence: null };
  return {
    suggestion: suggestion === null ? "" : cut(suggestion),
    rationale: rationale === null ? null : cut(rationale),
    confidence: level === null ? null : (LEVELS[level.trim().toLowerCase()] ?? null),
  };
}

/** Confidence belongs to an opcode answer only; an opcode answer without one gets Low. */
function finish(request: ExplainRequest, fields: Omit<Explanation, "model">, model: string): Explanation | null {
  if (fields.suggestion === "") return null;
  const confidence = request.kind === "unknown-opcode" ? (fields.confidence ?? "Low") : null;
  return { suggestion: fields.suggestion, rationale: fields.rationale, confidence, model };
}

type Envelope = { model?: unknown; choices?: { message?: { content?: unknown } }[] };

export function createOllamaExplainer(deps: { fetch: FetchLike; models?: string[]; timeoutMs?: number }): Explainer {
  const { fetch, models = MODELS, timeoutMs = TIMEOUT_MS } = deps;
  /** One attempt: an answer, null for no answer, or "next" when the model is not installed. */
  const attempt = async (request: ExplainRequest, model: string, signal?: AbortSignal): Promise<Explanation | null | "next"> => {
    const abort = new AbortController();
    const stop = () => abort.abort();
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener("abort", stop);
    try {
      const body = JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: requestText(request) }], stream: false, temperature: 0 });
      const res = await fetch(OLLAMA_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: abort.signal });
      if (res.status === 404) return "next";
      if (!res.ok) return null;
      const envelope = (await res.json()) as Envelope | null;
      const content = envelope?.choices?.[0]?.message?.content;
      if (typeof content !== "string") return null;
      return finish(request, sanitizeModelText(content), typeof envelope?.model === "string" ? envelope.model : model);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
    }
  };
  return {
    name: "local model",
    async explain(request, signal) {
      try {
        for (const model of models) {
          if (signal?.aborted) return null;
          const answer = await attempt(request, model, signal);
          if (answer !== "next") return answer;
        }
        return null;
      } catch {
        return null;
      }
    },
  };
}

export function createRecordedExplainer(deps: { entries: Readonly<Record<string, RecordedEntry>>; model: string; hash: (text: string) => Promise<string> }): Explainer {
  return {
    name: deps.model,
    async explain(request) {
      try {
        const key = await deps.hash(requestText(request));
        const entry = Object.hasOwn(deps.entries, key) ? deps.entries[key] : undefined;
        return entry ? finish(request, entry, deps.model) : null;
      } catch {
        return null;
      }
    },
  };
}

export function chainExplainers(...explainers: Explainer[]): Explainer {
  return {
    name: explainers.map((e) => e.name).join(", "),
    async explain(request, signal) {
      for (const e of explainers) {
        const answer = await e.explain(request, signal);
        if (answer) return answer;
      }
      return null;
    },
  };
}

/** Lowercase hex SHA-256 of the UTF-8 text through Web Crypto; rejects when Web Crypto is missing. */
export async function subtleHash(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
