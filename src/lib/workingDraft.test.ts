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

describe('assets are referenced, never carried', () => {
  it('persists asset ids', () => {
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

  it('drops inline binary rather than storing image bytes', () => {
    const { storage, map } = fakeStorage();
    writeWorkingDraft(
      draft({
        values: {
          name: 'Ama',
          logoAssetId: 'asset-1',
          logoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
          headshotUrl: 'blob:http://127.0.0.1:4173/9f0c-dead-beef'
        }
      }),
      storage
    );
    const raw = map.get(WORKING_DRAFT_KEY) ?? '';
    expect(raw).not.toContain('data:image');
    expect(raw).not.toContain('blob:');
    expect(readWorkingDraft(KNOWN, storage)?.values).toEqual({ name: 'Ama', logoAssetId: 'asset-1' });
  });

  it('drops the render-time resolved sources /output writes', () => {
    // `logoResolvedSrc` is an object URL minted while rendering. Stored, it
    // restores as a broken image pointing at a document that no longer exists.
    const { storage } = fakeStorage();
    writeWorkingDraft(
      draft({ values: { name: 'Ama', logoResolvedSrc: 'blob:x', headshotResolvedSrc: 'blob:y' } }),
      storage
    );
    expect(readWorkingDraft(KNOWN, storage)?.values).toEqual({ name: 'Ama' });
  });

  it('strips inline binary a hand-edited record smuggled in', () => {
    const { storage } = fakeStorage(
      stored({ ...draft(), values: { name: 'Ama', logoUrl: 'data:image/png;base64,AAA' } })
    );
    expect(readWorkingDraft(KNOWN, storage)?.values).toEqual({ name: 'Ama' });
  });

  it('refuses a theme whose required colour is inline binary', () => {
    const { storage } = fakeStorage(
      stored({ ...draft(), theme: { primaryColor: 'data:x', accentColor: '#123456', backgroundColor: 'transparent' } })
    );
    expect(readWorkingDraft(KNOWN, storage)).toBeNull();
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
