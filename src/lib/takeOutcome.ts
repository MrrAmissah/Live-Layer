import type { PublishResult } from './realtime';

/**
 * What a publish attempt means for operator-visible state.
 *
 * Every one of these transitions was previously written inline in the control
 * page and *re-modelled* in the test file — so the tests asserted a copy of the
 * rule, and dropping the real `if (result.ok)` would not have failed anything.
 * Stating it once, as data, is the same idiom the rest of the repo uses for
 * decisions worth testing (`resolvePackChangeIntent`, `planBrandColorWrite`).
 *
 * The rule itself: nothing operator-visible advances unless a transport
 * accepted the command. A failed send must never mark Program showing, never
 * add to Recent, and never move the rundown's live cursor — the previous
 * graphic may well still be on air.
 */
export interface TakeOutcome {
  /** Record the command in Program (always as unconfirmed — see types/program). */
  markShowing: boolean;
  /** Record the failure instead. */
  markFailed: boolean;
  /** Add the taken instance to Recent. */
  addRecent: boolean;
  /** Advance the rundown's live cursor to the item just taken. */
  advanceLiveCursor: boolean;
}

export function resolveTakeOutcome(result: PublishResult): TakeOutcome {
  const ok = result.ok;
  return {
    markShowing: ok,
    markFailed: !ok,
    addRecent: ok,
    advanceLiveCursor: ok
  };
}

export interface ClearOutcome {
  markClear: boolean;
  /** Drop the rundown's live cursor — nothing is on air from the queue. */
  dropLiveCursor: boolean;
}

export function resolveClearOutcome(result: PublishResult): ClearOutcome {
  return { markClear: result.ok, dropLiveCursor: result.ok };
}
