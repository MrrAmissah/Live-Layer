import type {
  ScriptureLookupResult,
  ScriptureProvider,
  ScriptureProviderDeps
} from '../../types/scripture';
import { ScriptureHttpError } from './lookupOutcome';
import { getBibleBook } from './bibleBooks';
import { parseScriptureReference, formatSpans, type VerseSpan } from './parseReference';

/**
 * French scripture — the Louis Segond of 1910, from getbible.net.
 *
 * ## Why a third provider and not a row in the first
 *
 * `bible-api.com` carries no French at all. Its `/data` catalogue lists
 * seventeen translations across seven languages and not one of them is French,
 * so this is not a line that could be added there — it is a different service or
 * nothing. Checked, not assumed.
 *
 * getbible.net serves the Segond 1910 with **no key and no account**, which
 * keeps French on the same footing as every other public-domain text here: it
 * appears in the picker for anyone who opens the app, with no registration step
 * that an operator would meet for the first time on a Sunday. That is the whole
 * reason it was chosen over API.Bible, which also carries the LSG but behind a
 * key — the ESV already occupies the "needs a key" slot and one is enough.
 *
 * The 1910 Segond is public domain, so a passage may be cached, saved into a
 * graphic and exported inside a rundown pack with no permission question, the
 * same as the WEB or the KJV.
 *
 * ## A different shape of API, absorbed here
 *
 * This service does not take a reference string. It takes a BOOK NUMBER and a
 * chapter and returns the whole chapter, so the parsing that `bible-api.com`
 * does on its side happens on ours: `parseScriptureReference` for the locator,
 * `BIBLE_BOOKS.order` for the number — which is 1–66 in canonical order and
 * therefore already exactly what this API means by a book number — and the verse
 * selection by slicing what comes back.
 *
 * That has one happy consequence. `fetchChapterVerseCount` is EXACT here rather
 * than probed: the chapter arrives whole, so its length is a fact rather than an
 * inference, and the picker's verse chips need no separate request.
 *
 * ## What comes back is French, including the reference
 *
 * The operator types `John 3:16` — the picker's book names are English and the
 * parser knows only those — and the card reads `Jean 3:16`, because the service
 * returns the French book name and a French verse under an English citation
 * would be a mismatch on air. Typing `Jean` does not yet work; that needs French
 * aliases in `BIBLE_BOOKS` and is a separate change.
 */

const ENDPOINT = 'https://api.getbible.net/v2';

/**
 * What this provider serves, and the slug each one has on the service.
 *
 * OUR ID IS NOT THEIR SLUG, deliberately. `lsg` is what a French congregation
 * calls that Bible and what belongs on the card; `ls1910` is an implementation
 * detail of one API. Keeping them apart means the label on air does not change
 * if the service renames a slug, and the id stored inside a saved graphic stays
 * meaningful if the text ever comes from somewhere else.
 *
 * Every entry was fetched and read before being listed — the names and languages
 * come from the service's own catalogue rather than from memory, and John 3:16
 * was pulled in each to confirm it returns real text rather than an empty
 * chapter.
 *
 * Public domain, all of them, which is what lets a passage be cached, saved into
 * a graphic and exported inside a rundown pack with no permission question.
 */
interface GetBibleTranslation {
  id: string;
  slug: string;
  label: string;
  name: string;
  language: string;
}

const CATALOGUE: GetBibleTranslation[] = [
  { id: 'lsg', slug: 'ls1910', label: 'LSG', name: 'Louis Segond (1910)', language: 'French' },
  /* The King James with modern spelling — "you" for "thee", no "-eth" endings.
     Easier to read aloud than the 1611 while keeping the wording the church
     knows, which is why it sits beside the KJV rather than replacing it. */
  { id: 'akjv', slug: 'akjv', label: 'AKJV', name: 'American King James Version', language: 'English' },
  /* The only African language this service carries. East African rather than
     West, so it is for visitors rather than for Ghana — there is no Twi, Akan,
     Ewe or Ga here, and that was checked rather than assumed. */
  { id: 'swahili', slug: 'swahili', label: 'SWA', name: 'Swahili Bible', language: 'Swahili' }
];

const slugFor = (translationId?: string): string | undefined =>
  CATALOGUE.find((entry) => entry.id === (translationId ?? '').toLowerCase())?.slug;

interface GetBibleVerse {
  chapter?: number;
  verse?: number;
  name?: string;
  text?: string;
}

interface GetBibleChapter {
  translation?: string;
  abbreviation?: string;
  book_nr?: number;
  book_name?: string;
  chapter?: number;
  verses?: GetBibleVerse[];
}

/**
 * Collapse whitespace WITHOUT touching the non-breaking space.
 *
 * In JavaScript `\s` matches U+00A0, so a plain `.replace(/\s+/g, ' ')` eats
 * the verse markers this file is about to write — the digits survive and the
 * character that makes them findable does not, and the card renders them as
 * ordinary numbers inside the sentence. The same trap is documented at length in
 * `esvApiProvider.ts`; it is repeated here because the fix is invisible.
 */
