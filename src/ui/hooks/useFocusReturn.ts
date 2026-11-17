// Focus goes back when the drawer closes (requirements 49, 50): to the cell it last described, or to
// the list row that opened it. The element is found by address at close time, because the grid window
// may have replaced the node the person started from. Focus that already moved elsewhere (a filter
// tab that hid the cell) is left alone.
import { useLayoutEffect, useRef } from "react";

const OWNERS = '.drawer, [role="grid"], .status-list';

export function useFocusReturn(address: string | null, find: (address: string) => HTMLElement | null): void {
  const last = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (address !== null) {
      last.current = address;
      return;
    }
    const was = last.current;
    last.current = null;
    if (was === null) return;
    const active = document.activeElement;
    if (active && active !== document.body && !active.closest(OWNERS)) return;
    find(was)?.focus();
    // find is read at close time only; it is not a trigger.
  }, [address]);
}
