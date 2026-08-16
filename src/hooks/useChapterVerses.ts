import { useEffect, useRef, useState } from 'react';
import { defaultScriptureProvider } from '../lib/scripture/providers';
import { chapterCacheKey, getCachedVerseCount, saveCachedVerseCount } from '../lib/scripture/chapterCache';

type Status = 'idle' | 'loading' | 'ready' | 'unavailable';

/**
 * How long a chapter has to stand still before it is worth asking about.
 *
 * Long enough to type the rest of a chapter number, short enough that arriving
 * at a reference and looking down finds the chips already there.
 */
export const VERSE_HINT_DEBOUNCE_MS = 400;

/**
 * Provider-assisted verse hint: the highest verse number in a book+chapter, used
 * to render verse chips. Fetches only when `enabled` (gated behind an explicit
 * chapter pick, never the prefilled default), caches per translation, and
 * **degrades silently** — a failed/slow/offline fetch surfaces no error and never
 * blocks Lookup or Take; the operator just types the verse instead.
 */
export function useChapterVerses(
  book: string | null,
  chapter: number | undefined,
  translation: string,
  enabled: boolean
) {
  const [verseCount, setVerseCount] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const requestId = useRef(0);

  useEffect(() => {
    setVerseCount(null);
    if (!enabled || !book || !chapter || !defaultScriptureProvider.fetchChapterVerseCount) {
      setStatus('idle');
      return;
    }

    const key = chapterCacheKey(defaultScriptureProvider.id, translation, book, chapter);
    const cached = getCachedVerseCount(key);
    if (cached && cached > 0) {
      setVerseCount(cached);
      setStatus('ready');
      return;
    }

    const id = ++requestId.current;
    setStatus('loading');
    /**
     * DEBOUNCED, because typing a reference is now one of the ways to ask.
     *
     * The gate used to be satisfied only by a chapter tap — one chapter, one
     * probe. Now that typing counts, "Psalm 119" passes through Psalm 1 and
     * Psalm 11 on the way, and each is a DIFFERENT chapter so the per-chapter
     * cache does not absorb them: three real requests to a service that
     * rate-limits at roughly fifteen per thirty seconds per IP, shared by every
     * operator on the LAN, to answer two questions nobody asked.
     *
     * The cache hit above stays immediate — it costs nothing and there is
     * nothing to spare. Only the network call waits.
     */
    const timer = setTimeout(() => {
      defaultScriptureProvider
        .fetchChapterVerseCount?.(book, chapter, translation)
        .then((count) => {
          if (requestId.current !== id) return;
          if (count > 0) {
            saveCachedVerseCount(key, count);
            setVerseCount(count);
            setStatus('ready');
          } else {
            setStatus('unavailable');
          }
        })
        .catch(() => {
          if (requestId.current !== id) return;
          setStatus('unavailable');
        });
    }, VERSE_HINT_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [book, chapter, translation, enabled]);

  return { verseCount, status };
}
