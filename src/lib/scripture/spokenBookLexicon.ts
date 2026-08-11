import { BIBLE_BOOKS } from './bibleBooks';

/**
 * What a Bible book sounds like when a person says it — and what to do when the
 * recogniser almost gets it.
 *
 * ## The architectural finding this exists for
 *
 * `bibleBooks.ts` carries an `aliases` list built for **typing**: `jn`, `jhn`,
 * `joh`, `ps`, `is`, `am`, `gen`. Those are correct there. The spoken parser
 * matched against the same list, and that is how Stage 5's worst failure happened:
 * a recogniser rendered "John" as `jon`, `jon` is a declared alias of **Jonah**,
 * and the parser confidently produced Jonah 3:16 for an utterance that named John.
 * No fuzzy matching was involved — the parser did exactly what the table told it.
 *
 * > **An alias valid for typed input is not automatically valid for spoken input.**
 *
 * Nobody *says* "jn" or "jon". Those strings appear in a transcript only as a
 * mis-transcription of something else, so on the spoken path they must not be
 * matchable at all. This module is that policy, kept separate from `bibleBooks.ts`
 * so the typed path keeps its abbreviations untouched.
 *
 * ## Two layers, and the second one is allowed to refuse
 *
 * 1. **Exact spoken forms** — the 66 canonical names plus a short, explicit list of
 *    variants people genuinely say. Nothing else matches with full confidence.
 * 2. **Constrained recovery** — when a token in reference position is not a spoken
 *    form, it may be recovered to one, but only under conditions tight enough that
 *    refusing is the common outcome. This is deliberately NOT general fuzzy
 *    matching: a matcher that always returns its nearest neighbour would turn every
 *    unrecognised noun into scripture, which is a far worse failure than refusing.
 */

/**
 * Forms a person actually says that are not the canonical name.
 *
 * Kept short and justified case by case. Anything not here and not canonical is
 * only reachable through recovery, which can refuse.
 */
const SPOKEN_VARIANTS: Record<string, string> = {
  // "Psalm twenty three" is how it is said; the book is titled Psalms.
  psalm: 'Psalms',
  // Both titles are in ordinary use from a pulpit.
  'song of solomon': 'Song of Songs',
  canticles: 'Song of Songs',
  // Extremely common spoken plural, and not in the typed alias table.
  revelations: 'Revelation',
  apocalypse: 'Revelation'
};

/** Canonical names plus the spoken variants. Written abbreviations excluded. */
export const SPOKEN_BOOK_FORMS: Map<string, string> = (() => {
  const forms = new Map<string, string>();
  for (const book of BIBLE_BOOKS) forms.set(book.name.toLowerCase(), book.name);
  for (const [form, name] of Object.entries(SPOKEN_VARIANTS)) forms.set(form, name);
  return forms;
})();

/** Exact spoken match. `null` means "not something a person says". */
export function matchSpokenBook(phrase: string): string | null {
  const key = phrase.trim().toLowerCase();
  return SPOKEN_BOOK_FORMS.get(key) ?? SPOKEN_BOOK_FORMS.get(key.replace(/\s+/g, ' ')) ?? null;
}

/**
 * Numbered-book **stems** as they are spoken — "corinthians", "timothy", "john".
 *
 * Recovery targets these too, because a corrupted stem ("corintians") must still
 * reach the family so the existing sibling logic can offer 1 and 2 Corinthians
 * together rather than picking one.
 */
export const SPOKEN_BOOK_STEMS: Set<string> = new Set(
  BIBLE_BOOKS.filter((book) => /^\d /.test(book.name)).map((book) => book.name.slice(2).toLowerCase())
);

/** Everything recovery is allowed to aim at: spoken forms and numbered stems. */
const RECOVERY_TARGETS: string[] = [...new Set([...SPOKEN_BOOK_FORMS.keys(), ...SPOKEN_BOOK_STEMS])];

