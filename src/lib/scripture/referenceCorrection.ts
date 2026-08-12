import { parseScriptureReference, type CanonicalReference } from './parseReference';
import { matchSpokenBook } from './spokenBookLexicon';

/**
 * "No, verse three" — amending the reference already on screen.
 *
 * A preacher correcting themselves mid-sentence is completely ordinary, and until
 * now LiveLayer treated the correction as a brand-new utterance: a fragment with
 * no book in it, which the parser rightly refused, which then cleared a passage
 * that was correct. The operator lost a good verse because the speaker did
 * something entirely normal.
 *
 * This reads such a fragment as an AMENDMENT to a reference that already exists.
 *
 * ## What keeps it bounded
 *
 * It is not fuzzy natural language and it is not another round of lexical repair.
 * Four constraints, and the first is the one doing the real work:
 *
 * 1. **A correction never names a book.** If a book is spoken, the utterance is a
 *    new reference and the ordinary path owns it. This is what separates "verse
 *    three instead" from "John three sixteen", and it needs no list of allowed
 *    phrasings to do it.
 * 2. **It must be short.** Corrections are fragments. A sentence of preaching that
 *    happens to contain "verse three" is not a correction, and the length cap plus
 *    the unclassified-word budget below is what says so.
 * 3. **Only chapter, verse and range may be amended.** Never the book, and never
 *    from arbitrary prose.
 * 4. **The result must survive the strict parser.** An amendment that produces an
 *    impossible reference is refused, not repaired into a different valid one.
 *
 * And the constraint that makes all of it safe: **it only runs when a stable
 * reference is already displayed.** With nothing on screen, "verse three instead"
 * means nothing and is refused — which is what stops a sermon's numbers from
 * being turned into Scripture.
 *
 * ## What it does not decide
 *
 * Whether to SHOW the result. This returns a reference string; the caller still
 * validates it, retrieves it, and only then replaces what the operator is reading.
 * A correction that cannot be retrieved must leave the previous passage alone.
 */

/** Words that mark an utterance as a correction rather than a statement. */
const TRIGGERS = new Set([
  'no',
  'not',
  'instead',
  'rather',
  'mean',
  'meant',
  'make',
  'made',
  'actually',
  'sorry',
  'correction',
  'change'
]);

/** The parts of a reference a correction is allowed to name. */
const STRUCTURAL = new Set(['chapter', 'chapters', 'verse', 'verses']);

/** Words that carry no meaning here and are neither evidence for nor against. */
const IGNORED = new Set([
  'i',
  'it',
  'that',
  'thats',
  "that's",
  'the',
  'a',
  'to',
  'of',
  'is',
  'was',
  'said',
  'says',
  'go',
  'lets',
  "let's",
  'please',
  'um',
  'uh',
  'er'
]);

const RANGE = new Set(['through', 'thru', 'to', 'until', 'til', 'dash', 'hyphen']);

/**
 * At most this many tokens, and at most this many the grammar cannot account for.
 *
 * Both are needed. The length cap alone would admit "in verse three we see that",
 * and the unclassified budget alone would admit a long sentence made mostly of
 * ignorable words. Two stray tokens is what "He said verse three instead" costs,
 * which is the phrasing a real person actually uses.
 */
const MAX_TOKENS = 8;
const MAX_UNCLASSIFIED = 2;

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s:-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);

const numberAt = (tokens: string[], at: number): number | null => {
  const token = tokens[at];
  if (token === undefined) return null;
  return /^\d+$/.test(token) ? parseInt(token, 10) : null;
};

export interface Correction {
  /** The amended reference, exactly as the strict parser accepted it. */
  reference: CanonicalReference;
  /** Plain-language account for the operator: "heard \"verse 3\" — Romans 8:28 → Romans 8:3". */
  interpretation: string;
}

/**
 * Read `transcript` as an amendment to `current`, or return null.
 *
 * Null is the common and correct answer: most speech is not a correction, and the
 * caller falls back to interpreting the utterance normally.
 */
