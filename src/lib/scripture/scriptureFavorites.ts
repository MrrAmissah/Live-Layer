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

/**
 * Returns whether the write actually landed.
 *
 * Swallowing the failure and reporting success is defensible for recents — they
 * are disposable history. It is not defensible here: durability IS the feature,
 * so "Saved" over a passage that will be gone after a refresh is the one lie
 * this list must never tell.
 */
function write(entries: ScriptureFavorite[]): boolean {
  try {
    localStorage.setItem(SCRIPTURE_FAVORITES_KEY, JSON.stringify(entries));
    return true;
  } catch {
    // Quota, or storage disabled by policy. The caller reports it.
    return false;
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
  /** True only when the passage is now DURABLY saved. */
  saved: boolean;
  /** The durable list — what a refresh would show, never an optimistic one. */
  entries: ScriptureFavorite[];
  /**
   * Why a save did not happen. `full` is a decision the operator can act on;
   * `storage-failed` is the device refusing to keep it. Conflating them would
   * tell someone to delete a passage when deleting would not help.
   */
  reason?: 'full' | 'storage-failed';
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
  if (!write(entries)) {
    // Report the list that actually survives a refresh, so a phantom entry
    // cannot appear in the UI as though it were saved.
    return { saved: false, entries: existing, reason: 'storage-failed' };
  }
  return { saved: true, entries };
}

export function removeScriptureFavorite(key: string): ScriptureFavorite[] {
  const existing = read();
  const entries = existing.filter((entry) => entry.key !== key);
  // A removal that could not be written has not happened; returning the
  // unchanged list keeps the UI showing what a refresh would.
  return write(entries) ? entries : existing;
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
