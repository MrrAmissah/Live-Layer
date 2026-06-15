import { useRef, useState } from 'react';
import type { ScriptureLookupResult } from '../types/scripture';
import { defaultScriptureProvider } from '../lib/scripture/providers';
import { scriptureCacheKey } from '../lib/scripture/referenceParser';
import { getCachedScripture, saveCachedScripture } from '../lib/scripture/scriptureCache';

interface LookupState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
  fromCache?: boolean;
}

function friendlyError(error: unknown) {
  if (error instanceof Error && error.message === 'reference-required') {
    return 'Enter a scripture reference first.';
  }
  return 'Unable to look that up. You can still paste the verse.';
}

export function useScriptureLookup() {
  const [state, setState] = useState<LookupState>({ status: 'idle' });
  // Sequence guard: only the newest lookup may update status/message or return a
  // result. A stale response (an earlier request resolving after a newer one) is
  // ignored silently — it never overwrites loading/success/error state, and
  // returns null so callers don't apply it.
  const requestId = useRef(0);

  const lookup = async (reference: string, translation: string): Promise<ScriptureLookupResult | null> => {
    const id = ++requestId.current;
    const key = scriptureCacheKey(defaultScriptureProvider.id, translation, reference);
    setState({ status: 'loading', message: 'Looking up scripture...' });

    try {
      const cached = await getCachedScripture(key);
      if (cached) {
        if (requestId.current !== id) return null;
        setState({ status: 'success', message: `Found ${cached.reference} from cache.`, fromCache: true });
        return cached;
      }

      const result = await defaultScriptureProvider.lookup(reference, translation);
      await saveCachedScripture(key, result);
      if (requestId.current !== id) return null;
      setState({ status: 'success', message: `Found ${result.reference}.`, fromCache: false });
      return result;
    } catch (error) {
      if (requestId.current !== id) return null;
      setState({ status: 'error', message: friendlyError(error) });
      return null;
    }
  };

  return {
    provider: defaultScriptureProvider,
    ...state,
    lookup
  };
}
