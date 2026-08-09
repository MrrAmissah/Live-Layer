import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWorkingDraftWriter,
  clearWorkingDraft,
  readWorkingDraft,
  writeWorkingDraft,
  WORKING_DRAFT_KEY,
  WORKING_DRAFT_VERSION,
  type DraftStorage,
  type WorkingDraft
} from './workingDraft';

/**
 * The working-draft record: what the operator is PREPARING, restored across a
 * refresh, and owned by one control client.
 *
 * Two properties are load-bearing and are tested as separate claims, because
 * one cannot stand in for the other:
 *
 *  1. The record is reachable only through the storage it is handed. That is a
 *     property of this code, and these tests prove it.
 *  2. sessionStorage is scoped to one browsing context. That is a property of
 *     the browser, provable only by driving two real contexts — it belongs to
 *     QA, and no assertion here should be read as covering it.
 *
 * Validation is all-or-nothing on purpose: a partially-trusted record produces
 * an editor state the operator never created and cannot account for, which is
 * worse than the ordinary seed because it looks deliberate.
 */

const KNOWN = (id: string) => id === 'preacher-lower-third' || id === 'scripture-card';

function fakeStorage(seed?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  const storage: DraftStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    }
  };
  return { storage, map };
}

function draft(overrides: Partial<WorkingDraft> = {}): WorkingDraft {
  return {
    templateId: 'preacher-lower-third',
    values: { name: 'Rev. Ama Mensah', title: 'Guest Speaker' },
    theme: { primaryColor: '#f8fafc', accentColor: '#0E7C86', backgroundColor: 'transparent' },
    layout: { size: 'large', position: 'left' },
    durationSeconds: 8,
    ...overrides
  };
}

/** A stored envelope built by hand, so a record this build would never write
 *  can still be presented to the reader. */
