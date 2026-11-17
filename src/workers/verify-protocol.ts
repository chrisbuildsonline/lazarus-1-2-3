// The verify worker's message protocol (requirements 7 to 11). handleVerifyRequest is a plain
// function, so it runs in Node without a worker; installVerifyWorker wires it to a worker scope.
import { verifyBytes, type VerifyBytesResult } from "../verify/index.ts";

export type VerifyRequest = { type: "verify"; id: number; name?: string; bytes: ArrayBuffer };

export type VerifyResponse = { type: "result"; id: number; result: VerifyBytesResult } | { type: "error"; id: number | null; message: string };

/** The part of a worker scope the handler needs, so a test can pass a fake one. */
export type WorkerScopeLike = { onmessage: ((event: { data: unknown }) => void) | null; postMessage(message: VerifyResponse): void };

/** Answers every message on the scope with handleVerifyRequest, in arrival order. */
export function installVerifyWorker(scope: WorkerScopeLike): void {
  scope.onmessage = (event) => scope.postMessage(handleVerifyRequest(event.data));
}

type Verify =(bytes: Uint8Array, name?: string) => VerifyBytesResult;

const field = (request: unknown, key: string): unknown => (typeof request === "object" && request !== null ? (request as Record<string, unknown>)[key] : undefined);

/** Validates the shape, verifies the bytes, and always answers (requirement 11). */
export function handleVerifyRequest(request: unknown, verify: Verify = verifyBytes): VerifyResponse {
  const rawId = field(request, "id");
  const id = typeof rawId === "number" && Number.isInteger(rawId) ? rawId : null;
  const error = (message: string): VerifyResponse => ({ type: "error", id, message });
  if (id === null) return error("The request has no whole-number id.");
  if (field(request, "type") !== "verify") return error('The request type is not "verify".');
  const bytes = field(request, "bytes");
  if (!(bytes instanceof ArrayBuffer)) return error("The request carries no file bytes (an ArrayBuffer).");
  const name = field(request, "name");
  if (name !== undefined && typeof name !== "string") return error("The request name is not text.");
  // The one try/catch of the feature: the core does not throw, this only guards against a bug.
  try {
    return { type: "result", id, result: verify(new Uint8Array(bytes), name ?? "") };
  } catch (e) {
    return error(`Verification failed unexpectedly: ${e instanceof Error ? e.message : String(e)}`);
  }
}
