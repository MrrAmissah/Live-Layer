import type {
  ScriptureLookupResult,
  ScriptureProvider,
  ScriptureProviderDeps
} from '../../types/scripture';
import { parseScriptureReference, formatSpans } from './parseReference';
import { usfmCodeFor } from './apiBibleProvider';

/**
 * Scripture served by LiveLayer itself, from files on this machine.
 *
 * ## Why one provider is not an API
 *
 * The Akuapem Twi Bible — Biblica's *Nkwa Asɛm* — is carried by none of the
 * free scripture services: not bible-api, not getbible, not bolls. Not one of
 * them has any Ghanaian language at all. The only machine-readable copy is a
 * file on eBible.org, so the choice was a vendored text or no Twi.
 *
 * It is lawful because that text is **CC BY-SA 4.0** — Biblica hold the
 * copyright and have licensed redistribution. `scripts/fetch-bible-text.mjs`
 * downloads and converts it, and records the licence beside it; this reads what
 * that script wrote.
 *
 * ## What this buys beyond Twi
 *
 * It works with the network down. Every other provider needs the internet at
 * the moment the operator asks, which in a hall on a hotspot is the moment it
 * is least likely to be there. This one is served from the same origin as the
 * app, so it answers as fast as a file read and keeps answering when nothing
 * else does.
 *
 * ## Book codes
 *
 * `usfmCodeFor` is shared with `apiBibleProvider` deliberately: the fetch
 * script normalises eBible's own codes to USFM on the way in — eBible calls
 * John `JOH` and 1 John `1JO` — so there is ONE set of book codes at runtime
 * rather than two that agree most of the time.
 */

/** Where the fetch script writes, relative to the app's own origin. */
const ROOT = '/bibles';

interface LocalText {
  id: string;
  label: string;
  name: string;
  language: string;
  attribution: string;
}

/**
 * What has been vendored. Mirrors `AVAILABLE` in `scripts/fetch-bible-text.mjs`
 * — a test pins the two together against the `about.json` that script writes,
 * because a label here that disagrees with the text on disk would put the wrong
 * name under the right words.
 */
const TEXTS: LocalText[] = [
  {
    id: 'twi',
    label: 'TWI',
    name: 'Akuapem Twi Nkwa Asɛm',
    language: 'Akuapem Twi',
    attribution:
      'Biblica® Wonhia ɛho kwamma nhoma Akuapem Twi Nkwa Asɛm™ © 1996, 2020 Biblica, Inc. CC BY-SA 4.0.'
  },
  {
    id: 'twi-asante',
    label: 'ASANTE',
    name: 'Asante Twi Nkwa Asɛm',
    language: 'Asante Twi',
    attribution:
      'Biblica® Wɔnhia ɛho kwamma nwoma Asante Twi Nkwa Asɛm™ © 1996, 2020 Biblica, Inc. CC BY-SA 4.0.'
  },
  {
    id: 'ewe',
    label: 'EWE',
    name: 'Agbenya La',
    language: 'Ewe',
    attribution:
      'Biblica® Se aɖeke mebla Biblia zazã o Agbenya La™ © 1988, 2006, 2020 Biblica, Inc. CC BY-SA 4.0.'
  }
];

/** `{ "3": { "16": "…" } }` — one file per book. */
type BookFile = Record<string, Record<string, string>>;

/**
 * Fetched once per book, then kept.
 *
 * A service reads several verses from one book, and re-reading a 200KB file for
 * each of them would be wasteful in the one place that has to be quick. The
 * browser would cache it anyway; this also skips the parse.
 */
const cache = new Map<string, BookFile>();

async function loadBook(textId: string, code: string, deps: ScriptureProviderDeps): Promise<BookFile> {
  const key = `${textId}/${code}`;
  const held = cache.get(key);
  if (held) return held;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl(`${ROOT}/${textId}/${code}.json`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('lookup-not-found');
  const book = (await response.json()) as BookFile;
  cache.set(key, book);
  return book;
}

export const localBibleProvider: ScriptureProvider = {
  id: 'local-bible',
  label: 'On this machine',
  requiresKey: false,
  translations: TEXTS.map((text) => ({
    id: text.id,
    label: text.label,
    name: text.name,
    language: text.language,
    /**
     * FALSE, and that is not a restriction — it is a fact. CC BY-SA is a
     * licence, not the public domain: Biblica hold the copyright and permit
     * redistribution on terms, which is why the attribution below travels with
     * every passage rather than being optional.
     */
    publicDomain: false
  })),

  async lookup(
    reference: string,
    translation?: string,
    deps: ScriptureProviderDeps = {}
  ): Promise<ScriptureLookupResult> {
    const text = TEXTS.find((entry) => entry.id === (translation ?? '').toLowerCase());
    if (!text) throw new Error('lookup-not-found');

    const parsed = parseScriptureReference(reference);
    if (!parsed.ok) throw new Error(parsed.message);

    const code = usfmCodeFor(parsed.reference.book);
    if (!code) throw new Error('lookup-not-found');

    const book = await loadBook(text.id, code, deps);
    const chapter = book[String(parsed.reference.chapter)];
    if (!chapter) throw new Error('lookup-not-found');

    const wanted = (verse: number) =>
      !parsed.reference.spans.length ||
      parsed.reference.spans.some((span) => verse >= span.start && verse <= span.end);

    const selected = Object.entries(chapter)
      .map(([verse, words]) => ({ n: Number(verse), words: words.trim() }))
      // Numeric, not lexical: `Object.entries` gives "10" before "9", which
      // would print a chapter in the wrong order.
      .sort((a, b) => a.n - b.n)
      .filter((entry) => Number.isFinite(entry.n) && entry.words && wanted(entry.n));

    if (!selected.length) throw new Error('lookup-not-found');

    return {
      /**
       * The citation stays in the operator's language, unlike the French and
       * Swahili providers — those services hand back a localised book name and
       * this file has none. Inventing a Twi book name would be worse than
       * printing the English one, so the reference reads `John 3:16` over Twi
       * words. A Twi name table is a separate change with a real source.
       */
      reference: `${parsed.reference.book} ${parsed.reference.chapter}${
        parsed.reference.spans.length ? `:${formatSpans(parsed.reference.spans)}` : ''
      }`,
      // Same marker rule as every other provider: a number and a non-breaking
      // space, and no marker at all for a single verse.
      text:
        selected.length < 2
          ? selected[0].words
          : selected.map((entry) => `${entry.n}\u00a0${entry.words}`).join(' '),
      translation: text.label,
      /** Required by CC BY-SA, so it rides with the passage into saved graphics. */
      attribution: text.attribution,
      providerId: 'local-bible',
      fetchedAt: new Date().toISOString()
    };
  },

  /**
   * EXACT, and free. The whole book is already in hand, so the chapter's length
   * is a count rather than a probe — no request at all after the first verse
   * from that book, which is what makes the verse grid instant here.
   */
  async fetchChapterVerseCount(
    book: string,
    chapter: number,
    translation?: string,
    deps: ScriptureProviderDeps = {}
  ): Promise<number> {
    const text = TEXTS.find((entry) => entry.id === (translation ?? '').toLowerCase());
    const code = usfmCodeFor(book);
    if (!text || !code) return 0;
    try {
      const loaded = await loadBook(text.id, code, deps);
      const verses = loaded[String(chapter)];
      if (!verses) return 0;
      return Object.keys(verses).reduce((highest, verse) => Math.max(highest, Number(verse) || 0), 0);
    } catch {
      // The picker degrades to typed inputs; nothing here is worth an error.
      return 0;
    }
  }
};
