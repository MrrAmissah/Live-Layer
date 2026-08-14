import { describe, expect, it } from 'vitest';
import { createEsvProvider } from './esvApiProvider';
import { ScriptureHttpError } from './lookupOutcome';

const NBSP = ' ';

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const fakeFetch = (body: unknown, capture?: (url: string, init?: RequestInit) => void) =>
  (async (url: string, init?: RequestInit) => {
    capture?.(url, init);
    return ok(body);
  }) as unknown as typeof fetch;

/**
 * The ESV, from Crossway's own API.
 *
 * Tested through the injected transport the provider interface already takes,
 * so this suite needs no key, no network and no live quota — the same reason
 * `postToRelay` is injectable rather than patched.
 */
describe('the ESV provider', () => {
  it('offers nothing at all until a key is stored', () => {
    // A picker entry that can never work is worse than no entry, and this is
    // also what keeps the translation list unchanged on a machine that has
    // never had a key.
    expect(createEsvProvider({ apiKey: () => '' }).translations).toEqual([]);
    expect(createEsvProvider({ apiKey: () => '   ' }).translations).toEqual([]);
  });

  it('offers the ESV once there is one', () => {
    const translations = createEsvProvider({ apiKey: () => 'k' }).translations;
    expect(translations.map((t) => t.id)).toEqual(['esv']);
    // Flagged not-public-domain, which is the fact everything downstream needs.
    expect(translations[0].publicDomain).toBe(false);
  });

  it('sends the key as a token header and never in the URL', () => {
    // A key in a query string ends up in logs and in any shared screenshot.
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const provider = createEsvProvider({ apiKey: () => 'secret-key' });
    return provider
      .lookup('John 3:16', 'esv', {
        fetchImpl: fakeFetch({ canonical: 'John 3:16', passages: ['[16] For God so loved the world.'] }, (url, init) => {
          seenUrl = url;
          seenInit = init;
        })
      })
      .then(() => {
        expect(seenInit?.headers).toEqual({ Authorization: 'Token secret-key' });
        expect(seenUrl).not.toContain('secret-key');
      });
  });

  it('converts Crossway’s [16] markers into the card’s verse markers', async () => {
    const provider = createEsvProvider({ apiKey: () => 'k' });
    const result = await provider.lookup('1 Corinthians 13:4-5', 'esv', {
      fetchImpl: fakeFetch({
        canonical: '1 Corinthians 13:4–5',
        passages: ['[4] Love is patient and kind. [5] It does not insist on its own way.']
      })
    });
    expect(result.text).toBe(`4${NBSP}Love is patient and kind. 5${NBSP}It does not insist on its own way.`);
  });

  it('strips the trailing credit out of the verse itself', async () => {
    // It belongs in `attribution`, not inside the words on the card.
    const provider = createEsvProvider({ apiKey: () => 'k' });
    const result = await provider.lookup('John 3:16', 'esv', {
      fetchImpl: fakeFetch({ canonical: 'John 3:16', passages: ['[16] For God so loved the world. (ESV)'] })
    });
    expect(result.text).toBe(`16${NBSP}For God so loved the world.`);
    expect(result.attribution).toContain('Crossway');
  });

  it('reports the canonical reference the service resolved', async () => {
    // "1 cor 13 4" in, "1 Corinthians 13:4" on the card.
    const provider = createEsvProvider({ apiKey: () => 'k' });
    const result = await provider.lookup('1 cor 13 4', 'esv', {
      fetchImpl: fakeFetch({ canonical: '1 Corinthians 13:4', passages: ['[4] Love is patient.'] })
    });
    expect(result.reference).toBe('1 Corinthians 13:4');
    expect(result.translation).toBe('ESV');
    expect(result.providerId).toBe('esv-api');
  });

  it('refuses without a key rather than calling with an empty one', async () => {
    const provider = createEsvProvider({ apiKey: () => '' });
    let called = false;
    await expect(
      provider.lookup('John 3:16', 'esv', {
        fetchImpl: (async () => {
          called = true;
          return ok({});
        }) as unknown as typeof fetch
      })
    ).rejects.toThrow('esv-no-key');
    expect(called).toBe(false);
  });

  it('raises a typed HTTP error so 401 and 404 can be told apart downstream', async () => {
    const provider = createEsvProvider({ apiKey: () => 'bad' });
    await expect(
      provider.lookup('John 3:16', 'esv', {
        fetchImpl: (async () => ({ ok: false, status: 401 }) as unknown as Response) as unknown as typeof fetch
      })
    ).rejects.toBeInstanceOf(ScriptureHttpError);
  });

  it('treats an empty passage as not found rather than airing nothing', async () => {
    const provider = createEsvProvider({ apiKey: () => 'k' });
    await expect(
      provider.lookup('Nowhere 1:1', 'esv', { fetchImpl: fakeFetch({ canonical: '', passages: [] }) })
    ).rejects.toThrow();
  });

  it('reads the key at call time, so one entered mid-session works', async () => {
    // The provider is constructed once at module load; a key typed afterwards
    // must not need a reload to take effect.
    let key = '';
    const provider = createEsvProvider({ apiKey: () => key });
    expect(provider.translations).toEqual([]);
    key = 'entered-later';
    expect(provider.translations.map((t) => t.id)).toEqual(['esv']);
  });
});
