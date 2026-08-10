import type { ScriptureLookupResult } from '../../types/scripture';
import { SCRIPTURE_FAVORITES_KEY } from '../storage';
import { scriptureCacheKey } from './referenceParser';
import { isScriptureRecord, type ScriptureRecent } from './scriptureRecents';

/**
 * Passages a church comes back to every service.
 *
 * Recents already answer "what did I just use", and they answer it well — but
 * they are an MRU slice bounded at 8, so the theme verse for the year is gone
 * by the middle of a service that touched nine other passages. That is correct
 * behaviour for recents and useless for a benediction the operator reads most
 * weeks. The two are distinct concepts: one is history, one is a decision.
 *
 * This is NOT a second Scripture database. It reuses `ScriptureRecent`
 * wholesale — the same record shape, the same validator, the same
 * provider:translation:reference identity — and differs only in that entries
 * are kept until removed rather than evicted. A favourite therefore already
 * carries the complete `ScriptureLookupResult`, which is what lets it reopen
 * with no provider request and no cache dependency: the text is in the record.
 *
 * Translation is part of the identity, not decoration. Psalm 23 in WEB and
 * Psalm 23 in KJV are different passages on screen, and a favourite that
 * dropped the translation would silently reopen as whichever one happened to
 * be selected.
 *
 * Bounded, for the same reason recents are: an unbounded localStorage list
 * eventually fails a write, and mid-service is when it would.
 *
 * BUT THE BOUND BEHAVES DIFFERENTLY. Recents rotate — that is what an MRU list
 * is for. Saved passages are operator decisions, and a list that quietly drops
 * the theme verse to make room for the 25th passage is the exact failure this
 * feature exists to prevent. So at capacity a NEW passage is REFUSED and the
 * caller is told, rather than a save appearing to succeed while something else
 * disappears. Re-saving an already-saved passage stays safe at any size, and
 * removing one frees the slot.
 */
const MAX_FAVORITES = 24;

export type ScriptureFavorite = ScriptureRecent;

function read(): ScriptureFavorite[] {
  try {
    const raw = localStorage.getItem(SCRIPTURE_FAVORITES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // A malformed entry is dropped, never rendered — same rule as recents and
    // the caches. A half-written passage must not reach a graphic.
    return parsed.filter(isScriptureRecord).slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

function write(entries: ScriptureFavorite[]) {
  try {
    localStorage.setItem(SCRIPTURE_FAVORITES_KEY, JSON.stringify(entries));
  } catch {
    // Quota or disabled storage: the favourite simply does not persist.
  }
}

export function readScriptureFavorites(): ScriptureFavorite[] {
  return read();
}

/** Identity for a passage, so the same reference in two translations is two entries. */
export function favoriteKey(result: ScriptureLookupResult, translationId: string): string {
  return scriptureCacheKey(result.providerId, translationId, result.reference);
}

export function isScriptureFavorite(result: ScriptureLookupResult, translationId: string): boolean {
  const key = favoriteKey(result, translationId);
  return read().some((entry) => entry.key === key);
}

/**
 * Save a passage, or move an existing one to the front. Storing the whole
 * result is the point: reopening must never need the provider.
 */
export interface SaveFavoriteOutcome {
  /** False only when the list is full and this passage is not already in it. */
  saved: boolean;
  entries: ScriptureFavorite[];
  /** Present when the save was refused, for the operator to read. */
  reason?: 'full';
}

export function addScriptureFavorite(
  result: ScriptureLookupResult,
  translationId: string,
  usedAt = new Date().toISOString()
): SaveFavoriteOutcome {
  const key = favoriteKey(result, translationId);
  const existing = read();
  const rest = existing.filter((entry) => entry.key !== key);
  const alreadySaved = rest.length !== existing.length;

  /**
   * At capacity with a genuinely new passage: refuse, and change nothing.
   * Slicing here would have removed the oldest saved passage silently — a save
   * that reports success while destroying an earlier decision.
   */
  if (!alreadySaved && rest.length >= MAX_FAVORITES) {
    return { saved: false, entries: existing, reason: 'full' };
  }

  const entries = [{ key, result, translationId, usedAt }, ...rest];
  write(entries);
  return { saved: true, entries };
}

export function removeScriptureFavorite(key: string): ScriptureFavorite[] {
  const entries = read().filter((entry) => entry.key !== key);
  write(entries);
  return entries;
}

/** Toggle, returning the list and whether the passage is now saved. */
export function toggleScriptureFavorite(
  result: ScriptureLookupResult,
  translationId: string
): SaveFavoriteOutcome {
  const key = favoriteKey(result, translationId);
  if (read().some((entry) => entry.key === key)) {
    return { saved: false, entries: removeScriptureFavorite(key) };
  }
  return addScriptureFavorite(result, translationId);
}

export const SCRIPTURE_FAVORITES_LIMIT = MAX_FAVORITES;
