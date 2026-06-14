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

  const lookup = async (reference: string, translation: string): Promise<ScriptureLookupResult | null> => {
    const key = scriptureCacheKey(defaultScriptureProvider.id, translation, reference);
    setState({ status: 'loading', message: 'Looking up scripture...' });

    try {
      const cached = await getCachedScripture(key);
      if (cached) {
        setState({ status: 'success', message: `Found ${cached.reference} from cache.`, fromCache: true });
        return cached;
      }

      const result = await defaultScriptureProvider.lookup(reference, translation);
      await saveCachedScripture(key, result);
      setState({ status: 'success', message: `Found ${result.reference}.`, fromCache: false });
      return result;
    } catch (error) {
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
