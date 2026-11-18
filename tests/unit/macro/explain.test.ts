import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chainExplainers, createOllamaExplainer, createRecordedExplainer, requestText, sanitizeModelText, subtleHash, type ExplainRequest, type Explainer, type FetchLike } from "../../../src/macro/explain.ts";

const macroReq: ExplainRequest = { kind: "macro", text: "/PPRA1..D8~GQ", stepLabels: ["Print > Printer > Range: A1..D8", "Print > Printer > Go", "Print > Printer > Quit"] };
const opReq: ExplainRequest = { kind: "unknown-opcode", opcode: "0x5A" };
const reply = (content: unknown, status = 200, model?: unknown) => new Response(JSON.stringify({ model, choices: [{ message: { content } }] }), { status });
const sha = async (t: string) => createHash("sha256").update(t).digest("hex");
const fake = (fn: (url: string, init?: RequestInit) => Promise<Response>) => vi.fn<FetchLike>(fn);

afterEach(() => vi.useRealTimers());

describe("requestText", () => {
  it("gives the canonical macro text of design.md", () => {
    expect(requestText(macroReq)).toBe("Kind: macro\nMacro text: /PPRA1..D8~GQ\nSteps:\n1. Print > Printer > Range: A1..D8\n2. Print > Printer > Go\n3. Print > Printer > Quit");
  });
  it("gives the format and the opcode, and nothing about a cell", () => {
    expect(requestText(opReq)).toBe("Kind: unknown-opcode\nFormat: Lotus 1-2-3 Release 2 (WK1) formula token\nOpcode: 0x5A");
  });
  it("holds no value it was not given", () => {
    const t = requestText({ kind: "macro", text: "{GOTO}B2~", stepLabels: ["Go to B2"] });
    expect(t.replace("{GOTO}B2~", "").replace("Go to B2", "")).not.toMatch(/\d{2,}/);
  });
});

describe("createOllamaExplainer", () => {
  it("posts one JSON body to the local endpoint with no key", async () => {
    const fetch = fake(async () => reply("Suggestion: Prints the range A1..D8."));
    const e = await createOllamaExplainer({ fetch }).explain(macroReq);
    expect(e).toEqual({ suggestion: "Prints the range A1..D8.", rationale: null, confidence: null, model: "qwen3" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(init!.method).toBe("POST");
    expect(init!.headers).toEqual({ "Content-Type": "application/json" });
    const body = JSON.parse(String(init!.body));
    expect(Object.keys(body)).toEqual(["model", "messages", "stream", "temperature"]);
    expect(body).toMatchObject({ model: "qwen3", stream: false, temperature: 0 });
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1]).toEqual({ role: "user", content: requestText(macroReq) });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
  });
  it("tries the next model on 404 and stores the model the server names", async () => {
    const asked: string[] = [];
    const fetch = fake(async (_u, init) => {
      const model = JSON.parse(String(init!.body)).model;
      asked.push(model);
      return model === "qwen3" ? new Response("", { status: 404 }) : reply("Suggestion: @ISNUMBER\nConfidence: medium\nRationale: a guess", 200, "qwen2.5:7b");
    });
    expect(await createOllamaExplainer({ fetch }).explain(opReq)).toEqual({ suggestion: "@ISNUMBER", rationale: "a guess", confidence: "Medium", model: "qwen2.5:7b" });
    expect(asked).toEqual(["qwen3", "qwen2.5"]);
  });
  it("gives Low to an opcode answer with no valid confidence, and none to a macro", async () => {
    const fetch = fake(async () => reply("Suggestion: @ISNUMBER\nConfidence: High"));
    expect((await createOllamaExplainer({ fetch: fake(async () => reply("Suggestion: x\nConfidence: very")) }).explain(opReq))?.confidence).toBe("Low");
    expect((await createOllamaExplainer({ fetch }).explain(macroReq))?.confidence).toBeNull();
  });
  it("gives null on 500, a network error, invalid JSON, empty content, content that is not text, and all models missing", async () => {
    const cases: FetchLike[] = [
      async () => new Response("x", { status: 500 }),
      async () => Promise.reject(new TypeError("refused")),
      async () => new Response("not json"),
      async () => reply("   "),
      async () => reply("<think>only thinking</think>"),
      async () => reply(42),
      async () => new Response("{}"),
      async () => new Response("", { status: 404 }),
    ];
    for (const fetch of cases) expect(await createOllamaExplainer({ fetch }).explain(macroReq)).toBeNull();
  });
  it("aborts on the timeout with its own AbortController", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetch = fake((_u, init) => new Promise((_, no) => { signal = init!.signal!; signal.addEventListener("abort", () => no(new DOMException("aborted", "AbortError"))); }));
    const p = createOllamaExplainer({ fetch }).explain(macroReq);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal!.aborted).toBe(true);
    expect(await p).toBeNull();
  });
  it("aborts when the caller aborts, also before the call", async () => {
    const caller = new AbortController();
    const fetch = fake((_u, init) => new Promise((_, no) => init!.signal!.addEventListener("abort", () => no(new DOMException("aborted", "AbortError")))));
    const p = createOllamaExplainer({ fetch, timeoutMs: 60_000 }).explain(macroReq, caller.signal);
    caller.abort();
    expect(await p).toBeNull();
    const early = fake(async () => reply("Suggestion: x"));
    expect(await createOllamaExplainer({ fetch: early }).explain(macroReq, caller.signal)).toBeNull();
    expect(early).not.toHaveBeenCalled();
  });
  it("never throws, even when fetch throws synchronously", async () => {
    const fetch = fake(() => { throw new Error("boom"); });
    await expect(createOllamaExplainer({ fetch }).explain(macroReq)).resolves.toBeNull();
  });
});

