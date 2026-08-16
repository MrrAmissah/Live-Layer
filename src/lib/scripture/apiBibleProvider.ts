import type {
  ScriptureLookupResult,
  ScriptureProvider,
  ScriptureProviderDeps,
  ScriptureTranslation
} from '../../types/scripture';
import { ScriptureHttpError } from './lookupOutcome';
import { getBibleBook } from './bibleBooks';
import { parseScriptureReference, formatSpans, type VerseSpan } from './parseReference';
import { loadApiBibleCatalogue, saveApiBibleCatalogue } from '../storage';

/**
 * API.Bible — one key, and whatever that key is granted.
 *
 * ## Why this exists
 *
 * The translations people actually ask for by name — NIV, NLT, NASB, MSG, CSB,
 * the Amplified — are every one of them copyrighted, and no free service
 * carries them. They are reached by applying to a publisher, and API.Bible is
 * the door most of those applications lead to: one key, one catalogue, and
 * which texts appear inside it depends on what has been approved for that
 * application. It is also the likeliest route to a **Twi** Bible, which the
 * free catalogues do not have at all — getbible and bolls carry none, and the
 * two that exist on eBible are Biblica's and are not served as an API.
 *
 * ## The catalogue is DISCOVERED, not declared
 *
 * Every other provider here lists its translations as a constant, because it
 * knows them. This one cannot: two keys pointed at the same service see
 * different lists. So it asks `/v1/bibles`, which returns exactly what the key
 * is entitled to, and offers that. Nothing has to be edited here when a
 * publisher approves another text — it simply appears.
 *
 * That fights the `ScriptureProvider` interface a little: `translations` is a
 * synchronous property and a network round trip cannot answer it during a
 * render. So the catalogue is cached in this browser and served from there,
 * refreshed by `refreshCatalogue()`. With no key and no cache it reports
 * nothing at all — absence, exactly like the ESV, rather than a picker entry
 * that cannot work.
 *
 * ## What is verified here, and what is not
 *
 * VERIFIED against the live service: the host, the path, and the auth header —
 * `/v1/bibles` answers 401 with no `api-key` and 403 with a bad one, so the
 * shape of authentication is known to be right.
 *
 * NOT VERIFIED, because it needs a real key: the success-response bodies, and
 * in particular whether verse numbers arrive as `[16]` markers. Everything that
 * reads a body is therefore defensive — missing fields degrade to a usable
 * result rather than throwing — and the marker conversion is confined to one
 * function so a single edit corrects it if the format differs. This is the one
 * piece in the scripture stack that has not been run end to end.
 */

const ENDPOINT = 'https://api.scripture.api.bible/v1';

/**
 * USFM book identifiers, in canonical order, so index + 1 is `BIBLE_BOOKS.order`.
 *
 * API.Bible addresses a passage as `JHN.3.16` rather than by name, and these
 * three-letter codes are the standard set — not this service's invention, which
 * is why they are safe to write down without a key to check them against. A
 * test pins the length at 66 and spot-checks the alignment, because an
 * off-by-one here would fetch the wrong book and look like a translation quirk.
 */
const USFM = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA',
  '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO',
  'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO',
  'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'MAT',
  'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP',
  'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE',
  '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'
] as const;

export const usfmCodeFor = (bookName: string): string | undefined => {
  const book = getBibleBook(bookName);
  return book ? USFM[book.order - 1] : undefined;
};

/** One row of the discovered catalogue, as we keep it. */
export interface ApiBibleEntry {
  /** Our translation id — the service's bible id, which is stable and unique. */
  id: string;
  label: string;
  name: string;
  language: string;
}

/**
 * Verse numbers arrive as `[16] ` in this service's text output; the card wants
 * `16` + a non-breaking space, the same marker every other provider writes.
 *
 * UNVERIFIED — see the header. If the format turns out to differ, this function
 * is the only thing to change.
 */
