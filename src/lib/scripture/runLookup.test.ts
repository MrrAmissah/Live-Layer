import { describe, expect, it, vi } from 'vitest';
import { runScriptureLookup, type LookupPorts } from './runLookup';
import { scriptureCacheKey } from './referenceParser';
import { ScriptureHttpError, ScriptureTranslationMismatchError } from './lookupOutcome';
import type { ScriptureLookupResult } from '../../types/scripture';

/**
 * Passage text here is a synthetic sentinel, never scripture. `<<A>>` losing to
 * `<<B>>` names which request won, which is the actual assertion; a real verse
 * would only obscure it — and would put translation text in the repo for no gain.
 */
function passage(text: string, reference = 'John 3:16', translation = 'WEB'): ScriptureLookupResult {
  return {
    reference,
    text,
    translation,
    providerId: 'bible-api',
    fetchedAt: '2026-01-01T00:00:00.000Z'
  };
}

/** A cache backed by a plain Map, so writes can be observed exactly. */
function memoryCache() {
  const entries = new Map<string, ScriptureLookupResult>();
  return {
    entries,
    getCached: async (key: string) => entries.get(key) ?? null,
    saveCached: async (key: string, result: ScriptureLookupResult) => {
      entries.set(key, result);
    }
  };
}

function ports(overrides: Partial<LookupPorts> = {}): LookupPorts {
  const cache = memoryCache();
  return {
    provider: { id: 'bible-api', lookup: async () => passage('<<DEFAULT>>') },
    getCached: cache.getCached,
    saveCached: cache.saveCached,
    isCurrent: () => true,
    ...overrides
  };
}

describe('runScriptureLookup — the happy paths', () => {
  it('canonicalises the reference before asking the provider', async () => {
    const lookup = vi.fn(async () => passage('<<A>>', '1 Corinthians 13:4-7'));
    const outcome = await runScriptureLookup('1 cor 13:4-7', 'web', ports({ provider: { id: 'bible-api', lookup } }));

    expect(outcome.kind).toBe('fresh');
    // The provider is asked for the canonical form, not the operator's shorthand,
    // so two spellings of one passage share a cache entry.
    expect(lookup).toHaveBeenCalledWith('1 Corinthians 13:4-7', 'web');
  });

  it('serves a cache hit without calling the provider, and labels it as cached', async () => {
    const cache = memoryCache();
    const key = scriptureCacheKey('bible-api', 'web', 'John 3:16');
    cache.entries.set(key, passage('<<CACHED>>'));
    const lookup = vi.fn(async () => passage('<<NETWORK>>'));

    const outcome = await runScriptureLookup('John 3:16', 'web', ports({ ...cache, provider: { id: 'bible-api', lookup } }));

    expect(outcome.kind).toBe('cached');
    expect(lookup).not.toHaveBeenCalled();
    if (outcome.kind === 'cached') expect(outcome.result.text).toBe('<<CACHED>>');
  });

  it('writes a fresh result into the cache under the canonical key', async () => {
    const cache = memoryCache();
    await runScriptureLookup('jn 3:16', 'web', ports({ ...cache, provider: { id: 'bible-api', lookup: async () => passage('<<A>>') } }));
    expect(cache.entries.get(scriptureCacheKey('bible-api', 'web', 'John 3:16'))?.text).toBe('<<A>>');
  });
});

