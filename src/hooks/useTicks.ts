import { useEffect, useState } from 'react';

/**
 * Re-render clock for elapsed/ago readouts (Program rail, dock Program strip).
 * `intervalMs` of 0 disables it. Callers step down to a coarser interval once
 * second-level precision stops being meaningful, so an idle surface isn't
 * waking every second forever.
 *
 * Extracted from ProgramRail so the dock's status chip and the studio's Output
 * card share one clock implementation instead of drifting copies.
 */
export function useTicks(intervalMs: number): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!intervalMs) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return Date.now();
}

/** `mm:ss` since `from`. The elapsed clock is REAL (we know when we sent the
 *  command) — it must always be paired with honest status wording, never with
 *  a claim that output confirmed anything. */
export function elapsed(from: number, now: number): string {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Coarse human "12s ago / 3m ago / 2h ago". */
export function ago(from: number, now: number): string {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
