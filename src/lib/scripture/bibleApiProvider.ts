import type { ScriptureLookupResult, ScriptureProvider } from '../../types/scripture';
import { normalizeScriptureReference } from './referenceParser';
import { ScriptureHttpError, ScriptureTranslationMismatchError } from './lookupOutcome';
import { getSingleChapterVerseCount } from './bibleStructure';

interface BibleApiResponse {
  reference?: string;
  text?: string;
  translation_id?: string;
  translation_name?: string;
  translation_note?: string;
  error?: string;
  verses?: { verse?: number; text?: string }[];
}

function cleanVerseText(text?: string) {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * The passage as a printed Bible sets it: each verse preceded by its number.
 *
 * The response has always carried per-verse structure and this provider threw
 * it away, keeping only the flat `text`. So a four-verse passage arrived as one
 * paragraph and nothing on air could show where verse 5 began.
 *
 * The marker is a NUMBER FOLLOWED BY A NON-BREAKING SPACE. `values` is a flat
 * `Record<string, string>` all the way to the renderer and the operator edits
 * this exact text in a textarea, so anything more structured would either not
 * survive the trip or would show them markup.
 *
 * The NBSP is what makes it unambiguous. A plain space would leave the renderer
 * guessing, and "40 days and 40 nights" would be sliced into a new verse; a
 * character nobody types by hand cannot collide with the text. It is invisible
 * everywhere — the textarea, the passage list, an exported pack all show
 * "4 Charity" — and it keeps the number attached to its first word, which is
 * where a printed Bible puts it.
 *
 * An operator who retypes the line loses the marker and gets plain text. That
 * is the right failure: their words, unstyled, rather than a number the layer
 * invented.
 *
 * Only used when the provider gives us the parts. A single verse gets no
 * number: it is already named by the reference above it, and a lone "1" in
 * front of one sentence reads as a list item.
 */
function numberedPassage(verses: BibleApiResponse['verses']): string | undefined {
  const parts = (verses ?? [])
    .map((verse) => ({ n: verse.verse, text: cleanVerseText(verse.text) }))
    .filter((part): part is { n: number; text: string } => typeof part.n === 'number' && part.text.length > 0);
  if (parts.length < 2) return undefined;
  return parts.map((part) => `${part.n}\u00a0${part.text}`).join(' ');
}

export const bibleApiProvider: ScriptureProvider = {
  id: 'bible-api',
  label: 'Bible API',
  requiresKey: false,
  /**
   * Every translation this provider serves, taken from its own `/data` catalogue.
   * All 17 are declared "Public Domain" by the service, which is why they can be
   * cached, stored in a saved graphic and exported inside a rundown pack without
   * a permission question. The provider echoes that string back per lookup as
   * `translation_note`, and it is what we surface as attribution.
   *
   * Every entry here was verified against the live service with a real lookup
   * before being listed. The catalogue also advertises Clementine Vulgate, Chinese
   * Union, Russian Synodal, Romanian Cornilescu, Czech Kralická and Cherokee NT —
   * they are omitted because each returns "not found" for English book names, and
   * this app's parser only ever produces canonical English names. Listing them
   * would offer a translation that cannot resolve any reference the app can build,
   * which reads to an operator as a broken service. (Almeida is kept: it does
   * resolve English book names.)
   *
   * NIV, ESV, NLT and NASB are absent because this service does not carry them at
   * all — not a policy choice here; reaching them would mean a different provider
   * with a key and its own terms.
   */
  translations: [
    { id: 'web', label: 'WEB', name: 'World English Bible', language: 'English', publicDomain: true },
    { id: 'kjv', label: 'KJV', name: 'King James Version', language: 'English', publicDomain: true },
    { id: 'asv', label: 'ASV', name: 'American Standard Version (1901)', language: 'English', publicDomain: true },
    { id: 'bbe', label: 'BBE', name: 'Bible in Basic English', language: 'English', publicDomain: true },
    { id: 'darby', label: 'DARBY', name: 'Darby Bible', language: 'English', publicDomain: true },
    { id: 'dra', label: 'DRA', name: 'Douay-Rheims 1899 American Edition', language: 'English', publicDomain: true },
    { id: 'webbe', label: 'WEBBE', name: 'World English Bible, British Edition', language: 'English', publicDomain: true },
    { id: 'oeb-us', label: 'OEB-US', name: 'Open English Bible, US Edition', language: 'English', publicDomain: true },
    { id: 'oeb-cw', label: 'OEB-CW', name: 'Open English Bible, Commonwealth Edition', language: 'English', publicDomain: true },
    {
      id: 'ylt',
      label: 'YLT',
      name: "Young's Literal Translation",
      language: 'English',
      publicDomain: true,
      partial: 'New Testament only'
    },
    { id: 'almeida', label: 'ALMEIDA', name: 'João Ferreira de Almeida', language: 'Portuguese', publicDomain: true }
  ],
  /**
   * The fallback translation is `kjv`, matching `DEFAULT_TRANSLATION_ID` in
   * `providers.ts`. Written as a literal rather than imported: `providers.ts`
   * imports THIS module, so reaching back for the constant is a cycle. The two
   * are pinned together by a test rather than by an import — no caller in the
   * app omits the argument, so this only fires for a caller that forgets, and a
   * forgetful caller should still get the translation the church reads.
   */
  async lookup(reference, translation = 'kjv', deps = {}): Promise<ScriptureLookupResult> {
    const normalized = normalizeScriptureReference(reference);
    if (!normalized) {
      throw new Error('reference-required');
    }

    // Injected rather than patched, matching `postToRelay` — assigning
    // `globalThis.fetch` in a test is not undone by `vi.restoreAllMocks()`.
    const fetchImpl = deps.fetchImpl ?? fetch;
    const url = new URL(`https://bible-api.com/${encodeURIComponent(normalized)}`);
    url.searchParams.set('translation', translation.toLowerCase());
    const response = await fetchImpl(url.toString(), {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      // Typed, so 404 / 429 / 5xx can be told apart downstream.
      throw new ScriptureHttpError(response.status);
    }

    const data = (await response.json()) as BibleApiResponse;
    if (data.error || !data.text) {
      throw new Error(data.error || 'lookup-not-found');
    }

    /**
     * The label used to be taken from the response while the cache key was built
     * from the request, so any disagreement between them would have written one
     * translation's wording under another's key — permanently, since the cache
     * has no TTL. This provider 404s on an unknown translation rather than
     * substituting (verified against the live service), so the mismatch was not
     * observed; the guard exists because the cost of being wrong is a plate that
     * reads KJV over WEB wording, and nothing downstream could detect it.
     */
    const receivedId = (data.translation_id || '').toLowerCase();
    const requestedId = translation.toLowerCase();
    if (receivedId && receivedId !== requestedId) {
      throw new ScriptureTranslationMismatchError(requestedId, receivedId);
    }

    const translationLabel = (data.translation_id || translation).toUpperCase();
    return {
      reference: data.reference || normalized,
      // Numbered when the response carried its parts; the flat text otherwise,
      // which is exactly what shipped before.
      text: numberedPassage(data.verses) ?? cleanVerseText(data.text),
      translation: translationLabel,
      attribution: data.translation_note || data.translation_name,
      providerId: bibleApiProvider.id,
      fetchedAt: new Date().toISOString()
    };
  },
  async fetchChapterVerseCount(book, chapter, translation = 'kjv', deps = {}): Promise<number> {
    /**
     * One-chapter books are answered from bundled data, not asked.
     *
     * This probe requests `${book} ${chapter}` — and in a single-chapter book the
     * provider reads `Jude 1` as Jude VERSE 1, returning one verse. So the count
     * came back as 1 and the picker offered a single verse chip for Jude, Obadiah,
     * Philemon, 2 John and 3 John. Asking for an over-wide range instead
     * (`Jude 1:1-99`) returns nothing at all, so no request yields the chapter
     * without already knowing its length. See SINGLE_CHAPTER_VERSE_COUNTS.
     */
    const bundled = getSingleChapterVerseCount(book);
    if (bundled) return bundled;

    const fetchImpl = deps.fetchImpl ?? fetch;
    const url = new URL(`https://bible-api.com/${encodeURIComponent(`${book} ${chapter}`)}`);
    url.searchParams.set('translation', translation.toLowerCase());
    const response = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new ScriptureHttpError(response.status);
    const data = (await response.json()) as BibleApiResponse;
    const numbers = (data.verses ?? [])
      .map((verse) => verse.verse)
      .filter((value): value is number => typeof value === 'number');
    // Guard: empty/garbled responses must not yield -Infinity.
    return numbers.length ? Math.max(...numbers) : 0;
  }
};
