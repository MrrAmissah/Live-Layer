interface ChapterVerseEntry {
  key: string;
  verseCount: number;
  usedAt: string;
}

const CACHE_KEY = 'livelayer.chapterVerseCache';
const MAX_ENTRIES = 60;

export function chapterCacheKey(providerId: string, translation: string, book: string, chapter: number): string {
  return `${providerId}:${translation.toLowerCase()}:${book.toLowerCase()}:${chapter}`;
}

function read(): ChapterVerseEntry[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is ChapterVerseEntry => (
        !!entry &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        typeof entry.key === 'string' &&
        typeof entry.verseCount === 'number' &&
        Number.isFinite(entry.verseCount) &&
        entry.verseCount > 0 &&
        typeof entry.usedAt === 'string'
      ))
      : [];
  } catch {
    return [];
  }
}

function write(entries: ChapterVerseEntry[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Ignore quota errors; verse hints still work without cache.
  }
}

export function getCachedVerseCount(key: string): number | null {
  const entry = read().find((item) => item.key === key);
  return entry ? entry.verseCount : null;
}

export function saveCachedVerseCount(key: string, verseCount: number): void {
  const entries = read().filter((item) => item.key !== key);
  write([{ key, verseCount, usedAt: new Date().toISOString() }, ...entries]);
}
