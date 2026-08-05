import { BIBLE_BOOKS } from './bibleBooks';
import { parseScriptureReference, type CanonicalReference } from './parseReference';

/**
 * Spoken text → candidate references. A SEPARATE boundary in front of the strict
 * parser, never a relaxation of it.
 *
 * `parseScriptureReference` exists because the chip parser used to degrade
 * anything it could not read into a different, valid-looking passage. Speech is
 * far noisier than typing, so the temptation is to loosen that parser to cope.
 * That would be exactly backwards: the strict parser stays strict, and this layer
 * turns an utterance into one or more *candidate reference strings* which are then
 * each validated through it. A candidate that the strict parser rejects is
 * discarded here — it never reaches the operator, and it certainly never reaches
 * air.
 *
 * The other rule: ambiguity produces CANDIDATES, ranked, for a human to choose
 * between. It never silently picks one. "Timothy one seven" is genuinely two
 * references, and the honest answer is to say so.
 *
 * No provider, no microphone, no model. This is string work over a transcript,
 * and it is deterministic: the same utterance always yields the same ranked list.
 */

/** Ordinals that name a numbered book. */
const BOOK_ORDINALS: Record<string, number> = {
  first: 1,
  '1st': 1,
  one: 1,
  i: 1,
  second: 2,
  '2nd': 2,
  two: 2,
  ii: 2,
  third: 3,
  '3rd': 3,
  three: 3,
  iii: 3
};

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19
};

/**
 * Ordinal forms, because a chapter is often named as one: "the third chapter",
 * "the eighth chapter of Romans". Without these the ordinal was invisible to the
 * locator and the chapter was dropped, leaving a confident wrong reading.
 */
const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
  ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14,
  fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
};

/**
 * Words a speech engine commonly returns where a different word was meant.
 *
 * Only the ones that change a REFERENCE are listed. "for"/"four" and "ate"/"eight"
 * are the common English number homophones; "to"/"too"/"two" is the important one
 * because it is ambiguous between a range marker and a number — "John three to
 * five" and "John three two five" are different references, and which was said is
 * not recoverable from the transcript. That case produces two candidates rather
 * than a guess.
 */
const HOMOPHONE_NUMBERS: Record<string, number> = {
  for: 4,
  fore: 4,
  ate: 8,
  won: 1,
  too: 2,
  to: 2,
  free: 3,
  tree: 3,
  sex: 6,
  ceven: 7
};

/** Words that mark a verse range rather than a number. */
const RANGE_WORDS = new Set(['to', 'too', 'through', 'thru', 'until', 'til', 'dash', 'hyphen']);
/** Words that separate discontinuous verses. */
const LIST_WORDS = new Set(['and', 'comma', 'plus']);
/** Words that carry no reference meaning and are dropped. */
const FILLER = new Set([
  'chapter',
  'chapters',
  'verse',
  'verses',
  'the',
  'book',
  'of',
  'from',
  'in',
  'at',
  'colon',
  'reading',
  'turn',
  'please',
  'lets',
  "let's",
  'go',
  'read',
  'scripture',
  'says',
  'said',
  'according'
]);

export type SpokenProblem = 'empty' | 'no-book' | 'no-numbers' | 'unresolvable';

export interface SpokenCandidate {
  /** The reference string handed to the strict parser. */
  raw: string;
  /** Canonical form, as the strict parser accepted it. */
  reference: CanonicalReference;
  /** Plain-language account of how this reading was reached. */
  interpretation: string;
  /**
   * Ordering weight only — NOT a probability and not a confidence the operator
   * should trust numerically. Higher sorts first.
   */
  score: number;
}

/** One reference heard in the transcript, with its own ranked readings. */
export interface SpokenReferenceGroup {
  /** The transcript words this reference came from, for the operator to check. */
  heard: string;
  candidates: SpokenCandidate[];
}

