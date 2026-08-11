import type { UtteranceCase } from './referenceOutcome';

/**
 * The **held-out** evaluation corpus — frozen before any remediation was written.
 *
 * `serviceCorpus.ts` is now a regression set, and it cannot honestly measure the
 * remediation because its failures are already known: Stage 5 established that
 * `John` → `jon` → **Jonah 3:16**, and anything built afterwards would be tuned,
 * consciously or not, against exactly those cases. A fix evaluated only on the
 * examples that motivated it measures the author's memory rather than the parser.
 *
 * So this set was authored and committed **first**, and the rule is stated here
 * because it is the only thing keeping it honest:
 *
 * > **Individual rules were not tuned against failures found only in this file.**
 * > It is scored, the aggregate is reported wins and losses alike, and cases are
 * > not edited to suit an implementation. A case here that fails stays failing and
 * > is reported, unless it is genuinely mis-authored — in which case the reason is
 * > recorded in `docs/ASR_EVALUATION.md`.
 *
 * Same `UtteranceCase` shape as the regression corpus, so the **same** `scoreCorpus`
 * grades it and there is no second scoring implementation to keep correct.
 *
 * These are TRANSCRIPTS, not audio. The proper-noun corruption group contains the
 * kind of output a CTC recogniser actually produces — dropped letters, wrong
 * vowels, missing leading consonants — because that is the failure class Stage 5
 * measured, and a corpus of clean sentences cannot exercise it at all.
 */

/** Plain canonical names, spoken the ordinary way. */
export const HELD_CANONICAL: UtteranceCase[] = [
  { spoken: 'Genesis one one', expected: [{ canonical: 'Genesis 1:1', alternatives: [] }] },
  /**
   * Authoring correction, made before any remediation and recorded rather than
   * quietly edited: this was first written expecting `Exodus 20:3`, which is
   * simply wrong — "twenty three" is twenty-three. The utterance is genuinely
   * ambiguous between chapter 23 and chapter 20 verse 3, so it is expressed the
   * way the corpus expresses real ambiguity: both readings legitimate, either may
   * lead. Fixing my own mistake is allowed; editing a case because the parser
   * disagrees with it is not.
   */
  {
    spoken: 'Exodus twenty three',
    expected: [{ canonical: 'Exodus 23', alternatives: ['Exodus 20:3'], leadMayBeAny: true }],
    note: 'ambiguous: chapter 23, or chapter 20 verse 3'
  },
  { spoken: 'Deuteronomy six four', expected: [{ canonical: 'Deuteronomy 6:4', alternatives: [] }] },
  { spoken: 'Nehemiah eight ten', expected: [{ canonical: 'Nehemiah 8:10', alternatives: [] }] },
  { spoken: 'Ecclesiastes three one', expected: [{ canonical: 'Ecclesiastes 3:1', alternatives: [] }] },
  { spoken: 'Lamentations three twenty two', expected: [{ canonical: 'Lamentations 3:22', alternatives: [] }] },
  { spoken: 'Zechariah four six', expected: [{ canonical: 'Zechariah 4:6', alternatives: [] }] },
  { spoken: 'Malachi three ten', expected: [{ canonical: 'Malachi 3:10', alternatives: [] }] },
  { spoken: 'Colossians three twenty three', expected: [{ canonical: 'Colossians 3:23', alternatives: [] }] },
  { spoken: 'Hebrews eleven one', expected: [{ canonical: 'Hebrews 11:1', alternatives: [] }] },
  { spoken: 'James one five', expected: [{ canonical: 'James 1:5', alternatives: [] }] },
  { spoken: 'Revelation twenty one four', expected: [{ canonical: 'Revelation 21:4', alternatives: [] }] }
];

/**
 * Books that sound like other books. The point is not that the parser must be
 * clever — it is that a WRONG one of these is the expensive failure, so a refusal
 * is preferable to a guess.
 */
