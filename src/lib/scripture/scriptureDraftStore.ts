import type { ScriptureLookupResult } from '../../types/scripture';

/**
 * What the operator is composing in the Scripture workspace, before they accept it.
 *
 * Two constraints force this to be a module store rather than component state or
 * the graphic draft.
 *
 * 1. It must NOT be the graphic draft. Typing a reference, searching, and picking
 *    a passage are all reversible browsing; none of them may change what the
 *    preview shows or what Take would fire. Binding the search box straight to
 *    `draftValues.reference` would put a half-typed reference on the preview plate
 *    next to the previous passage's text — the two disagreeing is the one failure
 *    this surface must never produce.
 *
 * 2. It must NOT be `useState`. `ControlShell` keys the centre region on the route
 *    (`key={centerKey}`) so it remounts on every workspace change — deliberately,
 *    to move focus. An operator who glances at the Rundown and comes back would
 *    otherwise find their typed reference and retrieved passage gone, mid-service.
 *
 * Deliberately NOT persisted. This is a composition scratchpad for the current
 * session; accepted passages go to `scriptureRecents`, which is what survives a
 * reload. Persisting an unaccepted draft would resurrect a half-finished search
 * days later and read as state the operator left on purpose.
 */

export interface ScriptureDraftState {
  /** Exactly what is in the reference box. Never normalised behind the operator. */
  query: string;
  /** Requested translation id (`web`), not the display label (`WEB`). */
  translationId: string;
  /** The retrieved passage under review, or null. */
  passage: ScriptureLookupResult | null;
  /** True when `passage` came from the local cache rather than a fresh fetch. */
  fromCache: boolean;
}

const initial: ScriptureDraftState = {
  query: '',
  translationId: 'web',
  passage: null,
  fromCache: false
};

let state: ScriptureDraftState = initial;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getScriptureDraft(): ScriptureDraftState {
  return state;
}

export function subscribeScriptureDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setScriptureDraft(patch: Partial<ScriptureDraftState>) {
  const next = { ...state, ...patch };
  // Identity-stable when nothing changed, so `useSyncExternalStore` does not
  // re-render the workspace on every keystroke that resolves to the same value.
  if (
    next.query === state.query &&
    next.translationId === state.translationId &&
    next.passage === state.passage &&
    next.fromCache === state.fromCache
  ) {
    return;
  }
  state = next;
  emit();
}

/** Drop the retrieved passage but keep what the operator typed. */
export function clearScripturePassage() {
  setScriptureDraft({ passage: null, fromCache: false });
}

export function resetScriptureDraft() {
  setScriptureDraft({ ...initial });
}