function toMarkers(text: string): string {
  return text.replace(/\[(\d+)\]\s*/g, (_match, n: string) => `${n}\u00a0`);
}

/**
 * Collapse whitespace WITHOUT touching the non-breaking space, because `\s`
 * matches it in JavaScript and would eat the markers written just above.
 */
function clean(text: string): string {
  return toMarkers(text)
    .replace(/[^\S\u00a0]+/g, ' ')
    .trim();
}

/** `JHN.3.16`, `JHN.3.16-JHN.3.18`, or `JHN.3` for a whole chapter. */
function passageId(code: string, chapter: number, span?: VerseSpan): string {
  if (!span) return `${code}.${chapter}`;
  if (span.start === span.end) return `${code}.${chapter}.${span.start}`;
  return `${code}.${chapter}.${span.start}-${code}.${chapter}.${span.end}`;
}

function readCachedCatalogue(): ApiBibleEntry[] {
  const raw = loadApiBibleCatalogue();
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is ApiBibleEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as ApiBibleEntry).id === 'string' &&
      typeof (entry as ApiBibleEntry).label === 'string'
  );
}

export interface ApiBibleProviderOptions {
  /** Read at call time, so a key entered mid-session works without a reload. */
  apiKey: () => string;
}

export interface ApiBibleProvider extends ScriptureProvider {
  /**
   * Ask the service what this key may read, and remember it.
   *
   * Returns the entries so a settings surface can report "12 translations
   * available" rather than leaving the operator to open the picker and count.
   */
  refreshCatalogue(deps?: ScriptureProviderDeps): Promise<ApiBibleEntry[]>;
}

