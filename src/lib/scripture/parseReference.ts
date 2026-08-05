import { BIBLE_BOOKS, splitReference } from './bibleBooks';
import { getChapterCount } from './bibleStructure';

/**
 * Strict, deterministic reference parsing — the gate in front of every lookup.
 *
 * `bibleBooks.parseReference` stays as it is: it feeds the picker's book/chapter/
 * verse chips, where a partially-typed reference is a normal intermediate state
 * and returning "no chapter yet" is the right answer. This module answers a
 * different question — *may we ask a provider for this?* — and so it must fail
 * loudly where that one degrades quietly.
 *
 * The degradation it exists to prevent, reproduced before this file was written:
 * `parseReference('John 3:16,18')` matched no locator, dropped chapter AND verse,
 * and rebuilt as `"John"`. An operator asking for two verses would have been sent
 * the whole book of John. `John 3.16`, `John 3:16–18` (en dash), `John 3:0` and
 * `John 3:18-16` degraded the same way. A reference that cannot be understood
 * must never resolve to a *different, valid-looking* passage — on air that is
 * indistinguishable from the operator's own mistake, and nothing flags it.
 *
 * So: one discriminated result. Either a canonical reference, or a named problem
 * with a message that says which input and which book it is about.
 */

/** An inclusive verse span. `end === start` is a single verse. */
export interface VerseSpan {
  start: number;
  end: number;
}

export interface CanonicalReference {
  /** Canonical book name, e.g. `1 Corinthians`. */
  book: string;
  chapter: number;
  /** Empty means the whole chapter. Sorted, merged, never overlapping. */
  spans: VerseSpan[];
  /** The reference as a provider and a human both read it, e.g. `John 3:16-18,20`. */
  canonical: string;
}

export type ReferenceProblem =
  | 'empty'
  | 'book-missing'
  | 'book-unknown'
  | 'book-ambiguous'
  | 'chapter-missing'
  | 'chapter-out-of-range'
  | 'verse-malformed'
  | 'verse-zero'
  | 'verse-inverted';

export interface ReferenceFailure {
  ok: false;
  problem: ReferenceProblem;
  /** Operator-facing and specific: names the offending input or book. */
  message: string;
  /** Populated for `book-ambiguous` so the UI can offer the choices. */
  candidates?: string[];
}

export type ReferenceParseResult = { ok: true; reference: CanonicalReference } | ReferenceFailure;

const fail = (problem: ReferenceProblem, message: string, candidates?: string[]): ReferenceFailure =>
  candidates ? { ok: false, problem, message, candidates } : { ok: false, problem, message };

/**
 * Fold the punctuation an operator actually types into one shape.
 *
 * Dashes first: phones and word processors substitute en/em dashes silently, and
 * `John 3:16–18` is a reference the operator believes they typed correctly.
 * Then `3.16` → `3:16`, because a digit-dot-digit is never anything else here —
 * and only after that are the remaining dots dropped, so an abbreviation dot in
 * `1 Jn. 3:16` disappears without eating the verse separator.
 */
