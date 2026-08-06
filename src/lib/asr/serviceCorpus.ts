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
  { spoken: 'John three sixteen', expected: 'John 3:16' },
  { spoken: 'turn with me to John chapter three verse sixteen', expected: 'John 3:16' },
  { spoken: 'let us read Romans eight twenty eight', expected: 'Romans 8:28' },
  { spoken: 'First Corinthians thirteen four to seven', expected: '1 Corinthians 13:4-7' },
  { spoken: 'second Timothy one seven', expected: '2 Timothy 1:7' },
  { spoken: 'Psalm twenty three one', expected: 'Psalms 23:1' },
  { spoken: 'Psalm one hundred and nineteen one oh five', expected: 'Psalms 119:105' },
  { spoken: 'Matthew twenty eight nineteen and twenty', expected: 'Matthew 28:19-20' },
  { spoken: 'Isaiah forty one ten', expected: 'Isaiah 41:10' },
  { spoken: 'Philippians four thirteen', expected: 'Philippians 4:13' },
  { spoken: 'Jeremiah twenty nine eleven', expected: 'Jeremiah 29:11' },
  { spoken: 'Proverbs three five and six', expected: 'Proverbs 3:5-6' },
  { spoken: 'the book of Jude verse three', expected: 'Jude 1:3' },
  { spoken: 'Obadiah verse fifteen', expected: 'Obadiah 1:15' },
  { spoken: 'the first book of Kings chapter eight verse one', expected: '1 Kings 8:1' },
  { spoken: 'in the third chapter of John verse sixteen', expected: 'John 3:16' },
  { spoken: 'Habakkuk two four', expected: 'Habakkuk 2:4' },
  { spoken: 'Ephesians two eight to nine', expected: 'Ephesians 2:8-9' }
];

/** Ghanaian-English and Twi/Ga framing around an English reference. */
export const CODE_SWITCHED_FRAMING: UtteranceCase[] = [
  { spoken: 'please open your Bibles to John three sixteen', expected: 'John 3:16' },
  { spoken: 'church let us go to Romans eight one', expected: 'Romans 8:1' },
  { spoken: 'somebody say amen, Psalm twenty seven one', expected: 'Psalms 27:1' },
  { spoken: 'we are reading from Ephesians six ten this morning', expected: 'Ephesians 6:10' },
  { spoken: 'medaase, now turn to Luke four eighteen', expected: 'Luke 4:18', note: 'Twi thanks before the reference' },
  { spoken: 'Awurade is good, Psalm one hundred four', expected: 'Psalms 104', note: 'Twi for Lord' },
  { spoken: 'oyiwaladonn, Genesis one one', expected: 'Genesis 1:1', note: 'Ga praise before the reference' }
];

/**
 * The critical group. A number spoken while QUOTING or preaching is not a
 * reference, and offering one here is the failure this whole layer exists to
 * prevent — `expected: null` means "resolve nothing, or resolve only the chapter
 * that was actually named".
 */
export const QUOTED_AND_NARRATIVE: UtteranceCase[] = [
  { spoken: 'Jesus fed five thousand men that day', expected: null },
  { spoken: 'there were about three thousand souls added to them', expected: null },
  { spoken: 'he prayed for forty days and forty nights', expected: null },
  { spoken: 'we have been in this church for twenty five years', expected: null },
  { spoken: 'the offering will be counted after the second service', expected: null },
  { spoken: 'God created the heavens and the earth in six days', expected: null },
  { spoken: 'Acts two there were about three thousand souls added', expected: 'Acts 2', note: 'chapter named, then quoted numbers' },
  { spoken: 'John six Jesus fed five thousand men', expected: 'John 6' },
  {
    spoken: 'Mark ten it is easier for a camel to go through the eye of a needle',
    expected: 'Mark 10',
    note: '"for" is a number homophone and must not become verse 4'
  },
  {
    spoken: 'Romans eight verse one for there is therefore now no condemnation',
    expected: 'Romans 8:1',
    note: 'complete reference, then the quotation begins with a homophone'
  },
  {
    spoken: 'John three sixteen for God so loved the world that he gave his only Son',
    expected: 'John 3:16'
  }
];

/** More than one passage in one breath. */
export const MULTIPLE_REFERENCES: UtteranceCase[] = [
  { spoken: 'John three sixteen and Romans eight twenty eight', expected: 'John 3:16' },
  { spoken: 'John chapter three and Romans chapter eight', expected: 'John 3' },
  { spoken: 'John chapter three verse sixteen and Romans eight one', expected: 'John 3:16' },
  { spoken: 'John three sixteen and in the third chapter of Romans verse one', expected: 'John 3:16' },
  { spoken: 'John three sixteen and eighteen', expected: 'John 3:16,18', note: 'one reference, verse list' }
];

/** Utterances that should fail rather than guess. */
export const SHOULD_REFUSE: UtteranceCase[] = [
  { spoken: 'good morning church', expected: null },
  { spoken: 'this is a message about faith', expected: null },
  { spoken: 'John ninety nine one', expected: null, note: 'chapter does not exist' },
  { spoken: 'Romans ninety nine one', expected: null },
  { spoken: 'let us pray', expected: null }
];

export const SERVICE_CORPUS: UtteranceCase[] = [
  ...COMPLETE_REFERENCES,
  ...CODE_SWITCHED_FRAMING,
  ...QUOTED_AND_NARRATIVE,
  ...MULTIPLE_REFERENCES,
  ...SHOULD_REFUSE
];

export const CORPUS_GROUPS = {
  'complete references': COMPLETE_REFERENCES,
  'code-switched framing': CODE_SWITCHED_FRAMING,
  'quoted and narrative numbers': QUOTED_AND_NARRATIVE,
  'multiple references': MULTIPLE_REFERENCES,
  'should refuse': SHOULD_REFUSE
} as const;
