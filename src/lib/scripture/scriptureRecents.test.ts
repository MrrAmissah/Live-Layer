import { beforeEach, describe, expect, it } from 'vitest';
import {
  readScriptureRecents,
  rememberScripturePassage,
  clearScriptureRecents,
  SCRIPTURE_RECENTS_LIMIT
} from './scriptureRecents';
import type { ScriptureLookupResult } from '../../types/scripture';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  get length() {
    return this.m.size;
  }
}

const KEY = 'livelayer.scriptureRecents';

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});

function passage(reference: string, translation = 'WEB', text = '<<TEXT>>'): ScriptureLookupResult {
  return { reference, text, translation, providerId: 'bible-api', fetchedAt: '2026-01-01T00:00:00.000Z' };
}

describe('scripture recents', () => {
  it('records an accepted passage and reads it back whole', () => {
    rememberScripturePassage(passage('John 3:16'), 'web');
    const recents = readScriptureRecents();
    expect(recents).toHaveLength(1);
    // The full result is stored, not a cache key — reopening must not depend on
    // the 50-entry lookup cache still happening to hold the entry.
    expect(recents[0].result.text).toBe('<<TEXT>>');
    expect(recents[0].result.reference).toBe('John 3:16');
    expect(recents[0].translationId).toBe('web');
  });

  it('puts the newest first', () => {
    rememberScripturePassage(passage('John 3:16'), 'web');
    rememberScripturePassage(passage('Psalms 23:1'), 'web');
    expect(readScriptureRecents().map((entry) => entry.result.reference)).toEqual(['Psalms 23:1', 'John 3:16']);
  });

  it('dedupes a repeated passage instead of stacking it', () => {
    rememberScripturePassage(passage('John 3:16'), 'web');
    rememberScripturePassage(passage('Psalms 23:1'), 'web');
    rememberScripturePassage(passage('John 3:16'), 'web');
    const refs = readScriptureRecents().map((entry) => entry.result.reference);
    expect(refs).toEqual(['John 3:16', 'Psalms 23:1']);
  });

  it('keeps the same reference in two translations apart', () => {
    // WEB and KJV of one verse are different on-air content; collapsing them
    // would make one unreachable from recents.
    rememberScripturePassage(passage('John 3:16', 'WEB'), 'web');
    rememberScripturePassage(passage('John 3:16', 'KJV'), 'kjv');
    expect(readScriptureRecents()).toHaveLength(2);
  });

  it('stays bounded', () => {
    for (let i = 1; i <= SCRIPTURE_RECENTS_LIMIT + 6; i += 1) {
      rememberScripturePassage(passage(`Psalms ${i}:1`), 'web');
    }
    const recents = readScriptureRecents();
    expect(recents).toHaveLength(SCRIPTURE_RECENTS_LIMIT);
    // The newest survive, the oldest fall off.
    expect(recents[0].result.reference).toBe(`Psalms ${SCRIPTURE_RECENTS_LIMIT + 6}:1`);
  });

  it('drops malformed stored entries rather than rendering half a passage', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { key: 'a', usedAt: 'x', translationId: 'web', result: { reference: 'John 3:16' } }, // no text
        { key: 'b', usedAt: 'x', translationId: 'web', result: passage('Psalms 23:1') },
        'not an object',
        null
      ])
    );
    const recents = readScriptureRecents();
    expect(recents).toHaveLength(1);
    expect(recents[0].result.reference).toBe('Psalms 23:1');
  });

  it('survives unparseable storage', () => {
    localStorage.setItem(KEY, '{not json');
    expect(readScriptureRecents()).toEqual([]);
  });

  it('clears', () => {
    rememberScripturePassage(passage('John 3:16'), 'web');
    clearScriptureRecents();
    expect(readScriptureRecents()).toEqual([]);
  });
});

describe('the recents key is registered for clear-all', () => {
  it('is listed in STORAGE_KEYS, not redeclared locally', async () => {
    /**
     * `clearAllData` removes exactly `Object.values(STORAGE_KEYS)`. A key defined
     * only inside this module would survive "Reset all local data" — on a shared
     * production machine that means one church's passages outliving the reset.
     * The existing scripture caches declare their own literals and work only
     * because the strings happen to match; this one imports its key.
     */
    const storage = await import('../storage');
    expect(storage.SCRIPTURE_RECENTS_KEY).toBe(KEY);

    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/lib/storage.ts', 'utf8');
    expect(source).toContain(`scriptureRecents: '${KEY}'`);
    expect(source).toContain('Object.values(STORAGE_KEYS).forEach');

    // The module must not redeclare the string — importing it is the point.
    const recentsSource = readFileSync('src/lib/scripture/scriptureRecents.ts', 'utf8');
    expect(recentsSource).toContain('SCRIPTURE_RECENTS_KEY');
    expect(recentsSource).not.toContain(`'${KEY}'`);
  });
});
