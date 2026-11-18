// The app's explainer (requirement 43): the recorded fixture first, then a local Ollama model on
// localhost:11434. The one fetch here goes only to createOllamaExplainer, whose URL is a constant.
import recorded from "../../../fixtures/macros/recorded-explanations.json";
import { chainExplainers, createOllamaExplainer, createRecordedExplainer, subtleHash, type Explainer, type RecordedEntry } from "../../macro/index.ts";

type RecordedFile = { model: string; entries: Record<string, RecordedEntry> };

export function createAppExplainer(): Explainer {
  const file = recorded as RecordedFile;
  return chainExplainers(
    createRecordedExplainer({ entries: file.entries, model: file.model, hash: subtleHash }),
    createOllamaExplainer({ fetch: (url, init) => fetch(url, init) }),
  );
}
