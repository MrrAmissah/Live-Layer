export interface BibleBookMeta {
  name: string;
  aliases: string[];
  testament: 'old' | 'new';
  order: number;
  chapterCount: number;
}

/**
 * Local Bible book metadata for instant, offline reference autocomplete and the
 * chapter picker. Aliases cover common abbreviations and numbered-book forms;
 * `chapterCount` is the Protestant-canon chapter total. It powers typeahead and
 * chapter chips only — it never triggers a network lookup.
 */
export const BIBLE_BOOKS: BibleBookMeta[] = [
  { order: 1, name: 'Genesis', testament: 'old', chapterCount: 50, aliases: ['gen', 'ge', 'gn'] },
  { order: 2, name: 'Exodus', testament: 'old', chapterCount: 40, aliases: ['exo', 'ex', 'exod'] },
  { order: 3, name: 'Leviticus', testament: 'old', chapterCount: 27, aliases: ['lev', 'lv', 'levit'] },
  { order: 4, name: 'Numbers', testament: 'old', chapterCount: 36, aliases: ['num', 'nu', 'nm', 'nb'] },
  { order: 5, name: 'Deuteronomy', testament: 'old', chapterCount: 34, aliases: ['deut', 'dt', 'deu'] },
  { order: 6, name: 'Joshua', testament: 'old', chapterCount: 24, aliases: ['josh', 'jos', 'jsh'] },
  { order: 7, name: 'Judges', testament: 'old', chapterCount: 21, aliases: ['judg', 'jdg', 'jdgs'] },
  { order: 8, name: 'Ruth', testament: 'old', chapterCount: 4, aliases: ['ru', 'rth'] },
  { order: 9, name: '1 Samuel', testament: 'old', chapterCount: 31, aliases: ['1 sam', '1sam', '1 sa', '1sa', 'i samuel'] },
  { order: 10, name: '2 Samuel', testament: 'old', chapterCount: 24, aliases: ['2 sam', '2sam', '2 sa', '2sa', 'ii samuel'] },
  { order: 11, name: '1 Kings', testament: 'old', chapterCount: 22, aliases: ['1 kgs', '1kgs', '1 ki', '1ki', 'i kings'] },
  { order: 12, name: '2 Kings', testament: 'old', chapterCount: 25, aliases: ['2 kgs', '2kgs', '2 ki', '2ki', 'ii kings'] },
  { order: 13, name: '1 Chronicles', testament: 'old', chapterCount: 29, aliases: ['1 chr', '1chr', '1 ch', '1ch', '1 chron'] },
  { order: 14, name: '2 Chronicles', testament: 'old', chapterCount: 36, aliases: ['2 chr', '2chr', '2 ch', '2ch', '2 chron'] },
  { order: 15, name: 'Ezra', testament: 'old', chapterCount: 10, aliases: ['ezr', 'ezra'] },
  { order: 16, name: 'Nehemiah', testament: 'old', chapterCount: 13, aliases: ['neh', 'ne'] },
  { order: 17, name: 'Esther', testament: 'old', chapterCount: 10, aliases: ['est', 'esth', 'es'] },
  { order: 18, name: 'Job', testament: 'old', chapterCount: 42, aliases: ['jb'] },
  { order: 19, name: 'Psalms', testament: 'old', chapterCount: 150, aliases: ['ps', 'psa', 'psm', 'pss', 'psalm'] },
  { order: 20, name: 'Proverbs', testament: 'old', chapterCount: 31, aliases: ['prov', 'pro', 'prv', 'pr'] },
  { order: 21, name: 'Ecclesiastes', testament: 'old', chapterCount: 12, aliases: ['eccl', 'ecc', 'ec', 'qoh'] },
  { order: 22, name: 'Song of Songs', testament: 'old', chapterCount: 8, aliases: ['song', 'sos', 'ss', 'song of solomon', 'canticles'] },
  { order: 23, name: 'Isaiah', testament: 'old', chapterCount: 66, aliases: ['isa', 'is'] },
  { order: 24, name: 'Jeremiah', testament: 'old', chapterCount: 52, aliases: ['jer', 'je', 'jr'] },
  { order: 25, name: 'Lamentations', testament: 'old', chapterCount: 5, aliases: ['lam', 'la'] },
  { order: 26, name: 'Ezekiel', testament: 'old', chapterCount: 48, aliases: ['ezek', 'eze', 'ezk'] },
  { order: 27, name: 'Daniel', testament: 'old', chapterCount: 12, aliases: ['dan', 'da', 'dn'] },
  { order: 28, name: 'Hosea', testament: 'old', chapterCount: 14, aliases: ['hos', 'ho'] },
  { order: 29, name: 'Joel', testament: 'old', chapterCount: 3, aliases: ['joe', 'jl'] },
  { order: 30, name: 'Amos', testament: 'old', chapterCount: 9, aliases: ['amo', 'am'] },
  { order: 31, name: 'Obadiah', testament: 'old', chapterCount: 1, aliases: ['obad', 'ob'] },
  { order: 32, name: 'Jonah', testament: 'old', chapterCount: 4, aliases: ['jon', 'jnh'] },
  { order: 33, name: 'Micah', testament: 'old', chapterCount: 7, aliases: ['mic', 'mc'] },
  { order: 34, name: 'Nahum', testament: 'old', chapterCount: 3, aliases: ['nah', 'na'] },
  { order: 35, name: 'Habakkuk', testament: 'old', chapterCount: 3, aliases: ['hab', 'hb', 'hk'] },
  { order: 36, name: 'Zephaniah', testament: 'old', chapterCount: 3, aliases: ['zeph', 'zep', 'zp'] },
  { order: 37, name: 'Haggai', testament: 'old', chapterCount: 2, aliases: ['hag', 'hg'] },
  { order: 38, name: 'Zechariah', testament: 'old', chapterCount: 14, aliases: ['zech', 'zec', 'zc'] },
  { order: 39, name: 'Malachi', testament: 'old', chapterCount: 4, aliases: ['mal', 'ml'] },
  { order: 40, name: 'Matthew', testament: 'new', chapterCount: 28, aliases: ['matt', 'mt', 'mat'] },
  { order: 41, name: 'Mark', testament: 'new', chapterCount: 16, aliases: ['mk', 'mrk', 'mar'] },
  { order: 42, name: 'Luke', testament: 'new', chapterCount: 24, aliases: ['lk', 'luk'] },
  { order: 43, name: 'John', testament: 'new', chapterCount: 21, aliases: ['jn', 'jhn', 'joh'] },
  { order: 44, name: 'Acts', testament: 'new', chapterCount: 28, aliases: ['ac', 'act'] },
  { order: 45, name: 'Romans', testament: 'new', chapterCount: 16, aliases: ['rom', 'ro', 'rm'] },
  { order: 46, name: '1 Corinthians', testament: 'new', chapterCount: 16, aliases: ['1 cor', '1cor', '1 co', '1co', 'i corinthians'] },
  { order: 47, name: '2 Corinthians', testament: 'new', chapterCount: 13, aliases: ['2 cor', '2cor', '2 co', '2co', 'ii corinthians'] },
  { order: 48, name: 'Galatians', testament: 'new', chapterCount: 6, aliases: ['gal', 'ga'] },
  { order: 49, name: 'Ephesians', testament: 'new', chapterCount: 6, aliases: ['eph', 'ephes'] },
  { order: 50, name: 'Philippians', testament: 'new', chapterCount: 4, aliases: ['phil', 'php', 'pp'] },
  { order: 51, name: 'Colossians', testament: 'new', chapterCount: 4, aliases: ['col', 'co'] },
  { order: 52, name: '1 Thessalonians', testament: 'new', chapterCount: 5, aliases: ['1 thess', '1thess', '1 th', '1th', '1 thes'] },
  { order: 53, name: '2 Thessalonians', testament: 'new', chapterCount: 3, aliases: ['2 thess', '2thess', '2 th', '2th', '2 thes'] },
  { order: 54, name: '1 Timothy', testament: 'new', chapterCount: 6, aliases: ['1 tim', '1tim', '1 ti', '1ti'] },
  { order: 55, name: '2 Timothy', testament: 'new', chapterCount: 4, aliases: ['2 tim', '2tim', '2 ti', '2ti'] },
  { order: 56, name: 'Titus', testament: 'new', chapterCount: 3, aliases: ['tit', 'ti'] },
  { order: 57, name: 'Philemon', testament: 'new', chapterCount: 1, aliases: ['philem', 'phlm', 'phm', 'pm'] },
  { order: 58, name: 'Hebrews', testament: 'new', chapterCount: 13, aliases: ['heb', 'hebr'] },
  { order: 59, name: 'James', testament: 'new', chapterCount: 5, aliases: ['jas', 'jm'] },
  { order: 60, name: '1 Peter', testament: 'new', chapterCount: 5, aliases: ['1 pet', '1pet', '1 pe', '1pe', '1 pt'] },
  { order: 61, name: '2 Peter', testament: 'new', chapterCount: 3, aliases: ['2 pet', '2pet', '2 pe', '2pe', '2 pt'] },
  { order: 62, name: '1 John', testament: 'new', chapterCount: 5, aliases: ['1 jn', '1jn', '1 jo', '1jo', 'i john'] },
  { order: 63, name: '2 John', testament: 'new', chapterCount: 1, aliases: ['2 jn', '2jn', '2 jo', '2jo', 'ii john'] },
  { order: 64, name: '3 John', testament: 'new', chapterCount: 1, aliases: ['3 jn', '3jn', '3 jo', '3jo', 'iii john'] },
  { order: 65, name: 'Jude', testament: 'new', chapterCount: 1, aliases: ['jud', 'jd'] },
  { order: 66, name: 'Revelation', testament: 'new', chapterCount: 22, aliases: ['rev', 're', 'rv', 'apocalypse'] }
];

