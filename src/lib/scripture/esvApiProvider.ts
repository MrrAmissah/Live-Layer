import type {
  ScriptureLookupResult,
  ScriptureProvider,
  ScriptureProviderDeps
} from '../../types/scripture';
import { ScriptureHttpError } from './lookupOutcome';

/**
 * The ESV, from Crossway's own API.
 *
 * WHY A SECOND PROVIDER AND NOT A LINE IN THE FIRST. `bible-api.com` serves
 * public-domain texts only — its catalogue declares every translation "Public
 * Domain" and an ESV request 404s there. Modern translations are not missing
 * from that list by oversight; they are not that service's to give.
 *
 * Copies of these texts are certainly findable, and this is a church displaying
 * scripture in worship rather than anyone selling anything. Both of those are
 * true, and neither is what decides it: what decides it is that Crossway hand
 * out API access for exactly this use, for free, so the licensed route costs a
 * two-minute registration and removes the question entirely. The key is the
 * whole difference between a text this app is entitled to show and a copy it
 * merely has.
 *
 * ## What this does not do
 *
 * It does not bundle a Bible. Nothing is vendored into the repository, so
 * nothing is redistributed by cloning it — which matters because this app
 * EXPORTS rundown packs, and a pack carries the verse text inside it. A live
 * lookup against a licensed API is display; a copyrighted text committed to a
 * repo and shipped inside an export is publishing, and only one of those is
 * covered by "we are a church and it is free".
 *
 * ## The key
 *
 * Held in this browser's storage, never committed, never sent anywhere but
 * Crossway. With no key this provider reports no translations at all and the
 * picker simply does not offer the ESV — absence rather than a broken option.
 */

const ESV_ENDPOINT = 'https://api.esv.org/v3/passage/text/';

/** Verse numbers arrive as `[16] `; the card wants `16` + NBSP. */
function toMarkers(text: string): string {
  return text.replace(/\[(\d+)\]\s*/g, (_match, n: string) => `${n} `);
}

/**
 * Crossway returns footnote markers and headings the card has no room for, and
 * a trailing "(ESV)" credit that would sit inside the verse. Strip them here
 * so nothing downstream has to know this provider's habits.
 */
function cleanPassage(raw: string): string {
  /**
   * EVERY PATTERN HERE EXCLUDES THE NON-BREAKING SPACE, and that is not
   * fussiness. In JavaScript `\s` matches `\u00a0`, so a plain
   * `.replace(/\s+/g, ' ')` collapse quietly ate the verse markers this
   * provider had just written — the numbers survived, the character that makes
   * them findable did not, and the card would have rendered them as ordinary
   * digits in the sentence. `[^\S\u00a0]` is "whitespace, but not that one".
   */
  const SPACE = '[^\\S\\u00a0]';
  return toMarkers(raw)
    .replace(new RegExp(`\\(ESV\\)${SPACE}*$`), '')
    .replace(new RegExp(`${SPACE}*\\(\\d+\\)${SPACE}*`, 'g'), ' ')
    .replace(new RegExp(`${SPACE}+`, 'g'), ' ')
    .trim();
}

export interface EsvProviderOptions {
  /** Read at call time, so a key entered mid-session works without a reload. */
  apiKey: () => string;
}

export function createEsvProvider({ apiKey }: EsvProviderOptions): ScriptureProvider {
  const hasKey = () => apiKey().trim().length > 0;

  return {
    id: 'esv-api',
    label: 'ESV (Crossway)',
    requiresKey: true,
    /**
     * Empty without a key, so the ESV never appears as an option that cannot
     * work. A picker entry that always fails is worse than no entry.
     */
    get translations() {
      return hasKey()
        ? [
            {
              id: 'esv',
              label: 'ESV',
              name: 'English Standard Version',
              language: 'English',
              publicDomain: false
            }
          ]
        : [];
    },

    async lookup(
      reference: string,
      _translation?: string,
      deps: ScriptureProviderDeps = {}
    ): Promise<ScriptureLookupResult> {
      const key = apiKey().trim();
      if (!key) throw new Error('esv-no-key');

      const fetchImpl = deps.fetchImpl ?? fetch;
      const url = new URL(ESV_ENDPOINT);
      url.searchParams.set('q', reference);
      // Verse numbers ON: they are what the card sets as superscripts.
      url.searchParams.set('include-verse-numbers', 'true');
      // Everything else OFF — the card shows a passage, not a page of a Bible.
      for (const flag of [
        'include-headings',
        'include-footnotes',
        'include-footnote-body',
        'include-short-copyright',
        'include-passage-references',
        'include-first-verse-numbers'
      ]) {
        url.searchParams.set(flag, 'false');
      }

      const response = await fetchImpl(url.toString(), {
        headers: { Authorization: `Token ${key}` }
      });
      if (!response.ok) throw new ScriptureHttpError(response.status);

      const data = (await response.json()) as {
        canonical?: string;
        passages?: string[];
        detail?: string;
      };
      const passage = (data.passages ?? []).join(' ').trim();
      if (!passage) throw new Error(data.detail || 'lookup-not-found');

      return {
        reference: data.canonical || reference,
        text: cleanPassage(passage),
        translation: 'ESV',
        /**
         * Crossway require the credit. It rides with the passage rather than
         * being pasted on later, so a saved graphic keeps it.
         */
        attribution: 'Scripture quotations are from the ESV® Bible, © 2001 Crossway.',
        providerId: 'esv-api',
        fetchedAt: new Date().toISOString()
      };
    },

    /**
     * `fetchChapterVerseCount` is deliberately NOT implemented.
     *
     * The picker asks providers how many verses a chapter holds so it can draw
     * the chips. Crossway's text endpoint does not answer that, and a guessed
     * count would draw chips for verses that do not exist. The interface makes
     * it optional and the picker degrades to its typed inputs, which is the
     * honest behaviour for a provider that cannot say.
     */
  };
}
