import { describe, expect, it } from 'vitest';
import { getBibleProvider } from './getBibleProvider';
import { availableTranslations, providerForTranslation } from './providers';

const NBSP = '\u00a0';

/** John 3, as the service returns it — trimmed to the verses these tests use. */
const JOHN_3 = {
  translation: 'Louis Segond (1910)',
  abbreviation: 'ls1910',
  book_nr: 43,
  book_name: 'Jean',
  chapter: 3,
  verses: [
    { chapter: 3, verse: 15, name: 'Jean 3:15', text: 'afin que quiconque croit en lui ait la vie éternelle. ' },
    { chapter: 3, verse: 16, name: 'Jean 3:16', text: 'Car Dieu a tant aimé le monde\nqu’il a donné son Fils unique. ' },
    { chapter: 3, verse: 17, name: 'Jean 3:17', text: 'Dieu, en effet, n’a pas envoyé son Fils dans le monde pour qu’il juge le monde. ' }
  ]
};

const respond = (body: unknown, ok = true, status = 200) =>
  (async (url: string) => {
    seenUrl = url;
    return { ok, status, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;

let seenUrl = '';

/**
 * The Louis Segond of 1910, in French, with no key.
 *
 * Tested through the injected transport the provider interface already takes,
 * the same reason `esvApiProvider.test.ts` does: no network, no quota, and a
 * suite that passes on a machine with the Wi-Fi off.
 */
describe('the French provider', () => {
  it('routes to the text that was ASKED FOR, not always the first', async () => {
    /**
     * `lookup` ignored its translation argument entirely and always served the
     * LSG. Correct while there was one, and it would have put French on screen
     * for an operator who picked the AKJV the moment a second arrived — silently,
     * because a verse is a verse until you read it.
     *
     * SEQUENTIAL, not `Promise.all`. `seenUrl` is one module-level spy, so two
     * concurrent lookups overwrite each other's record and the assertion reads
     * whichever finished last — which is how this test first "failed" against
     * code that was working.
     *
     * Each fixture claims its OWN abbreviation, because the mismatch guard
     * rejects a chapter served under a different translation's name.
     */
    const akjv = await getBibleProvider.lookup('John 3:16', 'akjv', {
      fetchImpl: respond({ ...JOHN_3, abbreviation: 'akjv' })
    });
    expect(seenUrl).toContain('/akjv/43/3.json');
    expect(akjv.translation).toBe('AKJV');

    const swa = await getBibleProvider.lookup('John 3:16', 'swahili', {
      fetchImpl: respond({ ...JOHN_3, abbreviation: 'swahili' })
    });
    expect(seenUrl).toContain('/swahili/43/3.json');
    expect(swa.translation).toBe('SWA');
  });

  it('counts verses against the chosen text too', async () => {
    await getBibleProvider.fetchChapterVerseCount!('John', 3, 'akjv', {
      fetchImpl: respond({ ...JOHN_3, abbreviation: 'akjv' })
    });
    expect(seenUrl).toContain('/akjv/43/3.json');
  });

  it('offers every translation in its catalogue as public domain', () => {
    const ids = getBibleProvider.translations.map((t) => t.id);
    expect(ids).toContain('lsg');
    expect(ids).toContain('akjv');
    expect(ids).toContain('swahili');
    expect(getBibleProvider.translations.every((t) => t.publicDomain)).toBe(true);
    // Each says what language it is, which is what the picker prints.
    expect(getBibleProvider.translations.every((t) => Boolean(t.language && t.name))).toBe(true);
  });

  it('offers the LSG, and says it is public domain', () => {
    const [french] = getBibleProvider.translations;
    expect(french.id).toBe('lsg');
    expect(french.label).toBe('LSG');
    expect(french.language).toBe('French');
    // Public domain is what lets a passage be cached, saved into a graphic and
    // exported inside a rundown pack with no permission question.
    expect(french.publicDomain).toBe(true);
  });

  it('is reachable from the picker, and routes back to itself', () => {
    expect(availableTranslations().map((t) => t.id)).toContain('lsg');
    expect(providerForTranslation('lsg').id).toBe('getbible');
  });

  it('asks by BOOK NUMBER, which is what this service takes', async () => {
    // It does not accept a reference string. `BIBLE_BOOKS.order` is 1–66 in
    // canonical order and is therefore already the number it means.
    await getBibleProvider.lookup('John 3:16', 'lsg', { fetchImpl: respond(JOHN_3) });
    expect(seenUrl).toContain('/ls1910/43/3.json');
  });

  it('returns the verse in French, under a French citation', async () => {
    const result = await getBibleProvider.lookup('John 3:16', 'lsg', { fetchImpl: respond(JOHN_3) });
    // A French verse under an English citation is a mismatch the viewer can see.
    expect(result.reference).toBe('Jean 3:16');
    expect(result.text).toContain('Car Dieu a tant aimé le monde');
    expect(result.translation).toBe('LSG');
    expect(result.providerId).toBe('getbible');
  });

  it('collapses the newline inside a verse without eating the verse markers', async () => {
    /**
     * `\\s` matches the non-breaking space in JavaScript, so a plain `\\s+`
     * collapse destroys the markers this provider had just written — the digits
     * survive and the character that makes them findable does not. Verse 16's
     * fixture carries a literal newline for exactly this.
     */
    const result = await getBibleProvider.lookup('John 3:15-17', 'lsg', { fetchImpl: respond(JOHN_3) });
    expect(result.text).toContain('monde qu’il a donné');
    expect(result.text).toContain(`15${NBSP}`);
    expect(result.text).toContain(`16${NBSP}`);
  });

  it('takes only the verses asked for, out of a whole chapter', async () => {
    // The service returns the entire chapter every time; the selection is ours.
    const result = await getBibleProvider.lookup('John 3:16', 'lsg', { fetchImpl: respond(JOHN_3) });
    expect(result.text).not.toContain('quiconque croit en lui ait la vie');
    expect(result.reference).toBe('Jean 3:16');
  });

  it('numbers a passage and leaves a single verse unnumbered', async () => {
    const one = await getBibleProvider.lookup('John 3:16', 'lsg', { fetchImpl: respond(JOHN_3) });
    expect(one.text.startsWith('16')).toBe(false);

    const many = await getBibleProvider.lookup('John 3:15-17', 'lsg', { fetchImpl: respond(JOHN_3) });
    expect(many.text.startsWith(`15${NBSP}`)).toBe(true);
  });

  it('refuses a chapter it was handed for a different translation', async () => {
    /**
     * The cache key is built from what was REQUESTED, so a response for another
     * translation would write one text under another's key — permanently, since
     * the cache has no TTL, and nothing downstream could detect it.
     */
    await expect(
      getBibleProvider.lookup('John 3:16', 'lsg', {
        fetchImpl: respond({ ...JOHN_3, abbreviation: 'kjv' })
      })
    ).rejects.toThrow();
  });

  it('raises a typed HTTP error so 404 and 429 can be told apart downstream', async () => {
    await expect(
      getBibleProvider.lookup('John 3:16', 'lsg', { fetchImpl: respond({}, false, 404) })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('reports a reference it cannot read in the parser’s own words', async () => {
    await expect(
      getBibleProvider.lookup('not a reference', 'lsg', { fetchImpl: respond(JOHN_3) })
    ).rejects.toThrow(/book|reference/i);
  });

  it('counts a chapter exactly, rather than probing for it', async () => {
    /**
     * The chapter arrives whole, so its length is a fact. `bible-api`'s provider
     * has to infer this and keeps a bundled table for the one-chapter books
     * where the inference misreads `Jude 1` as a verse; there is no such case
     * here.
     */
    const count = await getBibleProvider.fetchChapterVerseCount!('John', 3, 'lsg', {
      fetchImpl: respond(JOHN_3)
    });
    expect(count).toBe(17);
  });
});
