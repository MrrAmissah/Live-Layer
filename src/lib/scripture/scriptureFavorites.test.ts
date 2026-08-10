import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addScriptureFavorite,
  favoriteKey,
  isScriptureFavorite,
  readScriptureFavorites,
  removeScriptureFavorite,
  toggleScriptureFavorite,
  SCRIPTURE_FAVORITES_LIMIT
} from './scriptureFavorites';
import { readScriptureRecents, rememberScripturePassage } from './scriptureRecents';
import { SCRIPTURE_FAVORITES_KEY } from '../storage';
import type { ScriptureLookupResult } from '../../types/scripture';

/**
 * Saved passages: the theme verse, the benediction, the one read most weeks.
 *
 * The distinction from recents is the whole justification for the feature.
 * Recents are an MRU slice bounded at 8, so a passage used in January is gone
 * by February — correct for history, useless for a decision. A favourite is
 * kept until removed.
 *
 * Everything else is deliberately shared: the same record shape, the same
 * validator, the same provider:translation:reference identity. That is what
 * makes an offline reopen free — the full lookup result is already in the
 * record, so nothing has to ask the provider again.
 */

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear()
  });
});

const result = (overrides: Partial<ScriptureLookupResult> = {}): ScriptureLookupResult =>
  ({
    reference: 'Psalm 23:1-6',
    text: 'Yahweh is my shepherd: I shall lack nothing.',
    translation: 'WEB',
    providerId: 'bible-api',
    fetchedAt: '2026-08-09T10:00:00.000Z',
    attribution: 'World English Bible',
    ...overrides
  }) as ScriptureLookupResult;

describe('a favourite is not a recent', () => {
  it('survives when recents have evicted the same passage', () => {
    // The use case in one test: the theme verse is still there after a service
    // that touched nine other passages.
    addScriptureFavorite(result(), 'web');
    for (let i = 0; i < 12; i += 1) {
      rememberScripturePassage(result({ reference: `John ${i + 1}:1` }), 'web');
    }
    expect(readScriptureRecents().some((e) => e.result.reference === 'Psalm 23:1-6')).toBe(false);
    expect(readScriptureFavorites()[0].result.reference).toBe('Psalm 23:1-6');
  });

  it('saving a favourite does not write a recent', () => {
    // Recents stay accepted-only: saving is not using.
    addScriptureFavorite(result(), 'web');
    expect(readScriptureRecents()).toHaveLength(0);
  });

  it('lives in its own key, so a reset clears it with everything else', () => {
    addScriptureFavorite(result(), 'web');
    expect(store.has(SCRIPTURE_FAVORITES_KEY)).toBe(true);
  });
});

describe('reopening costs nothing', () => {
  it('stores the complete passage, so no provider call is needed', () => {
    addScriptureFavorite(result(), 'web');
    const saved = readScriptureFavorites()[0].result;
    // Everything the renderer and the attribution need is already here.
    expect(saved.text).toContain('shepherd');
    expect(saved.reference).toBe('Psalm 23:1-6');
    expect(saved.translation).toBe('WEB');
    expect(saved.providerId).toBe('bible-api');
    expect(saved.attribution).toBe('World English Bible');
  });

  it('drops a malformed entry rather than reopening half a passage', () => {
    store.set(SCRIPTURE_FAVORITES_KEY, JSON.stringify([{ key: 'x', usedAt: 'y' }]));
    expect(readScriptureFavorites()).toEqual([]);
  });

  it('survives unreadable storage', () => {
    store.set(SCRIPTURE_FAVORITES_KEY, 'not json');
    expect(readScriptureFavorites()).toEqual([]);
  });
});

describe('translation is part of the identity', () => {
  it('keeps the same reference in two translations as two passages', () => {
    // Psalm 23 in WEB and in KJV are different words on screen.
    addScriptureFavorite(result({ translation: 'WEB' }), 'web');
    addScriptureFavorite(result({ translation: 'KJV' }), 'kjv');
    expect(readScriptureFavorites()).toHaveLength(2);
    expect(favoriteKey(result(), 'web')).not.toBe(favoriteKey(result(), 'kjv'));
  });

  it('re-saving the same passage moves it to the front rather than duplicating', () => {
    addScriptureFavorite(result({ reference: 'John 3:16' }), 'web');
    addScriptureFavorite(result(), 'web');
    addScriptureFavorite(result({ reference: 'John 3:16' }), 'web');
    const entries = readScriptureFavorites();
    expect(entries).toHaveLength(2);
    expect(entries[0].result.reference).toBe('John 3:16');
  });
});

describe('save, check and remove', () => {
  it('reports whether a passage is saved, per translation', () => {
    addScriptureFavorite(result(), 'web');
    expect(isScriptureFavorite(result(), 'web')).toBe(true);
    expect(isScriptureFavorite(result(), 'kjv')).toBe(false);
  });

  it('toggles on and off', () => {
    const on = toggleScriptureFavorite(result(), 'web');
    expect(on.saved).toBe(true);
    expect(on.entries).toHaveLength(1);
    const off = toggleScriptureFavorite(result(), 'web');
    expect(off.saved).toBe(false);
    expect(off.entries).toHaveLength(0);
  });

  it('removes only the passage asked for', () => {
    addScriptureFavorite(result(), 'web');
    addScriptureFavorite(result({ reference: 'John 3:16' }), 'web');
    const remaining = removeScriptureFavorite(favoriteKey(result(), 'web'));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].result.reference).toBe('John 3:16');
  });
});

