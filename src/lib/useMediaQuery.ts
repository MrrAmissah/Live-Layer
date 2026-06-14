import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query. Initialised synchronously from
 * `window.matchMedia` so the first paint already reflects the real viewport —
 * this prevents a studio→dock (or dock→studio) flash on mount when the control
 * surface picks its layout from the breakpoint.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