function clean(text?: string): string {
  return (text ?? '').replace(/[^\S\u00a0]+/g, ' ').trim();
}

/** Is this verse inside any requested span? Empty spans mean the whole chapter. */
function wanted(verse: number, spans: VerseSpan[]): boolean {
  if (!spans.length) return true;
  return spans.some((span) => verse >= span.start && verse <= span.end);
}

/**
 * The passage as a printed Bible sets it. Same rule as the other providers: a
 * marker is a number followed by a NON-BREAKING space, and a single verse gets
 * none — a lone "16" before one sentence is noise, not apparatus.
 */
function passageText(verses: { n: number; text: string }[]): string {
  if (verses.length < 2) return verses[0]?.text ?? '';
  return verses.map((verse) => `${verse.n}\u00a0${verse.text}`).join(' ');
}

export const getBibleProvider: ScriptureProvider = {
  id: 'getbible',
  label: 'getbible.net',
  requiresKey: false,
  translations: CATALOGUE.map((entry) => ({
    id: entry.id,
    label: entry.label,
    name: entry.name,
    language: entry.language,
    publicDomain: true
  })),

  async lookup(
    reference: string,
    translation?: string,
    deps: ScriptureProviderDeps = {}
  ): Promise<ScriptureLookupResult> {
    /* Which text was asked for. It used to ignore the argument entirely and
       always serve the LSG, which was correct while there was one and would
       have silently put French on screen for someone who picked the AKJV. */
    const wantedTranslation =
      CATALOGUE.find((entry) => entry.id === (translation ?? '').toLowerCase()) ?? CATALOGUE[0];
    const parsed = parseScriptureReference(reference);
    if (!parsed.ok) {
      // The parser's own words: it says which part it could not read, and the
      // panel already renders that sentence.
      throw new Error(parsed.message);
    }

    const book = getBibleBook(parsed.reference.book);
    if (!book) throw new Error('lookup-not-found');

    const fetchImpl = deps.fetchImpl ?? fetch;
    const response = await fetchImpl(
      `${ENDPOINT}/${wantedTranslation.slug}/${book.order}/${parsed.reference.chapter}.json`,
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) throw new ScriptureHttpError(response.status);

    const data = (await response.json()) as GetBibleChapter;

    /**
     * The same guard `bible-api` carries, for the same reason: the cache key is
     * built from what we REQUESTED, so a response for a different translation
     * would write one text under another's key, permanently — the cache has no
     * TTL and nothing downstream could detect it.
     */
    const received = (data.abbreviation ?? '').toLowerCase();
    if (received && received !== wantedTranslation.slug) throw new Error('lookup-not-found');

    const selected = (data.verses ?? [])
      .map((verse) => ({ n: verse.verse ?? 0, text: clean(verse.text) }))
      .filter((verse) => verse.n > 0 && verse.text.length > 0 && wanted(verse.n, parsed.reference.spans));

    if (!selected.length) throw new Error('lookup-not-found');

    /**
     * The citation in the language of the text. A French passage under `John
     * 3:16` is a mismatch the viewer can see; the service hands back `Jean`, so
     * that is what goes on the card. The spans are re-formatted rather than
     * taken from the request so that `Jean 3:16-18` reads as the operator asked
     * for it, and a whole chapter has no verse part at all.
     */
    const frenchBook = data.book_name?.trim() || parsed.reference.book;
    const locator = parsed.reference.spans.length ? `:${formatSpans(parsed.reference.spans)}` : '';

    return {
      reference: `${frenchBook} ${parsed.reference.chapter}${locator}`,
      text: passageText(selected),
      translation: wantedTranslation.label,
      attribution: `${wantedTranslation.name} — public domain.`,
      providerId: 'getbible',
      fetchedAt: new Date().toISOString()
    };
  },

  /**
   * Exact, not probed.
   *
   * `bible-api.com` cannot be asked how long a chapter is, so its provider
   * infers it from a request for the whole chapter and keeps a bundled table for
   * the one-chapter books where that inference misreads `Jude 1` as a verse.
   * This service returns the chapter whole, so the count is simply its length —
   * no special case, and no second request.
   */
  async fetchChapterVerseCount(
    book: string,
    chapter: number,
    translation?: string,
    deps: ScriptureProviderDeps = {}
  ): Promise<number> {
    const meta = getBibleBook(book);
    const slug = slugFor(translation) ?? CATALOGUE[0].slug;
    if (!meta) return 0;
    const fetchImpl = deps.fetchImpl ?? fetch;
    const response = await fetchImpl(`${ENDPOINT}/${slug}/${meta.order}/${chapter}.json`, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return 0;
    const data = (await response.json()) as GetBibleChapter;
    return (data.verses ?? []).reduce((highest, verse) => Math.max(highest, verse.verse ?? 0), 0);
  }
};