export function readCorrection(transcript: string, current: CanonicalReference | null): Correction | null {
  if (!current) return null; // nothing to amend — a bare fragment means nothing
  const tokens = tokenize(transcript);
  if (!tokens.length || tokens.length > MAX_TOKENS) return null;

  /**
   * A named book means this is a new reference, not an amendment. Checked across
   * every position and every phrase length a book name can occupy, because "first
   * John" and "song of solomon" are not single tokens.
   */
  for (let at = 0; at < tokens.length; at += 1) {
    for (let span = Math.min(4, tokens.length - at); span >= 1; span -= 1) {
      if (matchSpokenBook(tokens.slice(at, at + span).join(' '))) return null;
    }
  }

  let chapter: number | null = null;
  let verse: number | null = null;
  let endVerse: number | null = null;
  let sawStructural = false;
  let sawTrigger = false;
  let unclassified = 0;
  const loose: number[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (TRIGGERS.has(token)) {
      sawTrigger = true;
      continue;
    }
    if (STRUCTURAL.has(token)) {
      sawStructural = true;
      const value = numberAt(tokens, i + 1);
      if (value === null) continue;
      if (token.startsWith('chapter')) chapter = value;
      else {
        verse = value;
        // "verses three through five" — a range is a legitimate amendment.
        if (RANGE.has(tokens[i + 2] ?? '')) {
          const end = numberAt(tokens, i + 3);
          if (end !== null) endVerse = end;
        }
      }
      i += 1;
      continue;
    }
    const value = numberAt(tokens, i);
    if (value !== null) {
      loose.push(value);
      continue;
    }
    if (IGNORED.has(token) || RANGE.has(token)) continue;
    unclassified += 1;
  }

  if (unclassified > MAX_UNCLASSIFIED) return null;
  if (!sawStructural && !sawTrigger) return null;

  /**
   * Numbers with no structural word attached — "not twenty eight, three", which
   * the recogniser returns as `Not 28, 3`. Read only under a trigger, and only in
   * the shape a correction actually takes: either a single replacement verse, or
   * the old verse followed by the new one. Anything else is ambiguous and refused
   * rather than guessed.
   */
  if (chapter === null && verse === null && loose.length) {
    if (!sawTrigger) return null;
    const spoken = current.spans[0]?.start ?? null;
    if (loose.length === 1) verse = loose[0];
    else if (loose.length === 2 && loose[0] === spoken) verse = loose[1];
    else return null;
  }

  if (chapter === null && verse === null) return null;

  /**
   * An amendment inherits everything it did not name. "Verse three" keeps the
   * book AND the chapter; "chapter nine" keeps the book and deliberately drops the
   * verse, because the verse belonged to the chapter being replaced and carrying
   * it over would invent a reference nobody spoke.
   */
  const amendedChapter = chapter ?? current.chapter;
  const changedChapter = chapter !== null && chapter !== current.chapter;
  const amendedVerse = verse ?? (changedChapter ? null : current.spans[0]?.start ?? null);
  const amendedEnd = verse !== null ? endVerse : changedChapter ? null : current.spans[0]?.end ?? null;

  const locator =
    amendedVerse === null
      ? `${current.book} ${amendedChapter}`
      : `${current.book} ${amendedChapter}:${amendedVerse}${
          amendedEnd && amendedEnd !== amendedVerse ? `-${amendedEnd}` : ''
        }`;

  const parsed = parseScriptureReference(locator);
  // The strict parser is still the authority. An amendment that cannot survive it
  // is refused outright — never repaired into some other passage that can.
  if (!parsed.ok) return null;
  if (parsed.reference.canonical === current.canonical) return null; // not a change

  return {
    reference: parsed.reference,
    interpretation: `heard a correction — ${current.canonical} → ${parsed.reference.canonical}`
  };
}