export const HELD_CONFUSABLE: UtteranceCase[] = [
  { spoken: 'Jonah two one', expected: [{ canonical: 'Jonah 2:1', alternatives: [] }] },
  { spoken: 'John four twenty four', expected: [{ canonical: 'John 4:24', alternatives: [] }] },
  { spoken: 'Joel two twenty eight', expected: [{ canonical: 'Joel 2:28', alternatives: [] }] },
  { spoken: 'Job one twenty one', expected: [{ canonical: 'Job 1:21', alternatives: [] }] },
  { spoken: 'Judges six twelve', expected: [{ canonical: 'Judges 6:12', alternatives: [] }] },
  { spoken: 'Jude verse twenty four', expected: [{ canonical: 'Jude 1:24', alternatives: [] }] },
  { spoken: 'Micah six eight', expected: [{ canonical: 'Micah 6:8', alternatives: [] }] },
  { spoken: 'Nahum one seven', expected: [{ canonical: 'Nahum 1:7', alternatives: [] }] },
  { spoken: 'Titus two eleven', expected: [{ canonical: 'Titus 2:11', alternatives: [] }] },
  { spoken: 'Timothy is not a book on its own', expected: null, note: 'bare family name, no numbers' },
  { spoken: 'Philemon verse six', expected: [{ canonical: 'Philemon 1:6', alternatives: [] }] },
  { spoken: 'Philippians two five', expected: [{ canonical: 'Philippians 2:5', alternatives: [] }] }
];

/** Numbered books, spoken as ordinals rather than written as digits. */
export const HELD_NUMBERED: UtteranceCase[] = [
  { spoken: 'first John four eight', expected: [{ canonical: '1 John 4:8', alternatives: [] }] },
  { spoken: 'second Corinthians five seventeen', expected: [{ canonical: '2 Corinthians 5:17', alternatives: [] }] },
  { spoken: 'third John verse four', expected: [{ canonical: '3 John 1:4', alternatives: [] }] },
  { spoken: 'first Peter five seven', expected: [{ canonical: '1 Peter 5:7', alternatives: [] }] },
  { spoken: 'second Kings six seventeen', expected: [{ canonical: '2 Kings 6:17', alternatives: [] }] },
  { spoken: 'first Thessalonians five sixteen', expected: [{ canonical: '1 Thessalonians 5:16', alternatives: [] }] },
  { spoken: 'the second book of Chronicles seven fourteen', expected: [{ canonical: '2 Chronicles 7:14', alternatives: [] }] },
  {
    spoken: 'Samuel three ten',
    expected: [
      { canonical: '1 Samuel 3:10', alternatives: ['2 Samuel 3:10'], leadMayBeAny: true }
    ],
    note: 'family named without its number — both readings must be offered together'
  }
];

/** Chapter/verse phrasing, including ranges and lists. */
export const HELD_CHAPTER_VERSE: UtteranceCase[] = [
  { spoken: 'Romans chapter twelve verse two', expected: [{ canonical: 'Romans 12:2', alternatives: [] }] },
  { spoken: 'Matthew chapter five verses three to twelve', expected: [{ canonical: 'Matthew 5:3-12', alternatives: [] }] },
  { spoken: 'Acts chapter two', expected: [{ canonical: 'Acts 2', alternatives: [] }] },
  { spoken: 'Isaiah chapter fifty three verse five', expected: [{ canonical: 'Isaiah 53:5', alternatives: [] }] },
  { spoken: 'Galatians five twenty two and twenty three', expected: [{ canonical: 'Galatians 5:22-23', alternatives: [] }] },
  { spoken: 'Psalm one hundred and thirty nine fourteen', expected: [{ canonical: 'Psalms 139:14', alternatives: [] }] }
];

/** No explicit "chapter"/"verse" — the commonest pulpit shorthand. */
export const HELD_BARE_NUMBERS: UtteranceCase[] = [
  { spoken: 'Ephesians four thirty two', expected: [{ canonical: 'Ephesians 4:32', alternatives: [] }] },
  { spoken: 'Proverbs eighteen ten', expected: [{ canonical: 'Proverbs 18:10', alternatives: [] }] },
  { spoken: 'Joshua one nine', expected: [{ canonical: 'Joshua 1:9', alternatives: [] }] },
  { spoken: 'Luke six thirty eight', expected: [{ canonical: 'Luke 6:38', alternatives: [] }] },
  { spoken: 'Mark eleven twenty four', expected: [{ canonical: 'Mark 11:24', alternatives: [] }] }
];