/** Look up a book's metadata by its canonical name (case-insensitive). */
export function getBibleBook(name: string): BibleBookMeta | undefined {
  const q = name.trim().toLowerCase();
  return BIBLE_BOOKS.find((book) => book.name.toLowerCase() === q);
}

/**
 * Split a reference into its book guess and the trailing chapter/verse, e.g.
 * "1 John 3:16" → { book: "1 John", rest: "3:16" }, "ps 23" → { book: "ps",
 * rest: "23" }. The chapter starts at the first space-then-digit, so a leading
 * book number (1/2/3) stays part of the book.
 */
export function splitReference(input: string): { book: string; rest: string } {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  const match = trimmed.match(/\s\d.*$/);
  if (match && match.index !== undefined) {
    return { book: trimmed.slice(0, match.index).trim(), rest: trimmed.slice(match.index).trim() };
  }
  return { book: trimmed, rest: '' };
}

export interface ParsedReference {
  rawBook: string;
  /** Canonical book name, or null when the book guess is ambiguous/unknown. */
  book: string | null;
  chapter?: number;
  verseStart?: number;
  verseEnd?: number;
}

/** Parse a free-typed or chip-built reference into its parts. */
export function parseReference(input: string): ParsedReference {
  const { book: rawBook, rest } = splitReference(input);
  const book = normalizeBibleBook(rawBook);
  const compact = rest.replace(/\s+/g, '');
  const match = compact.match(/^(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!match) return { rawBook, book };
  return {
    rawBook,
    book,
    chapter: match[1] ? parseInt(match[1], 10) : undefined,
    verseStart: match[2] ? parseInt(match[2], 10) : undefined,
    verseEnd: match[3] ? parseInt(match[3], 10) : undefined
  };
}

/** Build a canonical reference string from selected parts. */
export function buildReference(book: string, chapter?: number, verseStart?: number, verseEnd?: number): string {
  let ref = book;
  if (chapter) {
    ref += ` ${chapter}`;
    if (verseStart) {
      ref += `:${verseStart}`;
      if (verseEnd && verseEnd > verseStart) ref += `-${verseEnd}`;
    }
  }
  return ref;
}

function scoreBook(book: BibleBookMeta, q: string): number {
  const name = book.name.toLowerCase();
  const aliases = book.aliases.map((alias) => alias.toLowerCase());
  if (name === q || aliases.includes(q)) return 100;
  if (name.startsWith(q)) return 70;
  if (aliases.some((alias) => alias.startsWith(q))) return 60;
  if (name.replace(/\s/g, '').startsWith(q.replace(/\s/g, ''))) return 45;
  if (name.includes(q)) return 25;
  return 0;
}

/** Local, instant book suggestions for a partial reference. Never fetches. */
export function suggestBibleBooks(query: string, limit = 6): BibleBookMeta[] {
  const guess = splitReference(query).book.toLowerCase().trim();
  if (!guess) return [];
  return BIBLE_BOOKS
    .map((book) => ({ book, score: scoreBook(book, guess) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.book.order - b.book.order)
    .slice(0, limit)
    .map((entry) => entry.book);
}

/** Resolve a book input to its canonical name, or null if ambiguous/unknown. */
export function normalizeBibleBook(input: string): string | null {
  const q = splitReference(input).book.toLowerCase().trim();
  if (!q) return null;
  const exact = BIBLE_BOOKS.find(
    (book) => book.name.toLowerCase() === q || book.aliases.some((alias) => alias.toLowerCase() === q)
  );
  if (exact) return exact.name;
  const starts = BIBLE_BOOKS.filter(
    (book) => book.name.toLowerCase().startsWith(q) || book.aliases.some((alias) => alias.toLowerCase().startsWith(q))
  );
  return starts.length === 1 ? starts[0].name : null;
}
