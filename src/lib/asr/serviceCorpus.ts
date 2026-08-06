import type { UtteranceCase } from './referenceOutcome';

/**
 * The evaluation corpus: how references are actually spoken from a pulpit.
 *
 * **Written by hand. No recordings, no transcripts of real services, no personal
 * data.** That is a deliberate constraint, not a limitation of effort — see
 * `docs/ASR_EVALUATION.md` for the consent, storage and deletion rules that govern
 * real audio, none of which is in this repository or will be.
 *
 * The cases are grouped by what they probe, because a flat accuracy number over a
 * mixed bag hides which situations are safe. The groups that matter most are the
 * ones expecting `null`: a preacher quoting numbers mid-sermon must NOT produce a
 * reference, and those are the cases where a wrong passage would reach a screen.
 *
 * PPC '26 is an English-medium Ghanaian service with Twi and Ga code-switching, so
 * the corpus includes code-switched framing around English references. It does not
 * include references spoken IN Twi or Ga: those need a native-speaker corpus and a
 * per-language number grammar, and inventing them here would produce a confident
 * number about something untested.
 */

export const COMPLETE_REFERENCES: UtteranceCase[] = [
  { spoken: 'John three sixteen', expected: [{ canonical: 'John 3:16' }] },
  { spoken: 'turn with me to John chapter three verse sixteen', expected: [{ canonical: 'John 3:16' }] },
  { spoken: 'let us read Romans eight twenty eight', expected: [{ canonical: 'Romans 8:28' }] },
  { spoken: 'First Corinthians thirteen four to seven', expected: [{ canonical: '1 Corinthians 13:4-7' }] },
  { spoken: 'second Timothy one seven', expected: [{ canonical: '2 Timothy 1:7' }] },
  { spoken: 'Psalm twenty three one', expected: [{ canonical: 'Psalms 23:1' }] },
  { spoken: 'Psalm one hundred and nineteen one oh five', expected: [{ canonical: 'Psalms 119:105' }] },
  { spoken: 'Matthew twenty eight nineteen and twenty', expected: [{ canonical: 'Matthew 28:19-20' }] },
  { spoken: 'Isaiah forty one ten', expected: [{ canonical: 'Isaiah 41:10' }] },
  { spoken: 'Philippians four thirteen', expected: [{ canonical: 'Philippians 4:13' }] },
  { spoken: 'Jeremiah twenty nine eleven', expected: [{ canonical: 'Jeremiah 29:11' }] },
  { spoken: 'Proverbs three five and six', expected: [{ canonical: 'Proverbs 3:5-6' }] },
  { spoken: 'the book of Jude verse three', expected: [{ canonical: 'Jude 1:3' }] },
  { spoken: 'Obadiah verse fifteen', expected: [{ canonical: 'Obadiah 1:15' }] },
  { spoken: 'the first book of Kings chapter eight verse one', expected: [{ canonical: '1 Kings 8:1' }] },
  { spoken: 'in the third chapter of John verse sixteen', expected: [{ canonical: 'John 3:16' }] },
  { spoken: 'Habakkuk two four', expected: [{ canonical: 'Habakkuk 2:4' }] },
  { spoken: 'Ephesians two eight to nine', expected: [{ canonical: 'Ephesians 2:8-9' }] }
];

/** Ghanaian-English and Twi/Ga framing around an English reference. */
export const CODE_SWITCHED_FRAMING: UtteranceCase[] = [
  { spoken: 'please open your Bibles to John three sixteen', expected: [{ canonical: 'John 3:16' }] },
  { spoken: 'church let us go to Romans eight one', expected: [{ canonical: 'Romans 8:1' }] },
  { spoken: 'somebody say amen, Psalm twenty seven one', expected: [{ canonical: 'Psalms 27:1' }] },
  { spoken: 'we are reading from Ephesians six ten this morning', expected: [{ canonical: 'Ephesians 6:10' }] },
  { spoken: 'medaase, now turn to Luke four eighteen', expected: [{ canonical: 'Luke 4:18' }], note: 'Twi thanks before the reference' },
  { spoken: 'Awurade is good, Psalm one hundred four', expected: [{ canonical: 'Psalms 104' }], note: 'Twi for Lord' },
  { spoken: 'oyiwaladonn, Genesis one one', expected: [{ canonical: 'Genesis 1:1' }], note: 'Ga praise before the reference' }
];

/**
 * The critical group. A number spoken while QUOTING or preaching is not a reference,
 * and offering one here is the failure this whole layer exists to prevent.
 *
 * `expected: null` means resolve NOTHING — any group at all is a wrong leading
 * candidate. Where a chapter genuinely was named before the quotation began, the case
 * states that chapter explicitly instead.
 */
export const QUOTED_AND_NARRATIVE: UtteranceCase[] = [
  { spoken: 'Jesus fed five thousand men that day', expected: null },
  { spoken: 'there were about three thousand souls added to them', expected: null },
  { spoken: 'he prayed for forty days and forty nights', expected: null },
  { spoken: 'we have been in this church for twenty five years', expected: null },
  { spoken: 'the offering will be counted after the second service', expected: null },
  { spoken: 'God created the heavens and the earth in six days', expected: null },
  { spoken: 'Acts two there were about three thousand souls added', expected: [{ canonical: 'Acts 2' }], note: 'chapter named, then quoted numbers' },
  { spoken: 'John six Jesus fed five thousand men', expected: [{ canonical: 'John 6' }] },
  {
    spoken: 'Mark ten it is easier for a camel to go through the eye of a needle',
    expected: [{ canonical: 'Mark 10' }],
    note: '"for" is a number homophone and must not become verse 4'
  },
  {
    spoken: 'Romans eight verse one for there is therefore now no condemnation',
    expected: [{ canonical: 'Romans 8:1' }],
    note: 'complete reference, then the quotation begins with a homophone'
  },
  {
    spoken: 'John three sixteen for God so loved the world that he gave his only Son',
    expected: [{ canonical: 'John 3:16' }]
  }
];

