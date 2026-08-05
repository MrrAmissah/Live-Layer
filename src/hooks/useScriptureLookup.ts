import { useRef, useState } from 'react';
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
  const lookup = async (
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
  };

  const reset = () => {
    requestId.current += 1;
    setState({ status: 'idle' });
  };

  return {
    provider: defaultScriptureProvider,
    ...state,
    lookup,
    reset
  };
}
