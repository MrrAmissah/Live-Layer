import type { OutputStatusState } from '../types/program';

/**
 * Is the output page still THERE? The heartbeat/staleness rule, shared by the
 * sender (`/output`'s OUTPUT_STATUS cadence) and every consumer (Program
 * wording, and anything else that would otherwise latch a stale claim).
 *
 * Cadence is deliberately conservative — the output page shares a CPU with an
 * encoder, and a control dock lives inside OBS itself. One small POST every
 * 15s is noise; what matters is that the threshold tolerates a missed beat or
 * two (a busy encoder WILL delay timers) without flapping to UNVERIFIED
 * mid-service, while still going stale well under a minute after the page
 * genuinely dies. 45s = three missed beats.
 *
 * `lastSeenAt` is receiver-clock time (set when the event ARRIVED, see
 * `types/program.ts#OutputStatusState`), so this comparison is immune to
 * cross-machine clock skew.
 */
export const OUTPUT_HEARTBEAT_MS = 15_000;
export const OUTPUT_STALE_MS = 45_000;

export type OutputPresence = 'unknown' | 'fresh' | 'stale';

export function outputPresence(status: OutputStatusState | null, now: number): OutputPresence {
  if (!status) return 'unknown';
  return now - status.lastSeenAt <= OUTPUT_STALE_MS ? 'fresh' : 'stale';
}