function stored(body: unknown, version: unknown = WORKING_DRAFT_VERSION) {
  return { [WORKING_DRAFT_KEY]: JSON.stringify({ version, draft: body }) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('round trip', () => {
  it('restores a complete draft exactly as it was written', () => {
    const { storage } = fakeStorage();
    const original = draft();
    writeWorkingDraft(original, storage);
    expect(readWorkingDraft(KNOWN, storage)).toEqual(original);
  });

  it('restores the template, the values, the theme, the layout and the duration', () => {
    const { storage } = fakeStorage();
    writeWorkingDraft(
      draft({
        templateId: 'scripture-card',
        values: { reference: 'John 3:16', body: 'For God so loved the world' },
        theme: { primaryColor: '#ffffff', accentColor: '#123456', backgroundColor: 'transparent', accent2Color: '#abcdef' },
        layout: { size: 'small', position: 'center', density: 'bold', safeMargin: 'tight' },
        durationSeconds: 0
      }),
      storage
    );
    const restored = readWorkingDraft(KNOWN, storage);
    expect(restored?.templateId).toBe('scripture-card');
    expect(restored?.values).toEqual({ reference: 'John 3:16', body: 'For God so loved the world' });
    expect(restored?.theme).toMatchObject({ accentColor: '#123456', accent2Color: '#abcdef' });
    expect(restored?.layout).toEqual({ size: 'small', position: 'center', density: 'bold', safeMargin: 'tight' });
    expect(restored?.durationSeconds).toBe(0); // 0 = manual/off, a real choice
  });

  it('does not alias the stored record into the caller', () => {
    const { storage } = fakeStorage();
    const original = draft();
    writeWorkingDraft(original, storage);
    const restored = readWorkingDraft(KNOWN, storage);
    restored!.values.name = 'mutated';
    expect(readWorkingDraft(KNOWN, storage)?.values.name).toBe('Rev. Ama Mensah');
  });
});

describe('a record that cannot be trusted seeds instead', () => {
  it('absent', () => {
    expect(readWorkingDraft(KNOWN, fakeStorage().storage)).toBeNull();
  });

  it('corrupt JSON', () => {
    const { storage } = fakeStorage({ [WORKING_DRAFT_KEY]: '{"version":1,"draft":{' });
    expect(readWorkingDraft(KNOWN, storage)).toBeNull();
  });

  it('an unsupported schema version', () => {
    const { storage } = fakeStorage(stored(draft(), WORKING_DRAFT_VERSION + 1));
    expect(readWorkingDraft(KNOWN, storage)).toBeNull();
  });

  it('a version that is not a version at all', () => {
    const { storage } = fakeStorage(stored(draft(), '1'));
    expect(readWorkingDraft(KNOWN, storage)).toBeNull();
  });

  it('a template this build does not have', () => {
    // The realistic case: a graphic pack was removed, or the record came from a
    // newer build. Restoring the id would leave the editor on a template with
    // no renderer and no fields.
    const { storage } = fakeStorage(stored(draft({ templateId: 'template-from-the-future' })));
    expect(readWorkingDraft(KNOWN, storage)).toBeNull();
  });

  it('values that are not all strings', () => {
    const { storage } = fakeStorage(stored({ ...draft(), values: { name: 'Ama', count: 3 } }));
    expect(readWorkingDraft(KNOWN, storage)).toBeNull();
  });

  it('a theme missing a colour every renderer needs', () => {
    const { storage } = fakeStorage(stored({ ...draft(), theme: { accentColor: '#123456' } }));
    expect(readWorkingDraft(KNOWN, storage)).toBeNull();
  });

  it('a layout naming a size this build does not understand', () => {
    const { storage } = fakeStorage(stored({ ...draft(), layout: { size: 'enormous' } }));
    expect(readWorkingDraft(KNOWN, storage)).toBeNull();
  });

  it('a layout key this build does not understand', () => {
    const { storage } = fakeStorage(stored({ ...draft(), layout: { rotation: 'left' } }));
    expect(readWorkingDraft(KNOWN, storage)).toBeNull();
  });

  it('a duration that is negative, infinite, or not a number', () => {
    for (const durationSeconds of [-1, Number.POSITIVE_INFINITY, Number.NaN, '8', null]) {
      const { storage } = fakeStorage(stored({ ...draft(), durationSeconds }));
      expect(readWorkingDraft(KNOWN, storage)).toBeNull();
    }
  });

  it('an envelope with no draft in it', () => {
    const { storage } = fakeStorage(stored(null));
    expect(readWorkingDraft(KNOWN, storage)).toBeNull();
  });

  it('rejects the whole record rather than restoring the good half of it', () => {
    // The anti-partial-trust rule, stated as a test: good template, good
    // values, broken layout. Restoring template+values and silently dropping
    // the layout would put the operator in a state they never created.
    const { storage } = fakeStorage(stored({ ...draft(), layout: { position: 'diagonal' } }));
    expect(readWorkingDraft(KNOWN, storage)).toBeNull();
  });

  it('survives a storage that throws on read', () => {
    const storage: DraftStorage = {
      getItem: () => {
        throw new Error('storage disabled by policy');
      },
      setItem: () => undefined,
      removeItem: () => undefined
    };
    expect(() => readWorkingDraft(KNOWN, storage)).not.toThrow();
    expect(readWorkingDraft(KNOWN, storage)).toBeNull();
  });

  it('does nothing at all when there is no storage', () => {
    expect(readWorkingDraft(KNOWN, null)).toBeNull();
    expect(() => writeWorkingDraft(draft(), null)).not.toThrow();
    expect(() => clearWorkingDraft(null)).not.toThrow();
  });
});

describe('the asset policy is decided by key, not by reading the value', () => {
  /**
   * The rule this suite exists to hold: a sanitiser cannot tell an asset source
   * from a sentence by reading the sentence. An earlier version dropped ANY
   * value beginning with `data:` or `blob:`, which silently deleted ordinary
   * announcement text on refresh. Prose is prose whatever it starts with; only
   * the KEY says a field is an asset source.
   */

  it('round-trips ordinary text that merely looks like a URL scheme', () => {
    const { storage } = fakeStorage();
    const prose = {
      headline: 'Data: registration closes at 5 PM',
      body: 'blob: notes from the media team',
      subtitle: '   data:  spaced, still ordinary text',
      note: 'BLOB:SHOUTED AND STILL TEXT',
      quoteText: 'data:image/png;base64 — the team asked what this means'
    };
    writeWorkingDraft(draft({ values: { ...prose } }), storage);
    expect(readWorkingDraft(KNOWN, storage)?.values).toEqual(prose);
  });

  it('preserves such text byte for byte, not merely truthily', () => {
    const { storage } = fakeStorage();
    const exact = 'Data: registration closes at 5 PM';
    writeWorkingDraft(draft({ values: { headline: exact } }), storage);
    const restored = readWorkingDraft(KNOWN, storage)!.values.headline;
    expect(restored).toBe(exact);
    expect(restored.length).toBe(exact.length);
  });

  it('persists local uploaded assets by their stable ids', () => {
    const { storage, map } = fakeStorage();
    writeWorkingDraft(
      draft({ values: { name: 'Ama', headshotAssetId: 'asset-123', logoAssetId: 'asset-456' } }),
      storage
    );
    expect(readWorkingDraft(KNOWN, storage)?.values).toEqual({
      name: 'Ama',
      headshotAssetId: 'asset-123',
      logoAssetId: 'asset-456'
    });
    expect(map.get(WORKING_DRAFT_KEY)).toContain('asset-123');
  });

  it('covers a future *AssetId slot without a second list to keep in sync', () => {
    // `endsWith('AssetId')` is the convention rundownReferences.ts already uses.
    const { storage } = fakeStorage();
    writeWorkingDraft(draft({ values: { backgroundAssetId: 'asset-bg-1' } }), storage);
    expect(readWorkingDraft(KNOWN, storage)?.values).toEqual({ backgroundAssetId: 'asset-bg-1' });
  });

  it('drops the render-only resolved sources /output writes', () => {
    // Object URLs minted while rendering. Stored, they restore as broken images
    // pointing at a document that no longer exists.
    const { storage } = fakeStorage();
    writeWorkingDraft(
      draft({
        values: {
          name: 'Ama',
          logoResolvedSrc: 'blob:http://127.0.0.1:4173/9f0c',
          headshotResolvedSrc: 'https://cdn.example/headshot.png'
        }
      }),
      storage
    );
    // Dropped by KEY: note the second one is an ordinary https URL and still goes.
    expect(readWorkingDraft(KNOWN, storage)?.values).toEqual({ name: 'Ama' });
  });

  it('keeps a typed logo URL, because that is operator content', () => {
    const { storage } = fakeStorage();
    writeWorkingDraft(draft({ values: { logoUrl: 'https://church.example/logo.png' } }), storage);
    expect(readWorkingDraft(KNOWN, storage)?.values).toEqual({ logoUrl: 'https://church.example/logo.png' });
  });

  it('drops inline binary and dead object URLs from the asset-source field only', () => {
    const { storage, map } = fakeStorage();
    writeWorkingDraft(
      draft({
        values: {
          logoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
          headline: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
        }
      }),
      storage
    );
    const restored = readWorkingDraft(KNOWN, storage)!.values;
    expect(restored.logoUrl).toBeUndefined(); // asset source: not a reference
    expect(restored.headline).toBe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='); // prose: verbatim
    expect(map.get(WORKING_DRAFT_KEY)).toContain('headline');
  });

  it('drops a blob: asset id, which is dead the moment it is read back', () => {
    const { storage } = fakeStorage();
    writeWorkingDraft(draft({ values: { logoAssetId: 'blob:http://127.0.0.1:4173/dead' } }), storage);
    expect(readWorkingDraft(KNOWN, storage)?.values).toEqual({});
  });

  it('applies the same policy to a hand-edited record on the way in', () => {
    const { storage } = fakeStorage(
      stored({
        ...draft(),
        values: {
          headline: 'Data: still ordinary text',
          logoUrl: 'data:image/png;base64,AAA',
          logoResolvedSrc: 'blob:x'
        }
      })
    );
    expect(readWorkingDraft(KNOWN, storage)?.values).toEqual({ headline: 'Data: still ordinary text' });
  });

  it('lets a theme colour through untouched — a colour is never an asset key', () => {
    const { storage } = fakeStorage();
    const theme = { primaryColor: '#f8fafc', accentColor: '#E8B93C', backgroundColor: 'transparent' };
    writeWorkingDraft(draft({ theme }), storage);
    expect(readWorkingDraft(KNOWN, storage)?.theme).toEqual(theme);
  });

  it('applies the asset policy to a theme-level logoAssetId', () => {
    const { storage } = fakeStorage();
    writeWorkingDraft(
      draft({
        theme: {
          primaryColor: '#fff',
          accentColor: '#000',
          backgroundColor: 'transparent',
          logoAssetId: 'asset-theme-1'
        }
      }),
      storage
    );
    expect(readWorkingDraft(KNOWN, storage)?.theme.logoAssetId).toBe('asset-theme-1');
  });

  it('no Blob, File or other binary payload can enter the envelope', () => {
    // Values are strings by type; this is the runtime boundary that enforces it.
    // A record carrying a non-string is refused outright rather than coerced.
    const { storage } = fakeStorage(
      stored({ ...draft(), values: { name: 'Ama', logo: { size: 1024, type: 'image/png' } } })
    );
    expect(readWorkingDraft(KNOWN, storage)).toBeNull();

    // ...and on the way out, a non-string smuggled past the type system is
    // dropped rather than serialised.
    const write = fakeStorage();
    writeWorkingDraft(
      draft({ values: { name: 'Ama', logoBlob: { size: 1024 } as unknown as string } }),
      write.storage
    );
    expect(readWorkingDraft(KNOWN, write.storage)?.values).toEqual({ name: 'Ama' });
    expect(write.map.get(WORKING_DRAFT_KEY)).not.toContain('logoBlob');
  });
});

describe('one client cannot reach another client\'s record', () => {
  it('two storage contexts hold different drafts at the same key', () => {
    /**
     * This proves the CODE addresses only the storage it is handed — there is
     * no ambient second write path. It does NOT prove sessionStorage is
     * per-context; that is a browser fact and is proved in QA by driving two
     * real contexts. Two separate claims, deliberately not conflated.
     */
    const studio = fakeStorage();
    const dock = fakeStorage();

    writeWorkingDraft(draft({ templateId: 'scripture-card', values: { reference: 'Psalm 23' } }), studio.storage);
    writeWorkingDraft(draft({ templateId: 'preacher-lower-third', values: { name: 'Ama' } }), dock.storage);

    expect(readWorkingDraft(KNOWN, studio.storage)?.templateId).toBe('scripture-card');
    expect(readWorkingDraft(KNOWN, dock.storage)?.templateId).toBe('preacher-lower-third');
    expect(readWorkingDraft(KNOWN, studio.storage)?.values).toEqual({ reference: 'Psalm 23' });

    // And clearing one leaves the other entirely alone.
    clearWorkingDraft(studio.storage);
    expect(readWorkingDraft(KNOWN, studio.storage)).toBeNull();
    expect(readWorkingDraft(KNOWN, dock.storage)?.values).toEqual({ name: 'Ama' });
  });

  it('never transmits: the module reaches no realtime, relay or channel path', () => {
    // A source guard, in the style of the control-surface honesty guards. The
    // draft is local to one client; the moment this module can reach a
    // transport, two operators start overwriting each other's preparation.
    const source = readFileSync(new URL('./workingDraft.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of [
      /\bBroadcastChannel\b/,
      /\bfetch\s*\(/,
      /\bnew WebSocket\b/,
      /\bsendBeacon\b/,
      /\bcreateMessage\b/,
      /\bpublishCommand\b/,
      /\bpostToRelay\b/,
      /\.post\(/,
      /from ['"][^'"]*\/(realtime|outputAck|relayConfig)['"]/,
      /\blocalStorage\b/
    ]) {
      expect(source).not.toMatch(forbidden);
    }
    // Positive anchor: the guard is reading the real module, not an empty string.
    expect(source).toMatch(/sessionStorage/);
  });
});

describe('the debounced writer', () => {
  it('coalesces a burst of edits into one write', () => {
    vi.useFakeTimers();
    const writes: WorkingDraft[] = [];
    const writer = createWorkingDraftWriter({ write: (d) => writes.push(d), delayMs: 400 });

    for (const name of ['R', 'Re', 'Rev', 'Rev.', 'Rev. A']) {
      writer.schedule(draft({ values: { name } }));
      vi.advanceTimersByTime(50);
    }
    expect(writes).toHaveLength(0); // nothing written mid-burst

    vi.advanceTimersByTime(400);
    expect(writes).toHaveLength(1);
    expect(writes[0].values.name).toBe('Rev. A'); // the latest, not the first
  });

  it('writes again for a later, separate edit', () => {
    vi.useFakeTimers();
    const writes: WorkingDraft[] = [];
    const writer = createWorkingDraftWriter({ write: (d) => writes.push(d), delayMs: 400 });

    writer.schedule(draft({ values: { name: 'first' } }));
    vi.advanceTimersByTime(500);
    writer.schedule(draft({ values: { name: 'second' } }));
    vi.advanceTimersByTime(500);

    expect(writes.map((d) => d.values.name)).toEqual(['first', 'second']);
  });

  it('flush writes the pending draft immediately, and only once', () => {
    vi.useFakeTimers();
    const writes: WorkingDraft[] = [];
    const writer = createWorkingDraftWriter({ write: (d) => writes.push(d), delayMs: 400 });

    writer.schedule(draft({ values: { name: 'typed just before reload' } }));
    writer.flush();
    expect(writes).toHaveLength(1);

    vi.advanceTimersByTime(1000); // the cancelled timer must not fire too
    expect(writes).toHaveLength(1);
  });

  it('flush after reset writes nothing', () => {
    // Reset-then-unload must not resurrect the record reset just removed.
    vi.useFakeTimers();
    const writes: WorkingDraft[] = [];
    const clears: number[] = [];
    const writer = createWorkingDraftWriter({
      write: (d) => writes.push(d),
      clear: () => clears.push(1),
      delayMs: 400
    });

    writer.schedule(draft());
    writer.reset();
    writer.flush();
    vi.advanceTimersByTime(1000);

    expect(writes).toHaveLength(0);
    expect(clears).toHaveLength(1);
  });

  it('flush with nothing pending is a no-op', () => {
    const writes: WorkingDraft[] = [];
    const writer = createWorkingDraftWriter({ write: (d) => writes.push(d) });
    writer.flush();
    expect(writes).toHaveLength(0);
  });
});