export type SpokenParseResult =
  | {
      ok: true;
      /** Every reading, grouped by reference and in transcript order. */
      candidates: SpokenCandidate[];
      groups: SpokenReferenceGroup[];
      message: string;
    }
  | { ok: false; problem: SpokenProblem; message: string };

const fail = (problem: SpokenProblem, message: string): SpokenParseResult => ({ ok: false, problem, message });

/** Strip punctuation and case, and split into words. */
function tokenize(transcript: string): string[] {
  return transcript
    .toLowerCase()
    .replace(/[.,;:!?"“”'’]/g, ' ')
    .replace(/(\d)\s*-\s*(\d)/g, '$1 to $2')
    .replace(/[-–—]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Collapse a run of number words into a value: `twenty three` → 23.
 * Returns the value and how many tokens it consumed.
 */
function readNumber(tokens: string[], at: number, foundSoFar = 0): { value: number; used: number } | null {
  const first = tokens[at];
  if (first === undefined) return null;

  if (/^\d+$/.test(first)) return { value: parseInt(first, 10), used: 1 };

  /**
   * Number homophones, read as numbers only where a number is being looked for.
   * `to` is deliberately NOT resolved here — it is handled as a range marker by
   * the caller, because "John three to five" and "John three two five" are
   * different references and the transcript cannot tell them apart. Treating it
   * as a number here would silently pick one.
   */
  /**
   * Only while the reference is still incomplete. These words — `for`, `ate`,
   * `won` — are ordinary English, and a preacher who says the reference and then
   * begins QUOTING it ("Romans eight verse one, for there is therefore now no
   * condemnation") was handing the parser a phantom fourth number, which ranked
   * `Romans 8:1-4` above the `Romans 8:1` actually spoken.
   */
  if (foundSoFar < 2 && HOMOPHONE_NUMBERS[first] !== undefined && first !== 'to' && first !== 'too') {
    return { value: HOMOPHONE_NUMBERS[first], used: 1 };
  }

  if (ORDINALS[first] !== undefined) return { value: ORDINALS[first], used: 1 };

  if (TENS[first] !== undefined) {
    const next = tokens[at + 1];
    // `twenty three` is one number; `twenty` alone is still twenty.
    if (next && UNITS[next] !== undefined && UNITS[next] < 10) {
      return { value: TENS[first] + UNITS[next], used: 2 };
    }
    return { value: TENS[first], used: 1 };
  }

  if (UNITS[first] !== undefined) {
    // `one hundred` and beyond only matters for Psalms; handled as a pair.
    if (tokens[at + 1] === 'hundred') {
      /**
       * "one hundred AND nineteen" is standard British and Ghanaian English, and
       * `and` is otherwise a list separator — so it was splitting the number and
       * "Psalm one hundred and nineteen" became Psalms 100:19. A real verse from
       * the wrong chapter, which the operator had nothing to catch it with.
       */
      const bridged = tokens[at + 2] === 'and' ? 1 : 0;
      const after = readNumber(tokens, at + 2 + bridged);
      const base = UNITS[first] * 100;
      if (after && after.value < 100) return { value: base + after.value, used: 2 + bridged + after.used };
      return { value: base, used: 2 };
    }
    return { value: UNITS[first], used: 1 };
  }

  return null;
}

/** Exact book match for the `span` tokens at `at`, by canonical name or alias. */
function readBook(tokens: string[], at: number, span: number): string | null {
  const phrase = tokens.slice(at, at + span).join(' ');
  const squashed = phrase.replace(/\s/g, '');
  const hit = BIBLE_BOOKS.find(
    (book) =>
      book.name.toLowerCase() === phrase ||
      book.name.toLowerCase().replace(/\s/g, '') === squashed ||
      book.aliases.some((alias) => alias.toLowerCase() === phrase || alias.toLowerCase().replace(/\s/g, '') === squashed)
  );
  return hit ? hit.name : null;
}

/** The numbered-book families whose stem is exactly this phrase. */
function numberedSiblings(stem: string): string[] {
  return BIBLE_BOOKS.filter((book) => /^\d /.test(book.name) && book.name.slice(2).toLowerCase() === stem).map(
    (book) => book.name
  );
}

interface BookMatch {
  /** Where the book phrase started and how many tokens it took. */
  at: number;
  used: number;
  /** Candidate book names this phrase could mean, best first. */
  names: { name: string; penalty: number; note: string }[];
}

/**
 * True when a number follows this book phrase, allowing filler between.
 *
 * This is what separates a book the speaker NAMED from an English word that
 * happens to be a book. `is` is an alias of Isaiah, `am` of Amos, and `Mark`,
 * `Numbers`, `Job` and `Song` are ordinary words — so scanning for the first
 * match turned "This is John chapter three verse sixteen" into **Isaiah 3:16**,
 * with a single high-scored candidate and no hint that "John" was ever spoken.
 * The worst possible failure for this surface: a confident wrong book.
 *
 * A reference is always followed by its numbers, so requiring that is a cheap and
 * decisive discriminator: `is` in "this is John…" is followed by "john", while
 * "John" is followed by "chapter three".
 */
function numberFollows(tokens: string[], from: number): boolean {
  for (let i = from; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (readNumber(tokens, i, 0)) return true;
    // Structural words may sit between the book and its numbers; anything else
    // means the numbers are not this phrase's.
    if (FILLER.has(token) || RANGE_WORDS.has(token) || LIST_WORDS.has(token)) continue;
    return false;
  }
  return false;
}

interface BookMatch {
  at: number;
  used: number;
  names: { name: string; penalty: number; note: string }[];
}

/** Every book phrase in the utterance, longest span first at each position. */
function collectBookMatches(tokens: string[]): BookMatch[] {
  const found: BookMatch[] = [];
  for (let at = 0; at < tokens.length; at += 1) {
    for (let span = Math.min(4, tokens.length - at); span >= 1; span -= 1) {
      const phrase = tokens.slice(at, at + span).join(' ');
      const hit = readBook(tokens, at, span);
      const siblings = numberedSiblings(phrase);
      if (!hit && !siblings.length) continue;

      const previous = at > 0 ? tokens[at - 1] : undefined;
      const ordinal = previous !== undefined ? BOOK_ORDINALS[previous] : undefined;
      if (ordinal !== undefined) {
        const numbered = `${ordinal} ${phrase}`;
        const exact = BIBLE_BOOKS.find((book) => book.name.toLowerCase() === numbered);
        if (exact) {
          found.push({ at: at - 1, used: span + 1, names: [{ name: exact.name, penalty: 0, note: '' }] });
          break;
        }
      }

      if (hit) {
        // A phrase that is a book in its own right is taken at its word rather
        // than expanded into its numbered siblings.
        found.push({ at, used: span, names: [{ name: hit, penalty: 0, note: '' }] });
      } else {
        // A bare stem that is NOT a book is genuinely ambiguous; offer the family.
        found.push({
          at,
          used: span,
          names: siblings.map((name, index) => ({
            name,
            penalty: index * 4,
            note: ` — "${name.slice(0, 1)}" was not spoken`
          }))
        });
      }
      break;
    }
  }
  return found;
}

/**
 * Choose the book the speaker meant.
 *
 * Prefers a match whose numbers immediately follow it, then the longest phrase,
 * then the latest position — a reference tends to come after the preamble, and a
 * longer phrase ("song of songs") beats a shorter one inside it. Falls back to the
 * first match when nothing is followed by numbers, so "John" alone still reports
 * no-numbers rather than no-book.
 */
function findBook(tokens: string[]): BookMatch | null {
  const all = collectBookMatches(tokens);
  if (!all.length) return null;

  const withNumbers = all.filter((match) => numberFollows(tokens, match.at + match.used));
  const pool = withNumbers.length ? withNumbers : all;

  return pool.reduce((best, match) => {
    if (match.used > best.used) return match;
    if (match.used === best.used && match.at > best.at) return match;
    return best;
  }, pool[0]);
}

interface Locator {
  numbers: number[];
  /** Index in `numbers` where a range began. */
  rangeAfter: Set<number>;
  listAfter: Set<number>;
}

function readLocator(tokens: string[], from: number, until = tokens.length): Locator {
  const numbers: number[] = [];
  const rangeAfter = new Set<number>();
  const listAfter = new Set<number>();
  let pendingRange = false;
  let pendingList = false;

  for (let i = from; i < until; ) {
    const token = tokens[i];

    /**
     * Consumed as structure, and nothing more. An earlier version recorded an
     * `explicit` flag here and added a constant to every candidate from the same
     * locator — which could not change their relative order, because they all got
     * it. A scoring term that mathematically cannot influence ranking is worse
     * than no term: it reads as a tie-breaker that is doing something.
     */
    if (token === 'chapter' || token === 'verse' || token === 'verses' || token === 'chapters') {
      i += 1;
      continue;
    }
    if (RANGE_WORDS.has(token)) {
      pendingRange = true;
      i += 1;
      continue;
    }
    if (LIST_WORDS.has(token)) {
      pendingList = true;
      i += 1;
      continue;
    }
    if (FILLER.has(token)) {
      i += 1;
      continue;
    }

    const num = readNumber(tokens, i, numbers.length);
    if (num) {
      if (pendingRange) rangeAfter.add(numbers.length - 1);
      if (pendingList) listAfter.add(numbers.length - 1);
      pendingRange = false;
      pendingList = false;
      numbers.push(num.value);
      i += num.used;
      continue;
    }

    i += 1;
  }

  return { numbers, rangeAfter, listAfter };
}

/** Build the reference strings a locator could plausibly mean, best first. */
function buildRawReferences(book: string, loc: Locator): { raw: string; why: string; score: number }[] {
  const { numbers, rangeAfter, listAfter } = loc;
  const out: { raw: string; why: string; score: number }[] = [];
  if (!numbers.length) return out;

  const [a, b, c] = numbers;

  if (numbers.length === 1) {
    out.push({ raw: `${book} ${a}`, why: `chapter ${a}`, score: 60 });
    return out;
  }

  if (numbers.length === 2) {
    if (listAfter.has(0)) {
      /**
       * "Genesis one AND two" is two chapters. The marker was already recorded and
       * then ignored, so it became Genesis 1:2 — a real verse, silently. Chapter
       * ranges are not a thing this app can show, so each chapter is offered
       * separately and the verse reading is kept as a lower-ranked possibility.
       */
      out.push({ raw: `${book} ${a}`, why: `chapter ${a} (of ${a} and ${b} — one graphic per chapter)`, score: 74 });
      out.push({ raw: `${book} ${b}`, why: `chapter ${b} (of ${a} and ${b} — one graphic per chapter)`, score: 72 });
      out.push({ raw: `${book} ${a}:${b}`, why: `chapter ${a}, verse ${b}`, score: 40 });
      return out;
    }
    if (rangeAfter.has(0)) {
      // "Psalm twenty three to twenty four" — chapters, or verses of one chapter.
      out.push({ raw: `${book} ${a}:${b}`, why: `chapter ${a}, verse ${b}`, score: 50 });
      out.push({ raw: `${book} ${a}`, why: `chapter ${a} (range of chapters is not supported)`, score: 20 });
      return out;
    }
    out.push({ raw: `${book} ${a}:${b}`, why: `chapter ${a}, verse ${b}`, score: 90 });
    return out;
  }

  // Three or more numbers: chapter, then a verse range or list.
  // Anything past the third number is not represented; say so rather than
  // truncating in silence.
  const dropped = numbers.length > 3 ? ` (ignoring ${numbers.slice(3).join(', ')})` : '';
  if (rangeAfter.has(1)) {
    out.push({ raw: `${book} ${a}:${b}-${c}`, why: `chapter ${a}, verses ${b} to ${c}${dropped}`, score: 92 });
  } else if (listAfter.has(1)) {
    out.push({ raw: `${book} ${a}:${b},${c}`, why: `chapter ${a}, verses ${b} and ${c}${dropped}`, score: 88 });
  } else {
    // No spoken connector. Both readings are real; a range is the common one.
    out.push({ raw: `${book} ${a}:${b}-${c}`, why: `chapter ${a}, verses ${b} to ${c}`, score: 70 });
    out.push({ raw: `${book} ${a}:${b}`, why: `chapter ${a}, verse ${b} (ignoring "${c}")`, score: 45 });
  }
  return out;
}

/**
 * Interpret a transcript as Scripture references.
 *
 * Every candidate is validated through `parseScriptureReference`, so anything it
 * rejects — a chapter the book does not have, verse 0, a backwards range — is
 * dropped here rather than shown. Candidates are ranked for ordering only; the
 * operator chooses.
 */
/**
 * Resolve ONE book span into ranked candidates.
 *
 * `until` is a hard boundary at the next book, which is what stops numbers
 * crossing a reference: "John three sixteen and Romans eight twenty eight" used to
 * read every number after "John" and fold them into a single synthetic
 * `John 3:8,16` — a real verse, from numbers belonging to two different books.
 */
function resolveSpan(tokens: string[], match: BookMatch, until: number, spanStart = 0): SpokenCandidate[] {
  const bookNames = match.names;
  /**
   * A chapter spoken BEFORE the book — "in the third chapter of John verse
   * sixteen" — is ordinary pulpit phrasing, and the locator only reads forward, so
   * the chapter was dropped and "John 16" was offered as a confident single
   * candidate. Valid, and not what was said.
   */
  let preChapter: number | null = null;
  const before = tokens.slice(spanStart, match.at);
  const chapterAt = before.lastIndexOf('chapter');
  if (chapterAt >= 0) {
    // Either order: "third chapter" and "chapter three" are both said.
    const trailing = readNumber(before, chapterAt + 1, 0);
    const leading = chapterAt > 0 ? readNumber(before, chapterAt - 1, 0) : null;
    if (trailing && trailing.used === 1) preChapter = trailing.value;
    else if (leading && leading.used === 1) preChapter = leading.value;
    else if (chapterAt > 0 && BOOK_ORDINALS[before[chapterAt - 1]] !== undefined) {
      preChapter = BOOK_ORDINALS[before[chapterAt - 1]];
    }
  }

  const locator = readLocator(tokens, match.at + match.used, until);
  if (preChapter !== null) {
    // The trailing numbers are verses, so the chapter goes in front of them.
    locator.numbers = [preChapter, ...locator.numbers];
  }
  // No numbers in this span — the caller decides whether that is the whole
  // utterance's failure or just a bare mention alongside a good reference.
  if (!locator.numbers.length) return [];

  const seen = new Set<string>();
  const candidates: SpokenCandidate[] = [];

  for (const book of bookNames) {
    for (const built of buildRawReferences(book.name, locator)) {
      // The strict parser is the gate. A reading it rejects is never offered.
      const parsed = parseScriptureReference(built.raw);
      if (!parsed.ok) continue;
      const key = parsed.reference.canonical;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        raw: built.raw,
        reference: parsed.reference,
        interpretation: `${book.name} ${built.why}${book.note}`,
        score: built.score - book.penalty
      });
    }
  }

  /**
   * Hundreds compounds are genuinely ambiguous in speech, and greedy reading can
   * produce a chapter that does not exist. "Psalm one hundred fifty one" is either
   * chapter 151 — which Psalms does not have — or chapter 150, verse 1. The greedy
   * reading wins when it is valid (Psalm 119 is a real chapter, so "one hundred
   * nineteen one" stays 119:1); only when NOTHING survived is the split offered,
   * which keeps a plausible utterance usable instead of refused.
   */
  if (!candidates.length && locator.numbers.length && locator.numbers[0] > 100) {
    const compound = locator.numbers[0];
    const trailing = compound % 10;
    const split = compound - trailing;
    if (trailing > 0 && split > 0) {
      const retry: Locator = {
        ...locator,
        numbers: [split, trailing, ...locator.numbers.slice(1)]
      };
      for (const book of bookNames) {
        for (const built of buildRawReferences(book.name, retry)) {
          const parsed = parseScriptureReference(built.raw);
          if (!parsed.ok) continue;
          if (seen.has(parsed.reference.canonical)) continue;
          seen.add(parsed.reference.canonical);
          candidates.push({
            raw: built.raw,
            reference: parsed.reference,
            interpretation: `${book.name} ${built.why} — reading "${compound}" as ${split} then ${trailing}`,
            score: built.score - book.penalty - 10
          });
        }
      }
    }
  }

  if (!candidates.length) return [];


  candidates.sort((x, y) => y.score - x.score || x.reference.canonical.localeCompare(y.reference.canonical));
  return candidates;
}

export function parseSpokenReference(transcript: string): SpokenParseResult {
  const tokens = tokenize(transcript ?? '');
  if (!tokens.length) {
    return fail('empty', 'No transcript yet.');
  }

  /**
   * Every book that is actually followed by numbers becomes its own span, in
   * transcript order. A bare mention with no numbers is NOT a span — otherwise a
   * passing "in John" would steal the numbers of the reference beside it.
   */
  const all = collectBookMatches(tokens);
  if (!all.length) {
    return fail('no-book', `Couldn't find a Bible book in "${transcript.trim()}".`);
  }
  const anchored = all.filter((m) => numberFollows(tokens, m.at + m.used));
  const spans = anchored.length ? anchored : [findBook(tokens)!];

  const groups: SpokenReferenceGroup[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < spans.length; index += 1) {
    const match = spans[index];
    // Hard boundary at the next span's book, so numbers cannot cross.
    const until = index + 1 < spans.length ? spans[index + 1].at : tokens.length;
    const spanStart = index === 0 ? 0 : spans[index - 1].at + spans[index - 1].used;
    const resolved = resolveSpan(tokens, match, until, spanStart);

    // Repeated mentions of the same passage collapse; a malformed span is simply
    // skipped and cannot corrupt a good one.
    const fresh = resolved.filter((candidate) => {
      if (seen.has(candidate.reference.canonical)) return false;
      seen.add(candidate.reference.canonical);
      return true;
    });
    if (!fresh.length) continue;

    groups.push({ heard: tokens.slice(match.at, until).join(' '), candidates: fresh });
  }

  if (!groups.length) {
    const named = spans[0].names[0].name;
    const numbers = readLocator(tokens, spans[0].at + spans[0].used).numbers;
    if (!numbers.length) {
      return fail('no-numbers', `Heard "${named}" but no chapter or verse.`);
    }
    return fail(
      'unresolvable',
      `Heard "${named}" with ${numbers
        .map((n) => (Number.isSafeInteger(n) ? String(n) : 'a number too large to be a chapter'))
        .join(', ')}, but that is not a passage that exists.`
    );
  }

  /**
   * Candidates stay grouped by reference and are NOT re-ranked globally — that
   * would interleave two passages' readings and lose transcript order. Within a
   * group they are ranked; across groups the transcript decides.
   */
  const candidates = groups.flatMap((group) => group.candidates);
  const message =
    groups.length > 1
      ? `${groups.length} passages heard — choose one.`
      : candidates.length > 1
        ? `${candidates.length} readings — choose one.`
        : `Heard ${candidates[0].reference.canonical}.`;

  return { ok: true, candidates, groups, message };
}

/** True when more than one reading survived and the operator must choose. */
export const isAmbiguous = (result: SpokenParseResult): boolean => result.ok && result.candidates.length > 1;

/** True when the transcript named more than one distinct passage. */
export const hasMultipleReferences = (result: SpokenParseResult): boolean => result.ok && result.groups.length > 1;
