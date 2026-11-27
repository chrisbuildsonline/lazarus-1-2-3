// The bundled samples (requirement 14): one GET of a build asset from the app origin. `?url&no-inline`
// keeps each a file under /assets/ (task 3 probe, finding a). The bytes then take the dropped-file path.
// KSBASE.WK1 is the proof (160 of 160 matched); m21tab.wk3 is the real mismatch (NOAA, V44 = L44/C44
// with no C44 left in the file), and it opens on that cell.
import ksbaseUrl from "../../../fixtures/ksbase/KSBASE.WK1?url&no-inline";
import m21Url from "../../../fixtures/noaa-ala-wai-m21/m21tab.wk3?url&no-inline";
import type { SummonOpen } from "../model/app-state.ts";

export type SampleKind = "proof" | "mismatch";

export const SAMPLES: Record<SampleKind, { name: string; url: string; open?: SummonOpen }> = {
  proof: { name: "KSBASE.WK1", url: ksbaseUrl },
  mismatch: { name: "m21tab.wk3", url: m21Url, open: { filter: "mismatched", cell: "V44" } },
};

export const SAMPLE_NAME = SAMPLES.proof.name;

export async function loadSample(kind: SampleKind = "proof"): Promise<File> {
  const { name, url } = SAMPLES[kind];
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return new File([await response.arrayBuffer()], name);
}