/**
 * More than one passage in one breath — every passage stated.
 *
 * These previously listed only the FIRST expected reference, which made the whole
 * group vacuous after it: the second passage could be missing, misparsed or replaced
 * by a different real verse and the case still passed, while the summary claimed
 * "multiple references 5/5 correct". Multi-reference separation is one of the main
 * safety properties this harness watches, and it was not being watched.
 */
export const MULTIPLE_REFERENCES: UtteranceCase[] = [
  {
    spoken: 'John three sixteen and Romans eight twenty eight',
    expected: [{ canonical: 'John 3:16' }, { canonical: 'Romans 8:28' }]
  },
  {
    spoken: 'John three sixteen and Romans eight twenty eight then Psalm twenty three one',
    expected: [{ canonical: 'John 3:16' }, { canonical: 'Romans 8:28' }, { canonical: 'Psalms 23:1' }],
    note: 'three references'
  },
  {
    spoken: 'John chapter three and Romans chapter eight',
    expected: [{ canonical: 'John 3' }, { canonical: 'Romans 8' }],
    note: 'the backward pre-chapter scan must not give Romans 3:8'
  },
  {
    spoken: 'John chapter three verse sixteen and Romans eight one',
    expected: [{ canonical: 'John 3:16' }, { canonical: 'Romans 8:1' }]
  },
  {
    spoken: 'John three sixteen and in the third chapter of Romans verse one',
    expected: [{ canonical: 'John 3:16' }, { canonical: 'Romans 3:1' }],
    note: 'a chapter spoken before its own book still reaches it'
  },
  {
    spoken: 'John three sixteen for God so loved the world and Romans eight one',
    expected: [{ canonical: 'John 3:16' }, { canonical: 'Romans 8:1' }],
    note: 'quotation between two references'
  },
  {
    spoken: 'John three sixteen and John three eighteen',
    expected: [{ canonical: 'John 3:16' }, { canonical: 'John 3:18' }],
    note: 'same book twice, two distinct passages'
  },
  {
    spoken: 'John three sixteen and John three sixteen',
    expected: [{ canonical: 'John 3:16' }],
    note: 'a repeated passage collapses to one, per the parser contract'
  },
  {
    spoken: 'John three sixteen and eighteen',
    expected: [{ canonical: 'John 3:16,18' }],
    note: 'ONE discontinuous reference, not two passages'
  },
  {
    spoken: 'John three sixteen and also in Romans',
    expected: [{ canonical: 'John 3:16' }],
    note: 'a bare mention is not a passage and must not become a second group'
  }
];

/**
 * One reference with more than one legitimate reading. Distinct from two spoken
 * passages: the readings belong to the SAME group, and if they ever split into two
 * groups the operator is told two passages were named when one was.
 *
 * `leadMayBeAny` is set because a listener hearing bare "Timothy one seven" has no
 * basis to prefer 1 or 2 Timothy. Naming one of them as what the speaker meant would
 * record the parser's own sibling ordering as human intent and then score it `exact`
 * — the corpus certifying the implementation. What is genuinely required is that both
 * readings are offered, together, in one group; which one sorts first is a ranking
 * choice, not a fact about the utterance.
 */
export const AMBIGUOUS_FAMILY: UtteranceCase[] = [
  {
    spoken: 'Timothy one seven',
    expected: [{ canonical: '1 Timothy 1:7', alternatives: ['2 Timothy 1:7'], leadMayBeAny: true }],
    note: 'one reference, two readings, neither preferable from the transcript'
  },
  {
    spoken: 'John three sixteen and Timothy one seven',
    expected: [
      { canonical: 'John 3:16' },
      { canonical: '1 Timothy 1:7', alternatives: ['2 Timothy 1:7'], leadMayBeAny: true }
    ],
    note: 'a definite passage followed by an ambiguous one'
  }
];

/**
 * Utterances that should resolve nothing.
 *
 * Two different reasons are collected here and the distinction is worth stating,
 * because `expected: null` reads as "names no passage" and only the first three do.
 * The last two DO name a passage — an impossible one — and the required behaviour is
 * the same: refuse rather than degrade it into a neighbouring verse that exists.
 */
export const SHOULD_REFUSE: UtteranceCase[] = [
  { spoken: 'good morning church', expected: null },
  { spoken: 'this is a message about faith', expected: null },
  { spoken: 'let us pray', expected: null },
  { spoken: 'John ninety nine one', expected: null, note: 'names a chapter that does not exist' },
  { spoken: 'Romans ninety nine one', expected: null, note: 'names a chapter that does not exist' }
];

export const SERVICE_CORPUS: UtteranceCase[] = [
  ...COMPLETE_REFERENCES,
  ...CODE_SWITCHED_FRAMING,
  ...QUOTED_AND_NARRATIVE,
  ...MULTIPLE_REFERENCES,
  ...AMBIGUOUS_FAMILY,
  ...SHOULD_REFUSE
];

export const CORPUS_GROUPS = {
  'complete references': COMPLETE_REFERENCES,
  'code-switched framing': CODE_SWITCHED_FRAMING,
  'quoted and narrative numbers': QUOTED_AND_NARRATIVE,
  'multiple references': MULTIPLE_REFERENCES,
  'ambiguous families': AMBIGUOUS_FAMILY,
  'should refuse': SHOULD_REFUSE
} as const;
