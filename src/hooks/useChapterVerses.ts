import { useEffect, useRef, useState } from 'react';
import { defaultScriptureProvider } from '../lib/scripture/providers';
import { chapterCacheKey, getCachedVerseCount, saveCachedVerseCount } from '../lib/scripture/chapterCache';

type Status = 'idle' | 'loading' | 'ready' | 'unavailable';

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
    defaultScriptureProvider
      .fetchChapterVerseCount(book, chapter, translation)
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
  }, [book, chapter, translation, enabled]);

  return { verseCount, status };
}
