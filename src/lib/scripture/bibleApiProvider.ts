import type { ScriptureLookupResult, ScriptureProvider } from '../../types/scripture';
import { normalizeScriptureReference } from './referenceParser';

interface BibleApiResponse {
  reference?: string;
  text?: string;
  translation_id?: string;
  translation_name?: string;
  translation_note?: string;
  error?: string;
  verses?: { verse?: number }[];
}

function cleanVerseText(text?: string) {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

export const bibleApiProvider: ScriptureProvider = {
  id: 'bible-api',
  label: 'Bible API',
  requiresKey: false,
  translations: [
    { id: 'web', label: 'WEB', publicDomain: true },
    { id: 'kjv', label: 'KJV', publicDomain: true }
  ],
  async lookup(reference, translation = 'web'): Promise<ScriptureLookupResult> {
    const normalized = normalizeScriptureReference(reference);
    if (!normalized) {
      throw new Error('reference-required');
    }

    const url = new URL(`https://bible-api.com/${encodeURIComponent(normalized)}`);
    url.searchParams.set('translation', translation.toLowerCase());
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`lookup-failed-${response.status}`);
    }

    const data = (await response.json()) as BibleApiResponse;
    if (data.error || !data.text) {
      throw new Error(data.error || 'lookup-not-found');
    }

    const translationLabel = (data.translation_id || translation).toUpperCase();
    return {
      reference: data.reference || normalized,
      text: cleanVerseText(data.text),
      translation: translationLabel,
      attribution: data.translation_note || data.translation_name,
      providerId: bibleApiProvider.id,
      fetchedAt: new Date().toISOString()
    };
  },
  async fetchChapterVerseCount(book, chapter, translation = 'web'): Promise<number> {
    const url = new URL(`https://bible-api.com/${encodeURIComponent(`${book} ${chapter}`)}`);
    url.searchParams.set('translation', translation.toLowerCase());
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`chapter-failed-${response.status}`);
    const data = (await response.json()) as BibleApiResponse;
    const numbers = (data.verses ?? [])
      .map((verse) => verse.verse)
      .filter((value): value is number => typeof value === 'number');
    // Guard: empty/garbled responses must not yield -Infinity.
    return numbers.length ? Math.max(...numbers) : 0;
  }
};
