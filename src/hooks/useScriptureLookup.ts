import { useCallback, useRef, useState } from 'react';
import type { ScriptureLookupResult } from '../types/scripture';
import { defaultScriptureProvider } from '../lib/scripture/providers';
import { getCachedScripture, saveCachedScripture } from '../lib/scripture/scriptureCache';
import { runScriptureLookup } from '../lib/scripture/runLookup';
import type { ScriptureFailureKind } from '../lib/scripture/lookupOutcome';

interface LookupState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
  /** Served from the local cache rather than fetched just now. */
  fromCache?: boolean;
  /** Set on failure so the UI can offer the right recovery. */
  failure?: ScriptureFailureKind;
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * React binding for `runScriptureLookup`. The rule — parse, cache, fetch, discard
 * stale, then write — lives in that module so it can be tested with interleaved
 * requests; all this owns is the request counter and the rendered state.
 *
 * `lookup`, `reset` and `cancel` are memoised with no dependencies. That is not
 * tidiness — an unstable `cancel` is a live bug for any caller that puts it in an
 * effect dependency array, because the effect then tears down on EVERY render and
 * its cleanup calls `cancel()`. Since `lookup` sets loading state before awaiting,
 * that re-render happens while the request is in flight, so `cancel()` bumps the
 * request id, `isCurrent()` goes false, and the lookup resolves 'stale' — the
 * passage never arrives and the operator is told retrieval failed. All three close
 * over only a ref and a setState, both stable, so an empty dependency list is
 * correct rather than merely convenient.
 */
export function useScriptureLookup() {
  const [state, setState] = useState<LookupState>({ status: 'idle' });
  // Only the newest lookup may update state or return a result. An earlier
  // request resolving after a newer one is ignored silently.
  const requestId = useRef(0);

  /**
   * Resolves to the passage AND where it came from.
   *
   * The flag is returned rather than read off `state.fromCache` because the
   * caller runs immediately after this await, before React has re-rendered with
   * the new state — it would read the previous lookup's value. Hardcoding
   * `false` at the call site instead made a cached passage render as a fresh
   * one, which is the "previous result reading as a current success" this
   * surface is otherwise careful to avoid.
   */
  const lookup = useCallback(async (
    reference: string,
    translation: string
  ): Promise<{ result: ScriptureLookupResult; fromCache: boolean } | null> => {
    const id = ++requestId.current;
    setState({ status: 'loading', message: 'Looking up scripture…' });

    const outcome = await runScriptureLookup(reference, translation, {
      provider: defaultScriptureProvider,
      getCached: getCachedScripture,
      saveCached: saveCachedScripture,
      isCurrent: () => requestId.current === id,
      online: isOnline()
    });

    switch (outcome.kind) {
      case 'stale':
        return null;
      case 'invalid':
        setState({
          status: 'error',
          message: outcome.message,
          failure: outcome.problem === 'empty' ? 'reference-required' : 'reference-invalid'
        });
        return null;
      case 'cached':
        // Named as a saved copy: a cache hit is a previous result, and calling it
        // "found" would let a stale passage read as a fresh confirmation.
        setState({ status: 'success', message: `${outcome.result.reference} — from saved copy.`, fromCache: true });
        return { result: outcome.result, fromCache: true };
      case 'fresh':
        setState({ status: 'success', message: `Found ${outcome.result.reference}.`, fromCache: false });
        return { result: outcome.result, fromCache: false };
      case 'failed':
        setState({ status: 'error', message: outcome.failure.message, failure: outcome.failure.kind });
        return null;
    }
  }, []);

  const reset = useCallback(() => {
    requestId.current += 1;
    setState({ status: 'idle' });
  }, []);

  /**
   * Invalidate the in-flight request without touching rendered state.
   *
   * For unmount. `reset` would also `setState`, which is pointless on a component
   * that is going away; more importantly the invalidation has to reach INSIDE
   * `runScriptureLookup`, which consults `isCurrent()` before writing the cache.
   * A guard placed after the await — in the caller — is too late: by then the
   * fetched passage has already been persisted, so leaving Scripture to run
   * "Reset all local data" let the pending response repopulate the cache the
   * reset had just cleared. Bumping the id here makes that write not happen.
   */
  const cancel = useCallback(() => {
    requestId.current += 1;
  }, []);

  return {
    provider: defaultScriptureProvider,
    ...state,
    lookup,
    reset,
    cancel
  };
}