/** Natural framing around the reference. */
export const HELD_FRAMED: UtteranceCase[] = [
  { spoken: 'let us all stand for the reading of Romans eight thirty one', expected: [{ canonical: 'Romans 8:31', alternatives: [] }] },
  { spoken: 'if you have your Bibles open with me to Isaiah forty three two', expected: [{ canonical: 'Isaiah 43:2', alternatives: [] }] },
  { spoken: 'our text this morning comes from Second Timothy three sixteen', expected: [{ canonical: '2 Timothy 3:16', alternatives: [] }] },
  { spoken: 'praise God, turn quickly to Philippians four six', expected: [{ canonical: 'Philippians 4:6', alternatives: [] }] },
  { spoken: 'and the word of the Lord says in Jeremiah one five', expected: [{ canonical: 'Jeremiah 1:5', alternatives: [] }] }
];

/** Two or more references in one breath — the group that collapsed in Stage 5. */
export const HELD_MULTIPLE: UtteranceCase[] = [
  {
    spoken: 'Romans six twenty three and Romans five eight',
    expected: [
      { canonical: 'Romans 6:23', alternatives: [] },
      { canonical: 'Romans 5:8', alternatives: [] }
    ]
  },
  {
    spoken: 'read Genesis one one then John one one',
    expected: [
      { canonical: 'Genesis 1:1', alternatives: [] },
      { canonical: 'John 1:1', alternatives: [] }
    ]
  },
  {
    spoken: 'Matthew six thirty three and Luke twelve thirty one',
    expected: [
      { canonical: 'Matthew 6:33', alternatives: [] },
      { canonical: 'Luke 12:31', alternatives: [] }
    ]
  },
  {
    spoken: 'compare Psalm twenty three one with John ten eleven',
    expected: [
      { canonical: 'Psalms 23:1', alternatives: [] },
      { canonical: 'John 10:11', alternatives: [] }
    ]
  },
  {
    spoken: 'Isaiah nine six and Micah five two and Matthew two one',
    expected: [
      { canonical: 'Isaiah 9:6', alternatives: [] },
      { canonical: 'Micah 5:2', alternatives: [] },
      { canonical: 'Matthew 2:1', alternatives: [] }
    ]
  }
];

/** Genuinely ambiguous — the transcript cannot say which reading was meant. */
export const HELD_AMBIGUOUS: UtteranceCase[] = [
  {
    spoken: 'Peter one three',
    expected: [{ canonical: '1 Peter 1:3', alternatives: ['2 Peter 1:3'], leadMayBeAny: true }]
  },
  {
    spoken: 'Corinthians thirteen thirteen',
    expected: [
      { canonical: '1 Corinthians 13:13', alternatives: ['2 Corinthians 13:13'], leadMayBeAny: true }
    ]
  },
  /**
   * Second authoring correction, recorded rather than quietly edited. This first
   * declared `2 Thessalonians 4:16` as the alternative — an impossible reference,
   * because 2 Thessalonians has three chapters. The parser validates every
   * candidate through `parseScriptureReference` and correctly dropped it, and my
   * expectation was demanding a fabrication.
   *
   * The family stays in the corpus with the reading that can exist. Ambiguous
   * numbered families are still exercised by the Peter and Corinthians cases,
   * where both siblings are real.
   */
  {
    spoken: 'Thessalonians four sixteen',
    expected: [{ canonical: '1 Thessalonians 4:16', alternatives: [] }],
    note: '2 Thessalonians has only 3 chapters, so the sibling reading cannot exist'
  }
];

/** References that cannot exist. Resolving one is a fabrication. */
export const HELD_IMPOSSIBLE: UtteranceCase[] = [
  { spoken: 'Jude chapter four verse two', expected: null, note: 'Jude has one chapter' },
  { spoken: 'Obadiah chapter three', expected: null, note: 'Obadiah has one chapter' },
  { spoken: 'Genesis fifty one one', expected: null, note: 'Genesis has 50 chapters' },
  { spoken: 'Revelation ninety nine one', expected: null },
  { spoken: 'Malachi seven three', expected: null, note: 'Malachi has 4 chapters' }
];

