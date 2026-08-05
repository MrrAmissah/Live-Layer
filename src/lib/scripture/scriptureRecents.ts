import type { ScriptureLookupResult } from '../../types/scripture';
import { SCRIPTURE_RECENTS_KEY } from '../storage';
import { scriptureCacheKey } from './referenceParser';

/**
 * Passages the operator actually used, so reopening one costs no typing.
 *
 * Deliberately NOT the lookup cache. `scriptureCache` records every successful
 * fetch, including the four references someone typed while hunting for the right
 * one — surfacing those as "recent" would bury the passage they settled on. A
 * recent entry is written only when a passage is *accepted*: applied to the
 * graphic, queued, or added to a rundown.
 *
 * Bounded at 8 with the newest first, deduped by provider+translation+reference —
 * the same MRU-slice shape as the store's `recent` list, and the same reason: an
 * unbounded list in localStorage eventually fails a write mid-service.
 */

const MAX_RECENTS = 8;

export interface ScriptureRecent {
  /** provider:translation:reference — dedupe identity, so WEB and KJV stay apart. */
  key: string;
  /** The full result, so reopening works with no network and no cache dependency. */
  result: ScriptureLookupResult;
  /** Translation id as requested (`web`), distinct from the display label (`WEB`). */
  translationId: string;
  usedAt: string;
}

function isRecent(value: unknown): value is ScriptureRecent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<ScriptureRecent>;
  if (typeof entry.key !== 'string' || typeof entry.usedAt !== 'string') return false;
  if (typeof entry.translationId !== 'string') return false;
  const result = entry.result as Partial<ScriptureLookupResult> | undefined;
  // Same defensive read as the caches: a malformed entry is dropped, never
  // rendered. A half-written passage must not reach a graphic.
  return (
    !!result &&
    typeof result.reference === 'string' &&
    typeof result.text === 'string' &&
    typeof result.translation === 'string' &&
    typeof result.providerId === 'string' &&
    typeof result.fetchedAt === 'string' &&
    (result.attribution === undefined || typeof result.attribution === 'string')
  );
}

export function readScriptureRecents(): ScriptureRecent[] {
  try {
    const raw = localStorage.getItem(SCRIPTURE_RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecent).slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

function write(entries: ScriptureRecent[]) {
  try {
    localStorage.setItem(SCRIPTURE_RECENTS_KEY, JSON.stringify(entries.slice(0, MAX_RECENTS)));
  } catch {
    // Ignore quota errors; recents are a convenience, never a dependency.
  }
}

/**
 * Record an accepted passage. Returns the new list so a caller can render it
 * without a second read.
 */
export function rememberScripturePassage(
  result: ScriptureLookupResult,
  translationId: string,
  now = new Date().toISOString()
): ScriptureRecent[] {
  const key = scriptureCacheKey(result.providerId, translationId, result.reference);
  const entry: ScriptureRecent = { key, result, translationId, usedAt: now };
  const next = [entry, ...readScriptureRecents().filter((existing) => existing.key !== key)].slice(0, MAX_RECENTS);
  write(next);
  return next;
}

export function clearScriptureRecents() {
  write([]);
}

export const SCRIPTURE_RECENTS_LIMIT = MAX_RECENTS;
