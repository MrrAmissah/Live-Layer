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
    localStorage.setItem(SCRIPTURE_FAVORITES_KEY, JSON.stringify(entries.slice(0, MAX_FAVORITES)));
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
export function addScriptureFavorite(
  result: ScriptureLookupResult,
  translationId: string,
  usedAt = new Date().toISOString()
): ScriptureFavorite[] {
  const key = favoriteKey(result, translationId);
  const next: ScriptureFavorite = { key, result, translationId, usedAt };
  const rest = read().filter((entry) => entry.key !== key);
  const entries = [next, ...rest].slice(0, MAX_FAVORITES);
  write(entries);
  return entries;
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
): { entries: ScriptureFavorite[]; saved: boolean } {
  const key = favoriteKey(result, translationId);
  if (read().some((entry) => entry.key === key)) {
    return { entries: removeScriptureFavorite(key), saved: false };
  }
  return { entries: addScriptureFavorite(result, translationId), saved: true };
}

export const SCRIPTURE_FAVORITES_LIMIT = MAX_FAVORITES;
