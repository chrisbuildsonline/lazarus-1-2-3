// The bundled sample (requirement 14): one GET of a build asset from the app origin. `?url&no-inline`
// keeps it a file under /assets/ (task 3 probe, finding a). The bytes then take the dropped-file path.
import sampleUrl from "../../../fixtures/ksbase/KSBASE.WK1?url&no-inline";

export const SAMPLE_NAME = "KSBASE.WK1";

export async function loadSample(): Promise<File> {
  const response = await fetch(sampleUrl);
  if (!response.ok) throw new Error(`${SAMPLE_NAME}: HTTP ${response.status}`);
  return new File([await response.arrayBuffer()], SAMPLE_NAME);
}
