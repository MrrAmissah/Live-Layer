import type { CanonicalReference } from './parseReference';
import type { SpokenCandidate } from './spokenReference';
import type { ScriptureLookupResult } from '../../types/scripture';

/**
 * What the operator is looking at: one dominant passage, what it replaced, and —
 * separately — the other ways the CURRENT speech could have been read.
 *
 * These were one list, and the screenshots showed why that was wrong. Saying
 * "John three sixteen" and then "Romans eight twenty eight" produced:
 *
 *     CURRENT               John 3:16
 *     OTHER POSSIBLE        Romans 8:28
 *     READINGS
 *
 * Both statements are false. Romans 8:28 is not a possible reading of "John three
 * sixteen" — it is a different verse the preacher named afterwards, and it is the
 * one they are on now. An operator reading that list is being told the newest
 * thing they said is an alternative interpretation of the oldest.
 *
 * So three concepts, kept apart because they answer three different questions:
 *
 * - **current** — what LiveLayer is proposing right now.
 * - **previous** — what was dominant immediately before it. History, not doubt.
 * - **alternatives** — other readings of the SAME span of speech. "Timothy one
 *   seven" is genuinely 1 Timothy 1:7 or 2 Timothy 1:7 and the operator must
 *   choose; that is doubt, and it is the only thing that belongs here.
 *
 * A previously confirmed passage must never appear as an alternative, and an
 * alternative must never be mistaken for history.
 */

export interface ConfirmedPassage {
  reference: CanonicalReference;
  passage: ScriptureLookupResult;
  /** The words that produced it, so a change is never invisible. */
  heard: string;
}

export interface PassageStack {
  /** The dominant card. */
  current: ConfirmedPassage | null;
  /** Immediately beneath it, compact. History — never presented as doubt. */
  previous: ConfirmedPassage | null;
  /** Other readings of the current span only. Usually empty. */
  alternatives: SpokenCandidate[];
}

export const EMPTY_STACK: PassageStack = { current: null, previous: null, alternatives: [] };

/**
 * Promote a newly confirmed passage to dominant.
 *
 * Atomic by construction: the caller has already retrieved the passage, so there
 * is no window in which `current` is empty. Whatever was dominant becomes
 * `previous`, and the alternatives are REPLACED rather than merged — they describe
 * the new span of speech, and carrying the old span's ambiguity forward is how a
 * stale reading outlives the sentence that produced it.
 */
export function promote(
  stack: PassageStack,
  confirmed: ConfirmedPassage,
  alternatives: SpokenCandidate[] = []
): PassageStack {
  // Re-confirming what is already dominant is not a change; it must not push the
  // real previous passage out of view.
  if (stack.current && stack.current.reference.canonical === confirmed.reference.canonical) {
    return { ...stack, current: confirmed, alternatives };
  }
  return { current: confirmed, previous: stack.current, alternatives };
}

/** The operator brought the previous passage back. A swap, not a rewrite of history. */
export function recallPrevious(stack: PassageStack): PassageStack {
  if (!stack.previous) return stack;
  return { current: stack.previous, previous: stack.current, alternatives: [] };
}

/** The operator's explicit clear. */
export const clearStack = (): PassageStack => ({ ...EMPTY_STACK });

/**
 * Which reference in an utterance is the operator's target?
 *
 * One transcript can carry two complete references — Whisper returned
 * `"John 3 16 Romans 8 28"` for a single recognition window, because the preacher
 * said both. They are not competing readings of one span and must not be offered
 * as a choice: they are two things said in order, and the operator is on the
 * LATER one.
 *
 * "Later" means later in the TRANSCRIPT, which is the order the words were
 * spoken. The candidate list is ranked by score rather than position, so reading
 * the strongest would pick whichever the parser liked best — and on that
 * transcript it picked John, leaving the operator on the verse the preacher had
 * already moved off.
 */
export function newestReference(groups: { candidates: SpokenCandidate[] }[]): {
  target: SpokenCandidate;
  alternatives: SpokenCandidate[];
  earlier: SpokenCandidate[];
} | null {
  const spoken = groups.filter((group) => group.candidates.length);
  if (!spoken.length) return null;
  const last = spoken[spoken.length - 1];
  return {
    target: last.candidates[0],
    // Only the last group's other readings are alternatives — they are the only
    // ones describing the span the operator is actually on.
    alternatives: last.candidates.slice(1),
    // Everything said before it, in spoken order. History, not doubt.
    earlier: spoken.slice(0, -1).map((group) => group.candidates[0])
  };
}