function normalizePunctuation(input: string): string {
  return input
    .trim()
    .replace(/[‐-―−]/g, '-')
    .replace(/(\d)\s*[.．]\s*(\d)/g, '$1:$2')
    .replace(/[.．]/g, '')
    .replace(/[：]/g, ':')
    .replace(/\s*([:,-])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

interface BookResolution {
  book?: string;
  candidates: string[];
}

/**
 * Shortest query that may resolve a book by PREFIX alone.
 *
 * Exact name and alias matches are exempt at any length — `jn`, `ps`, `ge`, `1co`
 * and `pm` are all real abbreviations and must keep working. This bound applies
 * only to inferring a book from an incomplete word, where one stray keystroke
 * otherwise becomes a passage: `q` is a unique prefix of Ecclesiastes' `qoh`
 * alias, so `q 3:16` resolved — silently — to Ecclesiastes 3:16. A single letter
 * is not an operator's intent, and on air the wrong book is unrecoverable.
 */
const MIN_PREFIX_LENGTH = 3;

/**
 * Resolve a book guess to exactly one canonical name.
 *
 * `normalizeBibleBook` collapses "unknown" and "ambiguous" into a single `null`,
 * which is fine for chips but useless for an error message: "Bible has no book
 * called Foo" and "J could be John, Jonah, Joshua…" need different recoveries.
 */
function resolveBook(raw: string): BookResolution {
  const q = raw.toLowerCase().trim();
  if (!q) return { candidates: [] };

  const exact = BIBLE_BOOKS.find(
    (book) => book.name.toLowerCase() === q || book.aliases.some((alias) => alias.toLowerCase() === q)
  );
  if (exact) return { book: exact.name, candidates: [exact.name] };

  const prefixed = BIBLE_BOOKS.filter(
    (book) =>
      book.name.toLowerCase().startsWith(q) ||
      book.name.toLowerCase().replace(/\s/g, '').startsWith(q.replace(/\s/g, '')) ||
      book.aliases.some((alias) => alias.toLowerCase().startsWith(q))
  );
  if (prefixed.length === 1 && q.replace(/\s/g, '').length >= MIN_PREFIX_LENGTH) {
    return { book: prefixed[0].name, candidates: [prefixed[0].name] };
  }
  return { candidates: prefixed.map((book) => book.name) };
}

/** Sort by start, then merge touching/overlapping spans so the canonical form is minimal. */
function mergeSpans(spans: VerseSpan[]): VerseSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: VerseSpan[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    // `start <= last.end + 1` merges 16-17 with 18 into 16-18: same verses, one span.
    if (last && span.start <= last.end + 1) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

export function formatSpans(spans: VerseSpan[]): string {
  return spans.map((span) => (span.start === span.end ? `${span.start}` : `${span.start}-${span.end}`)).join(',');
}

/** The canonical reference string — what we show, cache under, and send. */
export function formatCanonicalReference(book: string, chapter: number, spans: VerseSpan[]): string {
  const base = `${book} ${chapter}`;
  return spans.length ? `${base}:${formatSpans(spans)}` : base;
}

function parseVerseList(raw: string, book: string, chapter: number): VerseSpan[] | ReferenceFailure {
  const pieces = raw.split(',');
  const spans: VerseSpan[] = [];

  for (const piece of pieces) {
    // Anchored: a trailing `a`, a dangling `-`, or a stray character makes the
    // whole reference malformed rather than "the part I could read".
    const match = piece.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) {
      return fail(
        'verse-malformed',
        `"${piece}" isn't a verse or verse range. Use a number, a range like 16-18, or a list like 16,18.`
      );
    }
    const start = parseInt(match[1], 10);
    const end = match[2] === undefined ? start : parseInt(match[2], 10);

    if (start < 1 || end < 1) {
      return fail('verse-zero', `Verses start at 1, so ${book} ${chapter}:${piece} isn't a verse.`);
    }
    if (end < start) {
      return fail(
        'verse-inverted',
        `${book} ${chapter}:${piece} runs backwards — did you mean ${chapter}:${end}-${start}?`
      );
    }
    spans.push({ start, end });
  }

  return mergeSpans(spans);
}

/**
 * Parse a manually typed reference. No network, no guessing, no LLM.
 *
 * Accepts: `John 3:16`, `John 3`, `John 3:16-18`, `John 3:16,18`,
 * `1 Corinthians 13:4-7`, abbreviations and numbered-book forms (`1 cor`, `1co`,
 * `i john`), and whitespace/punctuation variation (`  john  3 : 16 `, `John 3.16`,
 * en-dashed ranges).
 *
 * Rejects — with a reason, never a substitute passage — an unknown or ambiguous
 * book, a missing chapter, a chapter the book does not have, verse 0, a backwards
 * range, and anything it cannot read in full.
 */
export function parseScriptureReference(input: string): ReferenceParseResult {
  const normalized = normalizePunctuation(input ?? '');
  if (!normalized) {
    return fail('empty', 'Enter a scripture reference, for example John 3:16.');
  }

  const { book: rawBook, rest } = splitReference(normalized);

  // `splitReference` cuts at the first space-then-digit, so a locator typed with
  // no book at all ("3:16") arrives here as the *book* and would otherwise be
  // reported as an unknown book name.
  if (!rawBook || !/\p{L}/u.test(rawBook)) {
    return fail('book-missing', `"${normalized}" has no book name. Try John 3:16.`);
  }

  const { book, candidates } = resolveBook(rawBook);
  if (!book) {
    // One candidate still lands here when the query was too short to resolve by
    // prefix — "could be Ecclesiastes" is the honest answer to `q`, not "no such
    // book", and it gives the operator something to act on.
    if (candidates.length >= 1) {
      return fail(
        'book-ambiguous',
        `"${rawBook}" could be ${candidates.slice(0, 4).join(', ')}${candidates.length > 4 ? ' or others' : ''}. Type more of the name.`,
        candidates
      );
    }
    /**
     * A spelled-out locator ("John three") also lands here, because there is no
     * digit for `splitReference` to cut at and so the whole string looks like a
     * book name. Reporting "no book matches John three" would be technically
     * true and useless — John plainly is a book. If a leading run of words does
     * resolve, the real fault is the part after it.
     */
    const words = rawBook.split(' ');
    for (let take = words.length - 1; take >= 1; take -= 1) {
      const lead = resolveBook(words.slice(0, take).join(' '));
      if (lead.book) {
        const trailing = words.slice(take).join(' ');
        return fail(
          'verse-malformed',
          `Couldn't read "${trailing}" as a chapter and verse. Try ${lead.book} 3:16.`
        );
      }
    }
    return fail('book-unknown', `No Bible book matches "${rawBook}".`);
  }

  const chapterCount = getChapterCount(book);

  if (!rest) {
    /**
     * Deliberately refused. A bare book is a legible intent but a whole-book
     * fetch, which is neither a graphic nor something the operator asked for.
     *
     * The example has to match how the book is actually addressed. Suggesting
     * "Jude 1" for a one-chapter book would be self-defeating: the branch below
     * reads that as verse 1, so following the advice gives one verse, not the
     * chapter the message implied.
     */
    return fail(
      'chapter-missing',
      chapterCount === 1
        ? `${book} has one chapter — add a verse, for example ${book} 3.`
        : `Add a chapter to ${book} — for example ${book} 1.`
    );
  }

  /**
   * In a one-chapter book the WHOLE locator is a verse selection.
   *
   * `Jude 3`, `Obadiah 15`, `Philemon 6` — and equally `Jude 3-5` and
   * `Philemon 4,6` — are how every Bible names these verses, because there is no
   * chapter to name. Reading the leading number as a chapter rejected the single
   * forms as out of range and the range/list forms as malformed: `3-5` does not
   * match the `chapter[:verses]` shape at all. So they are routed to the verse
   * parser directly, with chapter fixed at 1.
   *
   * `Jude 1` resolves to `Jude 1:1` under the same rule. Verified against the
   * provider: it returns one verse and echoes `Jude 1:1`, so treating it as a
   * whole chapter put `Jude 1` in the readout above a single verse of text.
   *
   * An explicit `1:` prefix opts out — `Jude 1:3` and `Jude 1:1-25` already say
   * what they mean and take the normal path, which also keeps `Obadiah 2:1`
   * reportable as an out-of-range chapter.
   *
   * The normalisation is disclosed, not silent: the canonical readout shows
   * `Jude 1:3` immediately, so a wrong reading is visible before anything airs.
   */
  if (chapterCount === 1 && !/^\d+\s*:/.test(rest)) {
    const spans = parseVerseList(rest, book, 1);
    if ('ok' in spans) return spans;
    return {
      ok: true,
      reference: { book, chapter: 1, spans, canonical: formatCanonicalReference(book, 1, spans) }
    };
  }

  const locator = rest.match(/^(\d+)(?::(.+))?$/);
  if (!locator) {
    return fail('verse-malformed', `Couldn't read "${rest}" as a chapter and verse. Try ${book} 3:16.`);
  }

  const chapter = parseInt(locator[1], 10);
  if (chapter < 1) {
    return fail('chapter-out-of-range', `Chapters start at 1, so ${book} ${chapter} isn't a chapter.`);
  }
  if (chapterCount && chapter > chapterCount) {
    // The book table already carries chapterCount, so this is caught offline
    // rather than becoming a provider 404 the operator has to interpret.
    return fail(
      'chapter-out-of-range',
      `${book} has ${chapterCount} chapter${chapterCount === 1 ? '' : 's'}, so there is no chapter ${chapter}.`
    );
  }

  if (locator[2] === undefined) {
    return { ok: true, reference: { book, chapter, spans: [], canonical: formatCanonicalReference(book, chapter, []) } };
  }

  const spans = parseVerseList(locator[2], book, chapter);
  if ('ok' in spans) return spans;

  return {
    ok: true,
    reference: { book, chapter, spans, canonical: formatCanonicalReference(book, chapter, spans) }
  };
}

/** True when the reference names specific verses rather than a whole chapter. */
export const hasVerseSelection = (reference: CanonicalReference): boolean => reference.spans.length > 0;

/** First and last verse across every span, for range adjustment. `null` for a whole chapter. */
export function verseBounds(reference: CanonicalReference): { first: number; last: number } | null {
  if (!reference.spans.length) return null;
  return {
    first: reference.spans[0].start,
    last: reference.spans[reference.spans.length - 1].end
  };
}
