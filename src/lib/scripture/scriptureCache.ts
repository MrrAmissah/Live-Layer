import type { ScriptureCacheEntry, ScriptureLookupResult } from '../../types/scripture';

const CACHE_KEY = 'livelayer.scriptureCache';
const MAX_CACHE_ENTRIES = 50;

function readCache(): ScriptureCacheEntry[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is ScriptureCacheEntry => isScriptureCacheEntry(entry))
      : [];
  } catch {
    return [];
  }
}

function isScriptureCacheEntry(value: unknown): value is ScriptureCacheEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<ScriptureCacheEntry>;
  if (typeof entry.key !== 'string') return false;
  if (typeof entry.usedAt !== 'string') return false;
  const result = entry.result as Partial<ScriptureLookupResult> | undefined;
  return !!result &&
    typeof result.reference === 'string' &&
    typeof result.text === 'string' &&
    typeof result.translation === 'string' &&
    typeof result.providerId === 'string' &&
    typeof result.fetchedAt === 'string' &&
    (result.attribution === undefined || typeof result.attribution === 'string');
}

function writeCache(entries: ScriptureCacheEntry[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries.slice(0, MAX_CACHE_ENTRIES)));
  } catch {
    // Ignore quota errors; lookup still works without cache.
  }
}

export async function getCachedScripture(key: string): Promise<ScriptureLookupResult | null> {
  const entries = readCache();
  const found = entries.find((entry) => entry.key === key);
  if (!found) return null;
  const next = [
    { ...found, usedAt: new Date().toISOString() },
    ...entries.filter((entry) => entry.key !== key)
  ];
  writeCache(next);
  return found.result;
}

export async function saveCachedScripture(key: string, result: ScriptureLookupResult): Promise<void> {
  const entries = readCache();
  writeCache([
    { key, result, usedAt: new Date().toISOString() },
    ...entries.filter((entry) => entry.key !== key)
  ]);
}