/**
 * Damerau-Levenshtein — Levenshtein plus adjacent transposition.
 *
 * The transposition case is not decoration: a recogniser emitting `jamse` for
 * "James" is two substitutions away under plain Levenshtein and one swap away
 * under this, and the threshold below is tight enough that the difference decides
 * whether a real utterance is recovered or refused.
 */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j += 1) d[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * How wrong a word may be and still be recovered, by length of the target.
 *
 * One edit for short names, two for long ones. Not a ratio: a ratio lets a
 * six-letter error through on a twelve-letter book, and "Deuteronomy" six letters
 * wrong is not Deuteronomy — it is a different word that happens to be near it.
 */
const budgetFor = (target: string): number => (target.length >= 8 ? 2 : 1);

const VOWEL = /[aeiouy]/;

/**
 * Eligible to be recovered at all.
 *
 * **Must contain a vowel.** This is the cheap, principled line between the two
 * kinds of string that reach this function: written abbreviations are typically
 * vowel-stripped (`jn`, `jhn`, `mk`, `ps`, `rv`, `jnh`), while a recogniser
 * rendering speech produces pronounceable output (`jon`, `salm`, `luoke`). It
 * keeps the typed-abbreviation family unmatchable on the spoken path even when it
 * happens to sit one edit from a real book — `jhn` is one edit from `john`, and
 * recovering it would quietly reintroduce written abbreviations by the back door.
 *
 * **Must be at least three characters.** Below that there is not enough signal:
 * two-letter tokens sit within one edit of several books at once, and `is`/`am`
 * are ordinary English words.
 */
function eligible(token: string): boolean {
  return token.length >= 3 && VOWEL.test(token);
}

export interface SpokenBookRecovery {
  /** Canonical name, or a numbered stem for the caller to expand. */
  target: string;
  /** True when `target` is a family stem rather than a book. */
  isStem: boolean;
  /** Edits between what was heard and the target. */
  distance: number;
  /** What was actually heard, for the operator-facing explanation. */
  heard: string;
}

/**
 * Recover a corrupted book name, or refuse.
 *
 * Returns **every** target that ties for closest, not just one. A tie is real
 * ambiguity and the caller offers the alternatives; collapsing it to a single
 * answer is how a guess acquires the appearance of confidence. An empty result
 * means refuse, and refusing is the intended outcome for anything that is not
 * clearly one book.
 *
 * Deliberately NOT scored by "nearest neighbour wins": a nearest neighbour always
 * exists. The budget is absolute, so a word far from every book returns nothing at
 * all rather than the least-far book.
 */
export function recoverSpokenBook(phrase: string): SpokenBookRecovery[] {
  const heard = phrase.trim().toLowerCase();
  if (!eligible(heard)) return [];
  if (SPOKEN_BOOK_FORMS.has(heard) || SPOKEN_BOOK_STEMS.has(heard)) return [];

  let best = Number.POSITIVE_INFINITY;
  let hits: SpokenBookRecovery[] = [];
  for (const target of RECOVERY_TARGETS) {
    const budget = budgetFor(target);
    const distance = editDistance(heard, target);
    if (distance > budget || distance > best) continue;
    const entry: SpokenBookRecovery = {
      target: SPOKEN_BOOK_FORMS.get(target) ?? target,
      isStem: !SPOKEN_BOOK_FORMS.has(target),
      distance,
      heard
    };
    if (distance < best) {
      best = distance;
      hits = [entry];
    } else {
      hits.push(entry);
    }
  }

  /**
   * Break ties by **how** the word is wrong, not just how much.
   *
   * `jon` sits one edit from both `john` (a dropped letter) and `job` (a changed
   * one), and picking by distance alone is a coin flip — which is exactly how the
   * Stage 5 failure reappeared as Job 3:16 instead of Jonah 3:16. A different
   * wrong answer is not a fix.
   *
   * Dropped letters win, because that is the error a recogniser actually makes:
   * `jon` for John, `salm` for Psalm, `corintians` for Corinthians are all the
   * target with something missing. A changed final consonant turns a word into a
   * *different* word, and preferring it would mean reading the word that was not
   * said. Expressed as a subsequence test — is the heard token the target with
   * letters removed — which is general, not a list of pairs.
   */
  const subsequence = (short: string, long: string): boolean => {
    let i = 0;
    for (const ch of long) if (i < short.length && short[i] === ch) i += 1;
    return i === short.length;
  };
  const droppedLetters = hits.filter((hit) => subsequence(heard, hit.target.toLowerCase()));
  let chosen = droppedLetters.length ? droppedLetters : hits;

  /**
   * Still genuinely undecided between three or more books? Refuse. Recovery is
   * allowed to be confident or silent; offering a fan of equally-likely books is
   * the "always guesses" behaviour this layer exists to avoid, and the operator
   * can always type the reference.
   */
  if (chosen.length > 2) chosen = [];

  // Collapse targets that resolve to the same book (a canonical name and its
  // variant can both be within budget) without losing genuine alternatives.
  const seen = new Set<string>();
  return chosen.filter((hit) => {
    const key = `${hit.target}|${hit.isStem}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The operator-facing explanation for a recovered book. Never silent. */
export const describeRecovery = (recovery: SpokenBookRecovery): string =>
  ` — heard "${recovery.heard}"`;


/**
 * The small closed set of words that hold a spoken reference together.
 *
 * Not vocabulary — *syntax*. "chapter three verse sixteen" is a grammar, and these
 * are its joints. A recogniser damaging one of them does not change which passage
 * was named; it breaks the parser's ability to see that a passage was named at all.
 */
const STRUCTURAL_WORDS = [
  'chapter', 'chapters', 'verse', 'verses', 'through', 'colon'
];

/**
 * Recover a corrupted structural word — or refuse.
 *
 * A real microphone produced **"jon chapter three vers sixteen"**. The locator
 * stopped at `vers`, because an ordinary word ending a reference is what stops
 * "Acts two, there were about three thousand souls" from becoming Acts 2:3. So it
 * returned **John 3** and silently discarded "sixteen" — a coarser passage than the
 * one named, presented with no sign that anything was lost. On air that is a whole
 * chapter where a verse was asked for.
 *
 * The guards are deliberately tighter than the book recovery, because this runs
 * against sermon prose rather than against a token already known to sit in
 * reference position:
 *
 * - **One edit only**, whatever the length. These words are short and common.
 * - **At least four characters**, so `to`, `and` and `is` are untouchable.
 * - **A vowel**, the same line the book lexicon draws between a spoken rendering
 *   and a written abbreviation.
 * - **The caller must confirm a number follows.** This is what separates a broken
 *   joint from an ordinary noun: `worse`, `horse` and `nurse` are all one edit from
 *   `verse`, and none of them is followed by a chapter number in real speech. It is
 *   the same discriminator `numberFollows` already uses for book names.
 *
 * Returns the canonical structural word, or null to leave the token alone.
 */
export function recoverStructuralWord(token: string): string | null {
  const heard = token.trim().toLowerCase();
  if (heard.length < 4 || !VOWEL.test(heard)) return null;
  if (STRUCTURAL_WORDS.includes(heard)) return null; // already correct

  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let tied = false;
  for (const target of STRUCTURAL_WORDS) {
    const distance = editDistance(heard, target);
    if (distance > 1) continue;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = target;
      tied = false;
    } else if (distance === bestDistance) {
      // `verse`/`verses` collapse to the same meaning; a genuine tie across
      // different words is ambiguous and refused.
      tied = best !== null && !best.startsWith(target) && !target.startsWith(best);
    }
  }
  return tied ? null : best;
}

/**
 * Spoken number words, for the same repair applied to a damaged *number*.
 *
 * Kept as a plain list rather than imported from the parser's value tables: what
 * matters here is the spelling that was damaged, not what it is worth.
 */
const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'eighty', 'ninety', 'hundred',
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth',
  'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth',
  'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'
];

/**
 * A number word the recogniser cut short — `eig` for `eight`, `thre` for `three`.
 *
 * Found the same way `vers` was: reading real transcripts. `romens eight twenty
 * eight` already recovered to **Romans 8:28** because a damaged *book* is repaired,
 * while `romans eig twenty eight` was refused outright, because a damaged *number*
 * was not. Same defect, same discovery, one of them fixed.
 *
 * ## Why this rule is shaped differently from the two above
 *
 * `recoverSpokenBook` and `recoverStructuralWord` allow any edit within a small
 * budget, guarded by a four-character floor. `eig` clears neither: it is three
 * characters and two edits from `eight`. Both of those guards have to relax, so
 * something has to buy the safety back — and here it is the shape of the damage
 * rather than its size. The token must be a **strict prefix** of the number word.
 *
 * That is not an arbitrary tightening; it is the failure actually observed. CTC
 * drops the tail of a word under time pressure (`thre`, `eigh`, `sixtee`, `twent`),
 * and requiring a prefix is what stops the enormous surface of ordinary English
 * from reaching a number. `even` is one edit from `seven` and `then` is one edit
 * from `ten` — under the structural-word rule both would become numbers; under this
 * one neither is a prefix of anything and both are left alone.
 *
 * Three further guards, each earning its place:
 *
 * - **Unique shortest completion.** `eig` prefixes `eight`, `eighteen` AND `eighty`.
 *   Fewest missing letters wins — `eight` — and only when that minimum is unique,
 *   so a genuine coin-flip is refused rather than decided quietly.
 * - **`for` is excluded by name.** It is a strict prefix of `forty` and one of the
 *   most common words in English, and a preacher quoting a verse says it constantly
 *   ("Romans eight verse one, **for** there is therefore now no condemnation").
 * - **The caller must confirm a number follows.** As with the other two recoveries,
 *   this is the discriminator: the repaired word has to sit inside a locator that
 *   continues into real numbers, not float free in a sentence.
 *
 * What this deliberately does NOT repair: a damaged number with nothing after it,
 * such as a trailing `sixtee`. There is no following number to confirm it against,
 * and inventing the last half of a reference is precisely the failure this whole
 * remediation exists to prevent. Such an utterance is refused, and refusing is the
 * correct outcome — the operator can see the transcript and say it again.
 */
export function recoverNumberWord(token: string): string | null {
  const heard = token.trim().toLowerCase();
  if (heard.length < 3 || !VOWEL.test(heard)) return null;
  if (NUMBER_WORDS.includes(heard)) return null; // already correct
  if (heard === 'for') return null;

  let best: string | null = null;
  let fewestMissing = Number.POSITIVE_INFINITY;
  let tied = false;
  for (const target of NUMBER_WORDS) {
    if (!target.startsWith(heard)) continue;
    const missing = target.length - heard.length;
    if (missing < fewestMissing) {
      fewestMissing = missing;
      best = target;
      tied = false;
    } else if (missing === fewestMissing) {
      tied = true;
    }
  }
  return tied ? null : best;
}
