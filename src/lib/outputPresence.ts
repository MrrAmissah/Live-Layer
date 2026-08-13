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

/**
 * Screens that have gone quiet but are not yet forgotten — the ones to name.
 *
 * A session whose SCREEN is already being reported by a fresher one is not a
 * dead screen; it is a replaced tab. That is the ordinary aftermath of an OBS
 * restart or a source refresh — every page load mints a new session id and the
 * old one lingers for `OUTPUT_FORGET_MS` — and naming it would have the desk
 * warning about screens that are, at that moment, working. A warning that fires
 * every time the operator restarts OBS is a warning they learn to ignore.
 *
 * A session that named NO screen cannot be matched this way, so it is still
 * reported: unidentified and quiet is genuinely worth a look.
 */
export function stalledOutputs(outputs: OutputStatusMap, now: number): OutputStatusState[] {
  const all = Object.values(outputs);
  const freshScreens = new Set(
    all
      .filter((status) => status.screen !== null && outputPresence(status, now) === 'fresh')
      .map((status) => status.screen)
  );
  return all.filter(
    (status) =>
      now - status.lastSeenAt > OUTPUT_STALE_MS &&
      now - status.lastSeenAt <= OUTPUT_FORGET_MS &&
      !(status.screen !== null && freshScreens.has(status.screen))
  );
}

/**
 * The output currently speaking for a NAMED screen, or null.
 *
 * The map is keyed by output session id; the Screens page is keyed by screen.
 * Three cases the map really produces, and each needs a different answer:
 *
 *  - **Nobody claims this screen.** Null — "not connected". Distinct from
 *    stale, which means something WAS there and stopped.
 *  - **Two outputs claim it.** The ordinary case, not an exotic one: every page
 *    load mints a new session id, so a refreshed browser source leaves its
 *    predecessor behind for OUTPUT_FORGET_MS. The freshest wins, because it is
 *    the one still reporting.
 *  - **An output that named no screen.** Belongs to no card. Filing it under
 *    `main` would invent an answer — an older build's output is genuinely
 *    unidentified, and a card claiming it is connected would be a lie.
 */
export function outputForScreen(
  outputs: OutputStatusMap,
  screen: string,
  now: number
): OutputStatusState | null {
  const claimants = Object.values(outputs).filter(
    (status) => status.screen === screen && now - status.lastSeenAt <= OUTPUT_FORGET_MS
  );
  if (!claimants.length) return null;
  return claimants.reduce((freshest, status) => (status.lastSeenAt > freshest.lastSeenAt ? status : freshest));
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
 * Is this screen MEASURABLY carrying the graphic right now?
 *
 * Positive evidence only: OBS says this source is active and its eye is on.
 *
 * A page with no host binding — a preview window, `/output` open on a phone
 * over the relay — is deliberately NOT carrying. It cannot be: it is a browser
 * tab, not a source in a scene. Letting it count was a real fault on the desk,
 * and it broke both directions at once. `weakness` ranks an unbound page BELOW
 * an active source (it claims less), so one preview tab left open pinned the
 * pill to OUTPUT READY while the OBS source was plainly active — and when the
 * real sources went hidden, the tab was the only thing still "carrying", so
 * SOURCE HIDDEN never appeared at all. A tab nobody is watching was outvoting
 * the rig.
 */
function isCarrying(status: OutputStatusState, now: number): boolean {
  if (outputPresence(status, now) !== 'fresh') return false;
  return status.sourceActive === true && status.sourceVisible !== false;
}

/**
 * The one screen whose reading should speak for the rig.
 *
 * Program's status pill is a single phrase, and with several screens the only
 * honest single phrase is the weakest — a desk reading OUTPUT ACTIVE while the
 * source carrying air sits hidden is the claim this vocabulary exists to refuse.
 *
 * BUT THE WEAKEST OF *ALL* SCREENS IS THE WRONG ANSWER, and it made the desk
 * useless the moment a second source existed. The main and split scenes are
 * alternatives: exactly one is live, so the other's source is off-air BY
 * DESIGN and reports hidden or inactive forever. Ranking it worst pinned the
 * pill to SOURCE HIDDEN permanently — a fault the operator cannot fix, about a
 * screen nobody is watching, which is how a status light becomes furniture.
 *
 * So the pill is decided by the screens that are actually carrying. It answers
 * "is what I commanded reaching air", and a scene that is not live is not air.
 * One source measured active is enough: it IS the evidence that the graphic is
 * compositing, and a page elsewhere that has measured nothing cannot weaken it.
 *
 * When NOTHING is carrying, every screen is back in the pool and the weakest
 * speaks — because then the answer is genuinely bad news: no live source is
 * showing this graphic, and that is worth saying however it happened. That
 * fallback is also what keeps an OBS-less rig honest: with only unbound pages
 * reporting, the weakest of them is one of those pages, and the desk sits at
 * OUTPUT READY exactly as it should.
 *
 * A screen that dies while another carries is NOT hidden by this. It stops
 * being fresh, so it never counts as carrying, and it is reported by name
 * through `describeStalledScreens` and on its own card. Two questions, two
 * answers: this one is "is it on air", that one is "which screen stopped".
 *
 * Returns null when nothing is known, which the vocabulary already handles.
 */
export function worstOutput(outputs: OutputStatusMap, now: number): OutputStatusState | null {
  const known = Object.values(outputs).filter((status) => now - status.lastSeenAt <= OUTPUT_FORGET_MS);
  if (!known.length) return null;
  const carrying = known.filter((status) => isCarrying(status, now));
  const pool = carrying.length ? carrying : known;
  return pool.reduce((worst, status) => (weakness(status, now) < weakness(worst, now) ? status : worst));
}
