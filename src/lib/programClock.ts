import type { ProgramState } from '../types/program';

/**
 * How often a Program surface must re-render to keep its own text honest.
 *
 * Extracted because both surfaces were deciding this inline and had drifted:
 *
 *  - Both woke every second during `recovering`, where neither renders a time at
 *    all. The dock deliberately suppresses the clock there — `takenAt` survives a
 *    reload, so an elapsed counter reads as a huge stale number beside "Not
 *    confirmed" — and the studio renders only "Reloaded — can't confirm what
 *    output is showing". So the interval was pure waste, in a dock that shares a
 *    CPU with an encoder and mounts one tab at a time precisely to avoid that.
 *  - The studio dropped to a one-minute cadence after the first minute for
 *    `showing` as well as `clear`, while rendering "sent MM:SS ago". Seconds
 *    updated once a minute, so the readout was visibly stale between ticks.
 *
 * The rule is therefore: tick only for statuses whose visible copy changes with
 * time, at the cadence that copy actually needs.
 *
 *  - `showing`  — renders MM:SS, so every second, for as long as it shows.
 *                 The same tick is what lets a confirmed OUTPUT READY / OUTPUT
 *                 ACTIVE reading fall to UNVERIFIED when the output heartbeat
 *                 goes stale: staleness is derived from `now` at render time
 *                 (`describeProgramStatus`), so the surface must be awake.
 *  - `clear`    — renders "12s ago / 3m ago", so every second for the first
 *                 minute and every minute after that, when only whole minutes
 *                 are displayed.
 *  - `clearing` — "Clearing — awaiting output" is static and claims nothing
 *                 that staleness could invalidate; the transition to `clear`
 *                 arrives as a store update (OUTPUT_CLEARED), not as time.
 *                 No timer.
 *  - `recovering`, `failed` — no time is rendered. No timer.
 *
 * `now` is a parameter rather than a `Date.now()` call so the decision is a pure
 * function of state and can be tested at a chosen instant.
 */
export const CLOCK_FINE_MS = 1000;
export const CLOCK_COARSE_MS = 60_000;

export function programClockMs(program: ProgramState, now: number): number {
  if (program.status === 'showing') {
    return program.takenAt === null ? 0 : CLOCK_FINE_MS;
  }
  if (program.status === 'clear') {
    if (program.clearedAt === null) return 0; // "Ready — nothing on air" never changes
    return now - program.clearedAt >= CLOCK_COARSE_MS ? CLOCK_COARSE_MS : CLOCK_FINE_MS;
  }
  // clearing / recovering / failed: the copy is static, so nothing needs waking up.
  return 0;
}