describe('at capacity the operator decides what leaves', () => {
  /**
   * The contradiction this closes: the module promised "kept until removed"
   * while `slice(0, MAX)` quietly dropped the oldest saved passage to make room
   * for the 25th. A save that reports success by destroying an earlier decision
   * is the precise failure saved passages exist to prevent.
   */
  const fill = () => {
    for (let i = 0; i < SCRIPTURE_FAVORITES_LIMIT; i += 1) {
      addScriptureFavorite(result({ reference: `Psalm ${i + 1}:1` }), 'web');
    }
  };

  it('refuses a new passage rather than evicting one', () => {
    fill();
    const before = readScriptureFavorites();
    const outcome = addScriptureFavorite(result({ reference: 'Romans 8:28' }), 'web');

    expect(outcome.saved).toBe(false);
    expect(outcome.reason).toBe('full');
    // Nothing was added...
    expect(readScriptureFavorites().some((e) => e.result.reference === 'Romans 8:28')).toBe(false);
    // ...and nothing was lost.
    expect(readScriptureFavorites()).toHaveLength(SCRIPTURE_FAVORITES_LIMIT);
    expect(readScriptureFavorites().map((e) => e.key)).toEqual(before.map((e) => e.key));
  });

  it('the oldest saved passage in particular survives', () => {
    // The theme verse saved in January is the one an MRU bound would drop.
    addScriptureFavorite(result({ reference: 'Theme 1:1' }), 'web');
    for (let i = 0; i < SCRIPTURE_FAVORITES_LIMIT - 1; i += 1) {
      addScriptureFavorite(result({ reference: `Psalm ${i + 1}:1` }), 'web');
    }
    addScriptureFavorite(result({ reference: 'Romans 8:28' }), 'web');
    expect(readScriptureFavorites().some((e) => e.result.reference === 'Theme 1:1')).toBe(true);
  });

  it('re-saving an already-saved passage stays safe at capacity', () => {
    fill();
    const outcome = addScriptureFavorite(result({ reference: 'Psalm 1:1' }), 'web');
    expect(outcome.saved).toBe(true);
    expect(readScriptureFavorites()).toHaveLength(SCRIPTURE_FAVORITES_LIMIT);
    // ...and moves to the front, as re-saving always did.
    expect(readScriptureFavorites()[0].result.reference).toBe('Psalm 1:1');
  });

  it('removing one frees the slot, and the next save then succeeds', () => {
    fill();
    expect(addScriptureFavorite(result({ reference: 'Romans 8:28' }), 'web').saved).toBe(false);
    removeScriptureFavorite(favoriteKey(result({ reference: 'Psalm 1:1' }), 'web'));
    const retry = addScriptureFavorite(result({ reference: 'Romans 8:28' }), 'web');
    expect(retry.saved).toBe(true);
    expect(readScriptureFavorites().some((e) => e.result.reference === 'Romans 8:28')).toBe(true);
  });

  it('translation still separates identity at capacity', () => {
    fill();
    // Same reference, different translation, is a genuinely new entry — so it
    // is refused rather than replacing the other translation's copy.
    const outcome = addScriptureFavorite(result({ reference: 'Psalm 1:1', translation: 'KJV' }), 'kjv');
    expect(outcome.saved).toBe(false);
    expect(readScriptureFavorites().some((e) => e.translationId === 'kjv')).toBe(false);
  });

  it('the toggle reports the refusal instead of a silent no-op', () => {
    fill();
    const outcome = toggleScriptureFavorite(result({ reference: 'Romans 8:28' }), 'web');
    expect(outcome.saved).toBe(false);
    expect(outcome.reason).toBe('full');
  });
});

describe('a save that did not persist is not a save', () => {
  /**
   * Durability IS the feature here. Reporting `saved: true` after a failed
   * write would put "Saved" over a passage that is gone after a refresh — the
   * one lie this list must never tell. Recents can swallow a failed write;
   * saved passages cannot.
   */
  const breakWrites = () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear()
    });
  };

  it('reports the storage failure rather than success', () => {
    breakWrites();
    const outcome = addScriptureFavorite(result(), 'web');
    expect(outcome.saved).toBe(false);
    expect(outcome.reason).toBe('storage-failed');
  });

  it('returns no phantom entry, so the UI cannot show one', () => {
    breakWrites();
    const outcome = addScriptureFavorite(result(), 'web');
    // The returned list is what a refresh would show.
    expect(outcome.entries).toEqual([]);
    expect(outcome.entries.some((e) => e.result.reference === 'Psalm 23:1-6')).toBe(false);
  });

  it('leaves passages saved earlier exactly as they were', () => {
    addScriptureFavorite(result({ reference: 'John 3:16' }), 'web');
    const before = readScriptureFavorites();
    breakWrites();
    const outcome = addScriptureFavorite(result(), 'web');
    expect(outcome.entries).toEqual(before);
  });

  it('does not report a removal that could not be written', () => {
    addScriptureFavorite(result(), 'web');
    const before = readScriptureFavorites();
    breakWrites();
    expect(removeScriptureFavorite(favoriteKey(result(), 'web'))).toEqual(before);
  });

  it('never confuses a full list with a broken device', () => {
    // They need different words: one is a decision the operator can act on, the
    // other is not helped by deleting anything.
    breakWrites();
    expect(addScriptureFavorite(result(), 'web').reason).toBe('storage-failed');
  });

  it('the panel words the two refusals differently', () => {
    const panel = readFileSync('src/components/control/ScriptureLookupPanel.tsx', 'utf8');
    expect(panel).toContain("reason === 'full'");
    expect(panel).toContain("reason === 'storage-failed'");
    expect(panel).toMatch(/Couldn.t save this passage on this device/);
  });
});
