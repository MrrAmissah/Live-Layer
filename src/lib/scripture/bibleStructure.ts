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

/** Chapter numbers `1..n` for a canonical book name. */
export function chapterNumbers(bookName: string): number[] {
  return numberRange(getChapterCount(bookName));
}

/** `[1, 2, …, n]` — used for chapter and verse chips. */
export function numberRange(n: number): number[] {
  return Array.from({ length: Math.max(0, n) }, (_, index) => index + 1);
}
