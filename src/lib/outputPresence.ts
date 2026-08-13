import type { OutputStatusMap, OutputStatusState } from '../types/program';

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

/**
 * How long a screen stays on the board after it goes quiet.
 *
 * Every page load mints a new output session id, so a browser source that is
 * reloaded — or an OBS scene collection reopened — leaves its old id behind.
 * Without eviction those accumulate and the desk shows permanent dead screens
 * that are really just yesterday's tabs.
 *
 * Deliberately far longer than OUTPUT_STALE_MS: a screen that genuinely dies
 * must read STALE for long enough that somebody notices mid-service, and only
 * then be forgotten. Five minutes is well past the point where a real failure
 * has been seen and acted on.
 */
export const OUTPUT_FORGET_MS = 300_000;

/** Screens that have gone quiet but are not yet forgotten — the ones to name. */
export function stalledOutputs(outputs: OutputStatusMap, now: number): OutputStatusState[] {
  return Object.values(outputs).filter(
    (status) => now - status.lastSeenAt > OUTPUT_STALE_MS && now - status.lastSeenAt <= OUTPUT_FORGET_MS
  );
}

/**
 * How weak a screen's story is, worst first. Deliberately the same order the
 * status vocabulary reads them in (`lib/programStatus.ts`): stale outranks
 * hidden, hidden outranks inactive, and an unbound page (which can only claim
 * OUTPUT READY) outranks an active source, because it claims less.
 */
function weakness(status: OutputStatusState, now: number): number {
  if (outputPresence(status, now) !== 'fresh') return 0; // UNVERIFIED
  if (status.sourceVisible === false) return 1; // SOURCE HIDDEN
  if (status.sourceActive === false) return 2; // SOURCE INACTIVE
  if (status.sourceActive === null) return 3; // OUTPUT READY — no host binding
  return 4; // OUTPUT ACTIVE
}

/**
 * The one screen whose reading should speak for the rig.
 *
 * Program's status pill is a single phrase, and with several screens up the
 * only honest single phrase is the WEAKEST one: a desk that reads OUTPUT ACTIVE
 * while a second browser source sits hidden is making exactly the claim this
 * vocabulary exists to refuse. Forgotten screens are excluded — a reloaded tab's
 * dead session id must not hold the whole rig at UNVERIFIED forever.
 *
 * Returns null when nothing is known, which the vocabulary already handles.
 */
export function worstOutput(outputs: OutputStatusMap, now: number): OutputStatusState | null {
  const known = Object.values(outputs).filter((status) => now - status.lastSeenAt <= OUTPUT_FORGET_MS);
  if (!known.length) return null;
  return known.reduce((worst, status) => (weakness(status, now) < weakness(worst, now) ? status : worst));
}