export function createApiBibleProvider({ apiKey }: ApiBibleProviderOptions): ApiBibleProvider {
  const key = () => apiKey().trim();

  /**
   * The catalogue in memory, with storage as PERSISTENCE rather than as the
   * source of truth.
   *
   * It read straight from `localStorage`, which meant a browser that denies
   * storage — private mode, a locked-down kiosk, or a test environment with no
   * DOM — refreshed successfully and then offered nothing, because the write
   * was swallowed and the read came back empty. A refresh that says it worked
   * and shows no translations is the worst kind of wrong. Memory answers now;
   * storage only decides whether the answer survives a reload.
   */
  let cached: ApiBibleEntry[] | null = null;
  const catalogue = (): ApiBibleEntry[] => {
    if (cached === null) cached = readCachedCatalogue();
    return cached;
  };

  const request = async (path: string, deps: ScriptureProviderDeps) => {
    const token = key();
    if (!token) throw new Error('api-bible-no-key');
    const fetchImpl = deps.fetchImpl ?? fetch;
    const response = await fetchImpl(`${ENDPOINT}${path}`, {
      // Header, never a query string: a key in a URL ends up in logs and in any
      // screenshot the operator shares.
      headers: { 'api-key': token, Accept: 'application/json' }
    });
    if (!response.ok) throw new ScriptureHttpError(response.status);
    return (await response.json()) as { data?: unknown };
  };

  return {
    id: 'api-bible',
    label: 'API.Bible',
    requiresKey: true,

    /**
     * Whatever this key was granted, from the local cache. Empty without a key
     * — the entries belong to it, and offering a translation that cannot be
     * fetched is worse than offering none.
     */
    get translations(): ScriptureTranslation[] {
      if (!key()) return [];
      return catalogue().map((entry) => ({
        id: entry.id,
        label: entry.label,
        name: entry.name,
        language: entry.language,
        /**
         * Never assumed public domain, because these are licensed texts.
         *
         * To be accurate about what this does: NOTHING reads `publicDomain`
         * today — it is declared on the type and consumed nowhere. An earlier
         * version of this comment claimed it gated pack export, which was
         * wrong. It documents a fact about the text, and is the place to look
         * first if an export rule is ever written.
         */
        publicDomain: false
      }));
    },

    async refreshCatalogue(deps: ScriptureProviderDeps = {}): Promise<ApiBibleEntry[]> {
      const body = await request('/bibles', deps);
      const rows = Array.isArray(body.data) ? body.data : [];
      const entries: ApiBibleEntry[] = rows
        .map((row) => row as Record<string, unknown>)
        .filter((row) => typeof row.id === 'string')
        .map((row) => {
          const language = row.language as { name?: string } | undefined;
          return {
            id: String(row.id),
            // `abbreviationLocal` is the one a reader recognises; fall back
            // through the others rather than showing a bare bible id.
            label: String(row.abbreviationLocal || row.abbreviation || row.id),
            name: String(row.nameLocal || row.name || row.id),
            language: String(language?.name || 'Unknown')
          };
        });
      cached = entries;
      // Best effort. If storage refuses, the catalogue still works for this
      // session and is one refresh away after a reload.
      saveApiBibleCatalogue(entries);
      return entries;
    },

    async lookup(
      reference: string,
      translation?: string,
      deps: ScriptureProviderDeps = {}
    ): Promise<ScriptureLookupResult> {
      const bibleId = (translation ?? '').trim();
      if (!bibleId) throw new Error('lookup-not-found');

      const parsed = parseScriptureReference(reference);
      if (!parsed.ok) throw new Error(parsed.message);

      const code = usfmCodeFor(parsed.reference.book);
      if (!code) throw new Error('lookup-not-found');

      const { chapter, spans } = parsed.reference;
      const query =
        '?content-type=text&include-verse-numbers=true&include-titles=false' +
        '&include-notes=false&include-chapter-numbers=false';

      /**
       * ONE REQUEST PER SPAN, because this endpoint takes a single range.
       *
       * `John 3:16,18` is two spans, and asking for `16-18` would put verse 17
       * on screen — a verse the operator deliberately excluded. That is the
       * silent-reinterpretation failure the reference parser exists to prevent,
       * and it would be reintroduced here by one convenient shortcut. Multiple
       * spans are rare, so the extra request is cheap.
       */
      const targets = spans.length ? spans : [undefined];
      const pieces: string[] = [];
      let copyright = '';
      let resolved = '';

      for (const span of targets) {
        const body = await request(`/bibles/${encodeURIComponent(bibleId)}/passages/${passageId(code, chapter, span)}${query}`, deps);
        const data = (body.data ?? {}) as Record<string, unknown>;
        const content = typeof data.content === 'string' ? clean(data.content) : '';
        if (content) pieces.push(content);
        if (!copyright && typeof data.copyright === 'string') copyright = data.copyright.trim();
        if (!resolved && typeof data.reference === 'string') resolved = data.reference.trim();
      }

      const text = pieces.join(' ').trim();
      if (!text) throw new Error('lookup-not-found');

      const entry = catalogue().find((row) => row.id === bibleId);
      return {
        // The service's own rendering when it gave one; ours otherwise, which is
        // what happens for a multi-span reference where no single response can
        // describe the whole thing.
        reference:
          targets.length === 1 && resolved
            ? resolved
            : `${parsed.reference.book} ${chapter}${spans.length ? `:${formatSpans(spans)}` : ''}`,
        text,
        translation: entry?.label ?? bibleId,
        /**
         * The publisher's own line, carried with the passage rather than pasted
         * on later, so a saved graphic keeps it. Licensed texts generally
         * REQUIRE it on display.
         */
        attribution: copyright || entry?.name,
        providerId: 'api-bible',
        fetchedAt: new Date().toISOString()
      };
    }

    /**
     * `fetchChapterVerseCount` is deliberately NOT implemented, for the same
     * reason as the ESV's: this endpoint is not asked how long a chapter is, and
     * a guessed count would draw verse chips for verses that do not exist. The
     * interface makes it optional and the picker degrades to its typed inputs,
     * which is the honest behaviour for a provider that cannot say.
     */
  };
}
