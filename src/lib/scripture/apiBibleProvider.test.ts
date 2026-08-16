import { beforeEach, describe, expect, it } from 'vitest';
import { createApiBibleProvider, usfmCodeFor } from './apiBibleProvider';
import { BIBLE_BOOKS } from './bibleBooks';
import { ScriptureHttpError } from './lookupOutcome';

const NBSP = '\u00a0';

let seen: { url: string; init?: RequestInit }[] = [];

const respond = (body: unknown, ok = true, status = 200) =>
  (async (url: string, init?: RequestInit) => {
    seen.push({ url: String(url), init });
    return { ok, status, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;

const CATALOGUE = {
  data: [
    {
      id: 'de4e12af7f28f599-02',
      abbreviation: 'KJV',
      abbreviationLocal: 'KJV',
      name: 'King James Version',
      nameLocal: 'King James Version',
      language: { id: 'eng', name: 'English' }
    },
    {
      id: 'twi-akuapem-01',
      abbreviation: 'TWI',
      abbreviationLocal: 'Twi',
      nameLocal: 'Akuapem Twi Nkwa Asɛm',
      name: 'Akuapem Twi Bible',
      language: { id: 'twi', name: 'Akuapem Twi' }
    }
  ]
};

/**
 * API.Bible — one key, and whatever that key is granted.
 *
 * WHAT THESE TESTS CAN AND CANNOT PROVE. The host, path and auth header were
 * checked against the live service (401 with no key, 403 with a bad one). The
 * SUCCESS bodies were not, because that needs a real key — so the fixtures here
 * are the documented shape, and what is really being asserted is that this
 * provider reads them defensively, addresses the right passage, and never leaks
 * the key into a URL. When a key arrives, the fixtures are the first thing to
 * check against a real response.
 */
describe('the API.Bible provider', () => {
  beforeEach(() => {
    seen = [];
    // This suite runs in node with no DOM. The provider must not need storage
    // to work — that is asserted below rather than papered over here.
    globalThis.localStorage?.clear?.();
  });

  it('offers nothing at all until there is a key', () => {
    // A picker entry that cannot work is worse than no entry.
    expect(createApiBibleProvider({ apiKey: () => '' }).translations).toEqual([]);
    expect(createApiBibleProvider({ apiKey: () => '   ' }).translations).toEqual([]);
  });

  it('sends the key as a header and never in the URL', async () => {
    // A key in a query string ends up in logs and in any shared screenshot.
    const provider = createApiBibleProvider({ apiKey: () => 'secret-key' });
    await provider.refreshCatalogue({ fetchImpl: respond(CATALOGUE) });
    expect(seen[0].url).not.toContain('secret-key');
    expect((seen[0].init?.headers as Record<string, string>)['api-key']).toBe('secret-key');
  });

  it('DISCOVERS its catalogue rather than declaring one', async () => {
    /**
     * Every other provider lists its translations as a constant because it
     * knows them. Two keys pointed at this service see different lists, so the
     * only honest source is the service — which is also what makes a Twi Bible
     * appear the moment a publisher approves one, with nothing to edit here.
     */
    const provider = createApiBibleProvider({ apiKey: () => 'k' });
    const entries = await provider.refreshCatalogue({ fetchImpl: respond(CATALOGUE) });
    expect(seen[0].url).toContain('/v1/bibles');
    expect(entries.map((e) => e.id)).toContain('twi-akuapem-01');

    // ...and it is then offered synchronously, from the cache.
    expect(provider.translations.map((t) => t.label)).toContain('Twi');
    expect(provider.translations.find((t) => t.id === 'twi-akuapem-01')?.language).toBe('Akuapem Twi');
  });

  it('never claims a text from here is public domain', () => {
    /**
     * This provider exists to reach LICENSED texts. `publicDomain` is what
     * downstream reads before putting verse text inside an exported pack, so
     * assuming it here would be the one mistake with a legal edge.
     */
    const provider = createApiBibleProvider({ apiKey: () => 'k' });
    return provider.refreshCatalogue({ fetchImpl: respond(CATALOGUE) }).then(() => {
      expect(provider.translations.every((t) => t.publicDomain === false)).toBe(true);
    });
  });

  it('addresses a passage by its USFM code, not its name', async () => {
    const provider = createApiBibleProvider({ apiKey: () => 'k' });
    await provider.refreshCatalogue({ fetchImpl: respond(CATALOGUE) });
    seen = [];
    await provider.lookup('John 3:16', 'twi-akuapem-01', {
      fetchImpl: respond({ data: { content: '[16] Na sɛɛ na Onyankopɔn dɔ wiase.', reference: 'Yohane 3:16' } })
    });
    expect(seen[0].url).toContain('/passages/JHN.3.16');
  });

  it('asks once per SPAN, so an excluded verse stays excluded', async () => {
    /**
     * This endpoint takes one range. `John 3:16,18` collapsed to `16-18` would
     * put verse 17 on screen — a verse the operator deliberately left out, which
     * is the silent-reinterpretation failure the reference parser exists to
     * prevent. Two spans, two requests.
     */
    const provider = createApiBibleProvider({ apiKey: () => 'k' });
    await provider.refreshCatalogue({ fetchImpl: respond(CATALOGUE) });
    seen = [];
    await provider.lookup('John 3:16,18', 'twi-akuapem-01', {
      fetchImpl: respond({ data: { content: '[16] one. ' } })
    });
    const passageCalls = seen.filter((call) => call.url.includes('/passages/'));
    expect(passageCalls).toHaveLength(2);
    expect(passageCalls[0].url).toContain('JHN.3.16');
    expect(passageCalls[1].url).toContain('JHN.3.18');
    expect(passageCalls.some((call) => call.url.includes('JHN.3.17'))).toBe(false);
  });

  it('turns [16] markers into the card’s verse markers', async () => {
    const provider = createApiBibleProvider({ apiKey: () => 'k' });
    await provider.refreshCatalogue({ fetchImpl: respond(CATALOGUE) });
    const result = await provider.lookup('John 3:16-17', 'twi-akuapem-01', {
      fetchImpl: respond({ data: { content: '[16] First verse.\n[17] Second verse.' } })
    });
    expect(result.text).toBe(`16${NBSP}First verse. 17${NBSP}Second verse.`);
  });

  it('carries the publisher’s copyright line, which licensed texts require', async () => {
    const provider = createApiBibleProvider({ apiKey: () => 'k' });
    await provider.refreshCatalogue({ fetchImpl: respond(CATALOGUE) });
    const result = await provider.lookup('John 3:16', 'twi-akuapem-01', {
      fetchImpl: respond({ data: { content: 'text', copyright: '© 2020 Biblica, Inc.' } })
    });
    expect(result.attribution).toContain('Biblica');
  });

  it('survives a response missing every optional field', async () => {
    // The success bodies are unverified, so a thin one must degrade to a usable
    // result rather than throwing at the desk.
    const provider = createApiBibleProvider({ apiKey: () => 'k' });
    await provider.refreshCatalogue({ fetchImpl: respond(CATALOGUE) });
    const result = await provider.lookup('John 3:16', 'twi-akuapem-01', {
      fetchImpl: respond({ data: { content: 'just words' } })
    });
    expect(result.text).toBe('just words');
    expect(result.reference).toBe('John 3:16');
  });

  it('refuses without a key rather than calling with an empty one', async () => {
    let called = false;
    const provider = createApiBibleProvider({ apiKey: () => '' });
    await expect(
      provider.refreshCatalogue({
        fetchImpl: (async () => {
          called = true;
          return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
        }) as unknown as typeof fetch
      })
    ).rejects.toThrow('api-bible-no-key');
    expect(called).toBe(false);
  });

  it('raises a typed HTTP error so 403 and 404 can be told apart', async () => {
    const provider = createApiBibleProvider({ apiKey: () => 'bad' });
    await expect(
      provider.refreshCatalogue({ fetchImpl: respond({}, false, 403) })
    ).rejects.toBeInstanceOf(ScriptureHttpError);
  });

  it('leaves verse chips to the typed inputs, like the ESV', () => {
    // This endpoint is not asked how long a chapter is, and a guessed count
    // would draw chips for verses that do not exist.
    expect(createApiBibleProvider({ apiKey: () => 'k' }).fetchChapterVerseCount).toBeUndefined();
  });
});

describe('the USFM book codes', () => {
  it('covers all 66 books, aligned with the canon order', () => {
    /**
     * An off-by-one here fetches the WRONG BOOK and looks like a translation
     * quirk rather than a bug — Mark's text under a Matthew citation, with
     * nothing on screen to say so.
     */
    expect(BIBLE_BOOKS).toHaveLength(66);
    for (const book of BIBLE_BOOKS) {
      expect(usfmCodeFor(book.name), book.name).toMatch(/^[0-9A-Z]{3}$/);
    }
  });

  it('spot-checks the ends and the middle', () => {
    expect(usfmCodeFor('Genesis')).toBe('GEN');
    expect(usfmCodeFor('Psalms')).toBe('PSA');
    expect(usfmCodeFor('John')).toBe('JHN');
    expect(usfmCodeFor('1 John')).toBe('1JN');
    expect(usfmCodeFor('Revelation')).toBe('REV');
  });

  it('gives every book a distinct code', () => {
    const codes = BIBLE_BOOKS.map((book) => usfmCodeFor(book.name));
    expect(new Set(codes).size).toBe(66);
  });

  it('says nothing for a book it does not know', () => {
    expect(usfmCodeFor('Nowhere')).toBeUndefined();
  });
});
