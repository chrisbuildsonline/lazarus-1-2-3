// Files and folders from a drop (requirements 8, 9). Structural types, so Vitest drives it with fakes.
import type { FoundFile, Skipped } from "../model/entries.ts";

export type FileLike = { name: string; size: number; webkitRelativePath?: string };

/** The parts of FileSystemEntry, FileSystemFileEntry and FileSystemDirectoryEntry used here. */
export type EntryLike<F extends FileLike> = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?(ok: (file: F) => void, err: (e: unknown) => void): void;
  createReader?(): { readEntries(ok: (entries: EntryLike<F>[]) => void, err: (e: unknown) => void): void };
};

export type DataTransferLike<F extends FileLike> = {
  items: ArrayLike<{ kind: string; webkitGetAsEntry?(): EntryLike<F> | null }>;
  files: ArrayLike<F>;
};

export type Collected<F> = { found: FoundFile<F>[]; skipped: Skipped[] };

/**
 * Takes every entry synchronously, before anything awaits, because the browser empties the items
 * after the drop event. Falls back to the flat file list when entries are not available.
 */
export function collectDropped<F extends FileLike>(dt: DataTransferLike<F>): Promise<Collected<F>> {
  const entries = Array.from(dt.items)
    .filter((i) => i.kind === "file")
    .map((i) => i.webkitGetAsEntry?.() ?? null);
  const flat = Array.from(dt.files);
  if (entries.some((e) => e !== null)) return collectFromEntries(entries);
  return Promise.resolve({ found: flat.map((file) => ({ path: file.webkitRelativePath || file.name, name: file.name, size: file.size, file })), skipped: [] });
}

/** Walks the entries with a work stack (no recursion), reading each folder until it returns []. */
export async function collectFromEntries<F extends FileLike>(roots: readonly (EntryLike<F> | null)[]): Promise<Collected<F>> {
  const found: FoundFile<F>[] = [];
  const skipped: Skipped[] = [];
  const stack = roots.filter((e): e is EntryLike<F> => e !== null);
  while (stack.length > 0) {
    const entry = stack.pop()!;
    const path = entry.fullPath.replace(/^\/+/, "");
    try {
      if (entry.isDirectory) {
        const reader = entry.createReader!();
        for (;;) {
          const batch = await new Promise<EntryLike<F>[]>((ok, err) => reader.readEntries(ok, err));
          if (batch.length === 0) break;
          stack.push(...batch);
        }
      } else if (entry.isFile) {
        const file = await new Promise<F>((ok, err) => entry.file!(ok, err));
        found.push({ path, name: entry.name, size: file.size, file });
      }
    } catch {
      skipped.push({ path, why: "unreadable" });
    }
  }
  return { found, skipped };
}
