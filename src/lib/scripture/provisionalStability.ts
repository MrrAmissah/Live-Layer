/**
 * When has a guess from unfinished speech earned the dominant card?
 *
 * Progressive recognition re-reads the utterance-so-far every 400 ms, and each
 * pass may name a different reference. That is fine for a transcript, which is
 * *expected* to revise, and wrong for the passage card, which is the largest
 * thing on the surface and reads as an answer. The rehearsal showed exactly why:
 * "John three sixteen" produced **John 3:6** from a snapshot taken a moment
 * before the speaker finished — a real verse, retrievable, quotable, and not what
 * was said. Flashing that and correcting it a second later teaches the operator
 * that the card cannot be trusted, which costs more than the second it saved.
 *
 * So a provisional reference has to be said twice before it is shown: the same
 * canonical reference from **two consecutive revisions of the same utterance**.
 * A snapshot cut mid-word rarely produces the same wrong reference twice, while a
 * reference the speaker actually finished saying survives every later revision.
 *
 * ## What this is not
 *
 * **Not a confidence score.** Nothing here is a probability and nothing derived
 * from it should be shown as one. It is temporal agreement between two passes of
 * the same recogniser over overlapping audio — which says the recognition has
 * settled, and says nothing whatever about whether it is right. Presenting it as
 * a percentage would be inventing a measurement, and the vote count is
 * deliberately not exposed to the operator either: "2/2 stable" is this module's
 * internal business, not a thing anyone in a booth should have to read.
 *
 * **Not applied to finals.** The final pass has the whole utterance and is the
 * authoritative answer; making it wait for a second opinion would delay the one
 * result that does not need one.
 *
 * **Not a memory.** Agreement is only meaningful within one utterance by one
 * session. A vote from the reference before this one is not evidence about this
 * one, so the count is keyed to the segment and resets the moment anything about
 * the context changes.
 */

/** How many consecutive revisions must agree before the passage card is filled. */
export const REQUIRED_AGREEMENT = 2;

export interface StabilityState {
  /** The utterance these votes belong to. Votes never cross utterances. */
  segmentId: string | null;
  /** The canonical reference being voted on, e.g. `John 3:16`. */
  reference: string | null;
  /** Consecutive revisions of `segmentId` that produced `reference`. */
  agreement: number;
}

export const NO_AGREEMENT: StabilityState = { segmentId: null, reference: null, agreement: 0 };

export interface StabilityVerdict {
  state: StabilityState;
  /**
   * True on the revision that reaches agreement, and on every later revision that
   * keeps naming the same reference — so a settled card is not torn down and
   * rebuilt while the speaker carries on saying the same thing.
   */
  displayEligible: boolean;
}

/**
 * Record one provisional reading.
 *
 * A reading that differs from the one before it does not accumulate — it
 * *replaces* it and starts again at one. Two revisions disagreeing is evidence
 * that recognition has not settled, and counting them together would let
 * `John 3:6` and `John 3:16` sum to a confidence neither of them earned.
 */
export function observeProvisional(
  state: StabilityState,
  segmentId: string,
  reference: string
): StabilityVerdict {
  const continues = state.segmentId === segmentId && state.reference === reference;
  const agreement = continues ? state.agreement + 1 : 1;
  return {
    state: { segmentId, reference, agreement },
    displayEligible: agreement >= REQUIRED_AGREEMENT
  };
}

/**
 * Forget everything.
 *
 * Called when the utterance ends, when a final supersedes the provisional state,
 * when listening stops and when the session changes. Each of those makes existing
 * votes meaningless rather than merely old, and a vote that outlives its context
 * is how the *previous* reference ends up displaying instantly against the next
 * one.
 */
export const forgetAgreement = (): StabilityState => ({ ...NO_AGREEMENT });

export interface DisplayDecision {
  state: StabilityState;
  /** Fill the dominant passage card with this reference. */
  display: boolean;
  /**
   * Anything already being retrieved is no longer the authoritative answer.
   *
   * True on every revision, including the ones that display nothing. A reading
   * that has been superseded must stop being able to land — otherwise `John 3:16`
   * is retrieved, the next revision says `John 3:17`, and the slower first lookup
   * arrives afterwards and quietly reinstates a reference recognition has already
   * moved off.
   */
  invalidatePending: boolean;
}

/**
 * The one decision both paths go through: display this reading, or not yet?
 *
 * Finals and provisionals differ in exactly one respect and it is worth having in
 * a single place rather than in two branches of a component. A **final** has the
 * whole utterance and is the authoritative answer, so it displays immediately and
 * consults no votes — making the one result that does not need a second opinion
 * wait for one would be delay for its own sake. A **provisional** must have been
 * said twice.
 *
 * A final also clears the votes, because the utterance it settles is over.
 */
export function decideDisplay(
  state: StabilityState,
  reading: { segmentId: string; reference: string; isFinal: boolean }
): DisplayDecision {
  if (reading.isFinal) {
    return { state: forgetAgreement(), display: true, invalidatePending: true };
  }
  const verdict = observeProvisional(state, reading.segmentId, reading.reference);
  return { state: verdict.state, display: verdict.displayEligible, invalidatePending: true };
}
