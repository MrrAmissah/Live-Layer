import { getBibleBook } from './bibleBooks';

/**
 * Local Bible structure helpers (chapter counts) for the reference picker.
 * Chapter data is local and instant; verse counts are provider-assisted
 * (see `useChapterVerses`) because they vary by chapter and are not bundled.
 */

/** Chapter count for a canonical book name, or 0 if unknown. */
export function getChapterCount(bookName: string): number {
  return getBibleBook(bookName)?.chapterCount ?? 0;
}

/**
 * Verse counts for the one-chapter books, because the provider cannot be asked.
 *
 * In a single-chapter book the provider reads `Jude 1` as Jude VERSE 1 and returns
 * one verse, so the verse-count probe reported 1 and the picker offered a single
 * verse chip for Jude, Obadiah, Philemon, 2 John and 3 John. Asking for an
 * over-wide range instead (`Jude 1:1-99`) returns nothing at all, so there is no
 * request that yields the whole chapter without already knowing its length.
 *
 * Five numbers, each verified against the live service by requesting the exact
 * range and confirming the count. Verse counts are structural facts, not
 * translation text, and `BIBLE_BOOKS` already bundles chapter counts for all 66
 * books — this is the same kind of data.
 */
const SINGLE_CHAPTER_VERSE_COUNTS: Record<string, number> = {
  Obadiah: 21,
  Philemon: 25,
  '2 John': 13,
  '3 John': 14,
  Jude: 25
};

/** Bundled verse count for a one-chapter book, or 0 when it is not one. */
export function getSingleChapterVerseCount(bookName: string): number {
  return SINGLE_CHAPTER_VERSE_COUNTS[bookName] ?? 0;
}

/** Chapter numbers `1..n` for a canonical book name. */
export function chapterNumbers(bookName: string): number[] {
  return numberRange(getChapterCount(bookName));
}

/** `[1, 2, …, n]` — used for chapter and verse chips. */
export function numberRange(n: number): number[] {
  return Array.from({ length: Math.max(0, n) }, (_, index) => index + 1);
}
