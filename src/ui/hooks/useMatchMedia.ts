// Phone or not (design.md "StatusList"): the first render reads matchMedia synchronously, so the
// grid never flashes on a phone before the status list replaces it.
import { useEffect, useState } from "react";

export const PHONE = "(max-width: 640px)";
/** Below 1024px the Macros view shows the queue alone and the detail as a dialog. */
export const NARROW = "(max-width: 1023.98px)";

export function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const change = () => setMatches(list.matches);
    change();
    list.addEventListener("change", change);
    return () => list.removeEventListener("change", change);
  }, [query]);
  return matches;
}