describe('runScriptureLookup — a malformed reference never reaches the provider', () => {
  it.each([
    ['John 3:16,18 is fine, but John 3:16a is not', 'John 3:16a'],
    ['a bare book would fetch the whole book', 'John'],
    ['a backwards range', 'John 3:18-16'],
    ['a chapter the book does not have', 'John 99:1'],
    ['one stray letter', 'q 3:16']
  ])('%s', async (_why, input) => {
    const lookup = vi.fn(async () => passage('<<SHOULD NOT HAPPEN>>'));
    const outcome = await runScriptureLookup(input, 'web', ports({ provider: { id: 'bible-api', lookup } }));

    expect(outcome.kind).toBe('invalid');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('reports the reason rather than substituting a passage', async () => {
    const outcome = await runScriptureLookup('John 3:16,18', 'web', ports());
    // This one IS valid — the provider supports discontinuous selections.
    expect(outcome.kind).toBe('fresh');

    const bad = await runScriptureLookup('John 3:16a', 'web', ports());
    expect(bad.kind).toBe('invalid');
    if (bad.kind !== 'invalid') return;
    expect(bad.problem).toBe('verse-malformed');
    expect(bad.message).toContain('16a');
  });
});

describe('runScriptureLookup — stale responses', () => {
  /**
   * Genuinely interleaved. Two requests are started, the SECOND resolves first,
   * and only then does the first. Written sequentially (await A; await B) the
   * guard never engages and this suite would pass with the guard deleted —
   * verified by removing both `isCurrent()` checks, which turns the two
   * assertions below red.
   */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('discards an older response that arrives after a newer request started', async () => {
    const slow = deferred<ScriptureLookupResult>();
    const cache = memoryCache();
    let current = 'romans';

    const first = runScriptureLookup('John 3:16', 'web', {
      ...ports({ ...cache }),
      provider: { id: 'bible-api', lookup: async () => slow.promise },
      // The operator has already moved to Romans 8 by the time John resolves.
      isCurrent: () => current === 'john'
    });

    // John's response lands late.
    slow.resolve(passage('<<JOHN — TOO LATE>>'));
    const outcome = await first;

    expect(outcome.kind).toBe('stale');
  });

  it('does not cache a response it discarded as stale', async () => {
    // The bug this pins: the write ran before the staleness check, so a
    // discarded answer became the cached answer for that reference — permanently,
    // since the cache has no TTL.
    const cache = memoryCache();
    const outcome = await runScriptureLookup('John 3:16', 'web', {
      ...ports({ ...cache }),
      provider: { id: 'bible-api', lookup: async () => passage('<<STALE>>') },
      isCurrent: () => false
    });

    expect(outcome.kind).toBe('stale');
    expect(cache.entries.size).toBe(0);
    expect(cache.entries.get(scriptureCacheKey('bible-api', 'web', 'John 3:16'))).toBeUndefined();
  });

  it('discards a stale failure too, so an old error cannot overwrite a newer result', async () => {
    const outcome = await runScriptureLookup('John 3:16', 'web', {
      ...ports(),
      provider: {
        id: 'bible-api',
        lookup: async () => {
          throw new ScriptureHttpError(500);
        }
      },
      isCurrent: () => false
    });
    expect(outcome.kind).toBe('stale');
  });
});

describe('runScriptureLookup — translation isolation', () => {
  it('keys the cache per translation, so KJV never serves WEB wording', async () => {
    // Asserted as a PROPERTY — save under one translation, read under another.
    // Asserting the key string would just restate `scriptureCacheKey`.
    const cache = memoryCache();
    await runScriptureLookup('John 3:16', 'kjv', {
      ...ports({ ...cache }),
      provider: { id: 'bible-api', lookup: async () => passage('<<KJV TEXT>>', 'John 3:16', 'KJV') }
    });

    const webLookup = vi.fn(async () => passage('<<WEB TEXT>>'));
    const outcome = await runScriptureLookup('John 3:16', 'web', {
      ...ports({ ...cache }),
      provider: { id: 'bible-api', lookup: webLookup }
    });

    // A WEB request must MISS the KJV entry and go to the provider.
    expect(webLookup).toHaveBeenCalled();
    expect(outcome.kind).toBe('fresh');
    if (outcome.kind !== 'fresh') return;
    expect(outcome.result.text).toBe('<<WEB TEXT>>');
    expect(cache.entries.size).toBe(2);
  });

  it('keys the cache per provider, so two providers cannot collide', async () => {
    const cache = memoryCache();
    await runScriptureLookup('John 3:16', 'web', {
      ...ports({ ...cache }),
      provider: { id: 'provider-a', lookup: async () => passage('<<A>>') }
    });
    const bLookup = vi.fn(async () => passage('<<B>>'));
    await runScriptureLookup('John 3:16', 'web', {
      ...ports({ ...cache }),
      provider: { id: 'provider-b', lookup: bLookup }
    });

    expect(bLookup).toHaveBeenCalled();
    expect(cache.entries.size).toBe(2);
  });

  it('refuses a response whose translation is not the one requested', async () => {
    const cache = memoryCache();
    const outcome = await runScriptureLookup('John 3:16', 'kjv', {
      ...ports({ ...cache }),
      provider: {
        id: 'bible-api',
        lookup: async () => {
          throw new ScriptureTranslationMismatchError('kjv', 'web');
        }
      }
    });

    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.failure.kind).toBe('translation-mismatch');
    // Nothing written: mislabelled text in a TTL-less cache is permanent.
    expect(cache.entries.size).toBe(0);
  });
});

describe('runScriptureLookup — provider failures are told apart', () => {
  const failing = (error: unknown) => ({
    id: 'bible-api',
    lookup: async () => {
      throw error;
    }
  });

  it('maps 404 to not-found, naming the reference', async () => {
    const outcome = await runScriptureLookup('John 3:16', 'web', {
      ...ports(),
      provider: failing(new ScriptureHttpError(404))
    });
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.failure.kind).toBe('not-found');
    expect(outcome.failure.message).toContain('John 3:16');
  });

  it('maps 429 to rate-limited and tells the operator to wait rather than retry', async () => {
    const outcome = await runScriptureLookup('John 3:16', 'web', {
      ...ports(),
      provider: failing(new ScriptureHttpError(429))
    });
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.failure.kind).toBe('rate-limited');
    expect(outcome.failure.message.toLowerCase()).toContain('wait');
  });

  it('maps 5xx to provider-unavailable', async () => {
    const outcome = await runScriptureLookup('John 3:16', 'web', {
      ...ports(),
      provider: failing(new ScriptureHttpError(503))
    });
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.failure.kind).toBe('provider-unavailable');
  });

  it('a 200 with no passage is not-found, not a success', async () => {
    const outcome = await runScriptureLookup('John 3:16', 'web', {
      ...ports(),
      provider: failing(new Error('lookup-not-found'))
    });
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.failure.kind).toBe('not-found');
  });

  it('blames the network, not the service, when the machine is offline', async () => {
    // A fetch on a disconnected machine rejects with a bare TypeError; reporting
    // "the Bible service is down" sends the operator debugging the wrong thing.
    const outcome = await runScriptureLookup('John 3:16', 'web', {
      ...ports(),
      provider: failing(new TypeError('Failed to fetch')),
      online: false
    });
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.failure.kind).toBe('offline');
  });

  it('a failed lookup writes nothing to the cache', async () => {
    const cache = memoryCache();
    await runScriptureLookup('John 3:16', 'web', {
      ...ports({ ...cache }),
      provider: failing(new ScriptureHttpError(500))
    });
    expect(cache.entries.size).toBe(0);
  });
});