describe("sanitizeModelText", () => {
  it("removes think blocks, also an unclosed one", () => {
    expect(sanitizeModelText("<think>secret</think>Hello there").suggestion).toBe("Hello there");
    expect(sanitizeModelText("<THINK>a</THINK>b<think>c</think>d").suggestion).toBe("bd");
    expect(sanitizeModelText("Answer<think>never closed")).toEqual({ suggestion: "Answer", rationale: null, confidence: null });
  });
  it("removes C0 controls and the BOM, keeps newline and tab", () => {
    expect(sanitizeModelText("﻿a\u0000b\u0007c\u001Bd\te\nf\u007F").suggestion).toBe("abcd\te\nf");
  });
  it("reads labelled lines in any case, and keeps unlabelled text whole", () => {
    expect(sanitizeModelText("Suggestion: A\nconfidence: HIGH\nRATIONALE: B")).toEqual({ suggestion: "A", rationale: "B", confidence: "High" });
    expect(sanitizeModelText("Just prose, with 42 in it.\nSecond line.")).toEqual({ suggestion: "Just prose, with 42 in it.\nSecond line.", rationale: null, confidence: null });
    expect(sanitizeModelText("Rationale: only this")).toEqual({ suggestion: "", rationale: "only this", confidence: null });
  });
  it("takes confidence only as the exact word", () => {
    for (const [word, want] of [["low", "Low"], ["Medium", "Medium"], ["hIgH", "High"], ["not low", null], ["High-ish", null], ["0.9", null], ["", null]] as const) {
      expect(sanitizeModelText(`Suggestion: x\nConfidence: ${word}`).confidence, word).toBe(want);
    }
  });
  it("cuts each field at 1,200 characters and trims", () => {
    expect(sanitizeModelText("x".repeat(2000)).suggestion).toHaveLength(1200);
    const r = sanitizeModelText(`Suggestion: ${"s".repeat(1300)}\nRationale: ${"r".repeat(1300)}`);
    expect([r.suggestion.length, r.rationale!.length]).toEqual([1200, 1200]);
    expect(sanitizeModelText(`${"y".repeat(1199)}    z`).suggestion).toBe("y".repeat(1199));
    expect(sanitizeModelText("  padded  ").suggestion).toBe("padded");
  });
});

describe("recorded and chained explainers", () => {
  it("replays a recorded entry by the hash of the request text, misses otherwise, and gives null when hashing fails", async () => {
    const key = await sha(requestText(macroReq));
    const rec = createRecordedExplainer({ entries: { [key]: { suggestion: "Prints A1..D8", rationale: null, confidence: null } }, model: "recorded fixture", hash: sha });
    expect(await rec.explain(macroReq)).toEqual({ suggestion: "Prints A1..D8", rationale: null, confidence: null, model: "recorded fixture" });
    expect(await rec.explain(opReq)).toBeNull();
    const broken = createRecordedExplainer({ entries: { [key]: { suggestion: "x", rationale: null, confidence: null } }, model: "m", hash: async () => Promise.reject(new Error("no crypto")) });
    expect(await broken.explain(macroReq)).toBeNull();
  });
  it("subtleHash is the lowercase hex SHA-256 of the UTF-8 text", async () => {
    for (const t of ["", "abc", "Kind: macro\n\\0 é"]) expect(await subtleHash(t)).toBe(await sha(t));
  });
  it("chain asks in order and stops at the first answer", async () => {
    const seen: string[] = [];
    const ex = (name: string, answer: boolean): Explainer => ({ name, explain: async () => (seen.push(name), answer ? { suggestion: name, rationale: null, confidence: null, model: name } : null) });
    expect((await chainExplainers(ex("a", false), ex("b", true), ex("c", true)).explain(macroReq))?.model).toBe("b");
    expect(seen).toEqual(["a", "b"]);
    expect(await chainExplainers(ex("d", false)).explain(macroReq)).toBeNull();
    expect(await chainExplainers().explain(macroReq)).toBeNull();
  });
});
