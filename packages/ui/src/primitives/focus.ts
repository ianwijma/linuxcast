import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

/** Return focus after an owned surface closes, without stealing it from another control. */
export function useFocusRestore(active: boolean, scope: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    if (!active) return;
    const previous = document.activeElement;
    const surface = scope.current;
    return () => {
      const current = document.activeElement;
      if (previous instanceof HTMLElement && previous.isConnected && !previous.matches(':disabled, [aria-disabled="true"]')
        && (current === document.body || current === null || surface?.contains(current))) previous.focus({ preventScroll: true });
    };
  }, [active, scope]);
}