/** Utterances that name no passage. Any group at all is a wrong answer. */
export const HELD_SHOULD_REFUSE: UtteranceCase[] = [
  { spoken: 'good morning church and welcome to the service', expected: null },
  { spoken: 'we will take the offering in about five minutes', expected: null },
  { spoken: 'the choir will sing two songs this morning', expected: null },
  { spoken: 'he walked for forty days through the wilderness', expected: null },
  { spoken: 'there are twelve of them standing there', expected: null },
  { spoken: 'turn to your neighbour and say good morning', expected: null },
  { spoken: 'my mark on the paper was three out of ten', expected: null, note: 'Mark is an ordinary word' },
  { spoken: 'the numbers were down by twelve percent', expected: null, note: 'Numbers is an ordinary word' }
];

/**
 * **Proper-noun corruption** — the failure class Stage 5 actually found.
 *
 * Real CTC output mangles the book name, not the digits. Each of these is either
 * recoverable to exactly one book, or too damaged to be worth guessing — and the
 * corpus states which, because "refuses" is the correct answer for the second
 * kind and must not be scored as a miss.
 */
export const HELD_CORRUPTED_BOOK: UtteranceCase[] = [
  { spoken: 'jon three sixteen', expected: [{ canonical: 'John 3:16', alternatives: [] }], note: 'the Stage 5 case: must not become Jonah' },
  { spoken: 'salm twenty three one', expected: [{ canonical: 'Psalms 23:1', alternatives: [] }] },
  { spoken: 'luoke four eighteen', expected: [{ canonical: 'Luke 4:18', alternatives: [] }] },
  { spoken: 'corintians thirteen four', expected: [{ canonical: '1 Corinthians 13:4', alternatives: ['2 Corinthians 13:4'], leadMayBeAny: true } ] },
  { spoken: 'romands eight twenty eight', expected: [{ canonical: 'Romans 8:28', alternatives: [] }] },
  { spoken: 'ephesian six ten', expected: [{ canonical: 'Ephesians 6:10', alternatives: [] }] },
  { spoken: 'matthewe five nine', expected: [{ canonical: 'Matthew 5:9', alternatives: [] }] },
  { spoken: 'hebrew eleven six', expected: [{ canonical: 'Hebrews 11:6', alternatives: [] }] },
  { spoken: 'galations five one', expected: [{ canonical: 'Galatians 5:1', alternatives: [] }] },
  { spoken: 'revelations twenty one four', expected: [{ canonical: 'Revelation 21:4', alternatives: [] }], note: 'common spoken plural' },
  { spoken: 'jamse one twenty two', expected: [{ canonical: 'James 1:22', alternatives: [] }] },
  { spoken: 'zzzk nine four', expected: null, note: 'too damaged — refusing is correct' },
  { spoken: 'blorptus three one', expected: null, note: 'not a book at all' },
  { spoken: 'jhn three sixteen', expected: null, note: 'a WRITTEN abbreviation, not something a person says' }
];

export const HELD_OUT_CORPUS: UtteranceCase[] = [
  ...HELD_CANONICAL,
  ...HELD_CONFUSABLE,
  ...HELD_NUMBERED,
  ...HELD_CHAPTER_VERSE,
  ...HELD_BARE_NUMBERS,
  ...HELD_FRAMED,
  ...HELD_MULTIPLE,
  ...HELD_AMBIGUOUS,
  ...HELD_IMPOSSIBLE,
  ...HELD_SHOULD_REFUSE,
  ...HELD_CORRUPTED_BOOK
];

export const HELD_OUT_GROUPS = {
  'canonical names': HELD_CANONICAL,
  'confusable books': HELD_CONFUSABLE,
  'numbered books': HELD_NUMBERED,
  'chapter/verse forms': HELD_CHAPTER_VERSE,
  'bare numbers': HELD_BARE_NUMBERS,
  'natural framing': HELD_FRAMED,
  'multiple references': HELD_MULTIPLE,
  'ambiguous families': HELD_AMBIGUOUS,
  'impossible references': HELD_IMPOSSIBLE,
  'should refuse': HELD_SHOULD_REFUSE,
  'corrupted book names': HELD_CORRUPTED_BOOK
};
