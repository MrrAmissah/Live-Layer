import { parseScriptureReference, type CanonicalReference } from './parseReference';

/**
 * "John 316" — a chapter and verse spoken as one run of digits.
 *
 * Real Whisper output from a real microphone, twice: `John 316` for "John three
 * sixteen" and `Romans 828` for "Romans eight twenty eight". The operator was
 * told John 316 is not a passage, which is true and useless — they had said the
 * most quoted verse in the Bible and been refused.
 *
 * The fix is NOT a replacement table. `316 → 3:16` would be a phrase-specific
 * patch of the kind this stage keeps refusing to add, and it would be wrong the
 * moment someone says "Psalm 119" — a real chapter that must not become 11:9.
 *
 * Instead: when a book is named and the locator is a single compact number that
 * the strict parser cannot read as a passage, try the possible chapter/verse
 * splits and let **the Bible's own structure** decide. `John 316` splits into
 * `3:16` and `31:6`; John has 21 chapters, so only one survives. `Romans 828`
 * splits into `8:28` and `82:8`; Romans has 16 chapters, so again only one.
 *
 * The safety property is that the *canon* rejects the wrong reading, not a rule
 * about which split is more likely. Where the canon does not settle it — and
 * that happens, e.g. Psalms has 150 chapters so `1191` could be 1:191, 11:91 or
 * 119:1 — this returns every survivor and lets the caller refuse or ask, rather
 * than picking the plausible one.
 *
 * ## Where this does and does not apply
 *
 * **Speech only.** The typed path is untouched: someone typing "John 316" made a
 * typo they can see and fix, and silently reinterpreting a typed reference is the
 * exact behaviour `parseScriptureReference` exists to prevent. This is a
 * spoken-path recovery, tried only after the strict parser has already refused.
 *
 * **Never invents digits.** Every candidate is a split of the digits actually
 * heard. Nothing is inserted, dropped or rounded.
 */

/** Longest compact locator worth splitting: 4 digits covers Psalm 119:176. */
const MAX_DIGITS = 4;

export interface CompactReading {
  reference: CanonicalReference;
  chapter: number;
  verse: number;
}

/**
 * Every chapter/verse split of `digits` that the strict parser accepts for `book`.
 *
 * Returns them in canonical order, longest-chapter-last, so a caller that wants
 * the single unambiguous answer can check for exactly one.
 */
export function compactReadings(book: string, digits: string): CompactReading[] {
  if (!/^\d+$/.test(digits)) return [];
  // A 2-digit locator is a chapter, and splitting it would turn Psalm 23 into
  // Psalm 2:3 — a real passage, and not the one anyone said.
  if (digits.length < 3 || digits.length > MAX_DIGITS) return [];
  // A leading zero is not a chapter anyone speaks; "oh" is handled elsewhere.
  if (digits.startsWith('0')) return [];

  const readings: CompactReading[] = [];
  for (let split = 1; split < digits.length; split += 1) {
    const chapterPart = digits.slice(0, split);
    const versePart = digits.slice(split);
    // Neither half may have a leading zero: `3016` is not 30:16 or 3:016.
    if (versePart.startsWith('0')) continue;
    const chapter = parseInt(chapterPart, 10);
    const verse = parseInt(versePart, 10);
    if (chapter < 1 || verse < 1) continue;
    /**
     * The strict parser is the authority, exactly as everywhere else in this
     * layer. It knows each book's chapter count, so it is what rejects John 31
     * and Romans 82 — this function contributes no Bible knowledge of its own.
     */
    const parsed = parseScriptureReference(`${book} ${chapter}:${verse}`);
    if (parsed.ok) readings.push({ reference: parsed.reference, chapter, verse });
  }
  return readings;
}

/**
 * The single reading, or null when the canon does not settle it.
 *
 * Null covers both "no split is a real passage" and "more than one is". Both must
 * refuse: the second is genuine ambiguity, and guessing between two real passages
 * is precisely the confident-wrong failure this whole layer exists to prevent.
 *
 * **Verse numbers are not validated** — there is no per-chapter verse data
 * bundled, which is a documented bound of this module and the reason `Psalm 1191`
 * comes back ambiguous rather than resolved. A caller that can retrieve passages
 * may narrow the survivors further by attempting the lookup.
 */
export function compactReading(book: string, digits: string): CompactReading | null {
  const readings = compactReadings(book, digits);
  return readings.length === 1 ? readings[0] : null;
}
