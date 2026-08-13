import { describe, expect, it } from 'vitest';
import { readCorrection } from './referenceCorrection';
import { parseScriptureReference } from './parseReference';
import { HELD_OUT_CORPUS } from '../asr/heldOutCorpus';

const ref = (text: string) => {
  const parsed = parseScriptureReference(text);
  if (!parsed.ok) throw new Error(`bad fixture: ${text}`);
  return parsed.reference;
};

const amend = (heard: string, current: string | null) => {
  const result = readCorrection(heard, current === null ? null : ref(current));
  return result ? result.reference.canonical : null;
};

/**
 * Every `heard` string below is what the recogniser ACTUALLY returned for the
 * spoken phrase in the comment — captured from Whisper large-v3-turbo over the
 * real service, not written from the spoken form. That distinction matters here
 * more than usual: Whisper writes digits and punctuation, so "not twenty eight,
 * three" arrives as `Not 28, 3.` and the grammar had to be built against that.
 */
describe('amending the reference already on screen', () => {
  it('replaces the verse, keeping book and chapter', () => {
    expect(amend('verse 3 instead.', 'Romans 8:28')).toBe('Romans 8:3'); // "verse three instead"
    expect(amend('No, verse 3.', 'Romans 8:28')).toBe('Romans 8:3'); // "no, verse three"
    expect(amend('I mean verse 3.', 'Romans 8:28')).toBe('Romans 8:3'); // "I mean verse three"
    expect(amend('Rather verse 3.', 'Romans 8:28')).toBe('Romans 8:3'); // "rather verse three"
    expect(amend('Make that verse 5.', 'Romans 8:28')).toBe('Romans 8:5'); // "make that verse five"
    expect(amend('Verse 17 instead.', 'John 3:16')).toBe('John 3:17'); // "verse seventeen instead"
  });

  it('tolerates the couple of stray words a real person says', () => {
    // "He said verse three instead" — the phrasing from the brief, verbatim from
    // the recogniser. Two unclassified tokens is the budget, and this is why.
    expect(amend('He said verse 3 instead.', 'Romans 8:28')).toBe('Romans 8:3');
  });

  it('replaces the chapter, and drops the verse that belonged to the old one', () => {
    // "chapter nine" cannot mean "chapter nine, verse twenty-eight" — that verse
    // belonged to chapter 8, and carrying it over would invent a reference.
    expect(amend('Chapter 9', 'Romans 8:28')).toBe('Romans 9');
    expect(amend('Chapter 5', '1 John 4:8')).toBe('1 John 5');
  });

  it('replaces chapter and verse together', () => {
    expect(amend('chapter 9 verse 2.', 'Romans 8:28')).toBe('Romans 9:2');
    expect(amend('No, chapter 9 verse 2.', 'Romans 8:28')).toBe('Romans 9:2');
    expect(amend('Chapter 4 verse 2.', 'John 3:16')).toBe('John 4:2');
  });

  it('reads "not the old one, the new one"', () => {
    // `Not 28, 3.` — bare numbers, readable only because a trigger is present AND
    // the first number is the verse currently displayed.
    expect(amend('Not 28, 3.', 'Romans 8:28')).toBe('Romans 8:3');
    // The same shape where the first number is NOT what is showing is ambiguous.
    expect(amend('Not 12, 3.', 'Romans 8:28')).toBeNull();
  });

  it('amends a range', () => {
    expect(amend('verses 3 through 5 instead', 'Romans 8:28')).toBe('Romans 8:3-5');
  });
});

describe('what a correction may never do', () => {
  it('refuses with nothing on screen', () => {
    // The rule that stops a sermon's numbers becoming Scripture.
    expect(amend('verse 3 instead.', null)).toBeNull();
    expect(amend('No, verse 3.', null)).toBeNull();
    expect(amend('Chapter 9', null)).toBeNull();
  });

  it('refuses a fragment with no number in it', () => {
    // "no, something... verse... uh" — the deliberately unusable correction.
    expect(amend('No, something verse R.', 'Romans 8:28')).toBeNull();
    expect(amend('No, sorry.', 'Romans 8:28')).toBeNull();
  });

  it('leaves anything naming a book to the ordinary path', () => {
    // A named book is a NEW reference, not an amendment — and this is the
    // constraint that does the real work, not a list of allowed phrasings.
    expect(amend('John 3 16', 'Romans 8:28')).toBeNull();
    expect(amend('No, John 3 16.', 'Romans 8:28')).toBeNull();
    expect(amend('1 John 4 8', 'Romans 8:28')).toBeNull();
  });

  it('will not read a correction out of preaching', () => {
    expect(amend('and in verse 3 we see that God loved the world', 'Romans 8:28')).toBeNull();
    expect(amend('there were about 3 thousand souls added that day', 'Romans 8:28')).toBeNull();
    expect(amend('he preached for 3 hours and nobody minded at all', 'Romans 8:28')).toBeNull();
  });

  it('refuses an amendment the strict parser rejects', () => {
    // Genesis has 50 chapters. An impossible amendment is refused, never repaired
    // into some other valid passage.
    expect(amend('Chapter 99', 'Genesis 1:1')).toBeNull();
    expect(amend('verse 0', 'Genesis 1:1')).toBeNull();
  });

  it('is not a correction if nothing changes', () => {
    expect(amend('verse 28 instead', 'Romans 8:28')).toBeNull();
  });

  /**
   * The evidence that the grammar is BOUNDED rather than merely careful.
   *
   * Every one of the 83 frozen held-out utterances is a real reference someone
   * might say. Not one of them may read as a correction — if any did, the layer
   * would be capable of silently rewriting a displayed passage from an ordinary
   * sermon sentence, which is the failure this whole stage exists to prevent.
   */
  it('reads none of the 83 frozen held-out utterances as a correction', () => {
    const current = ref('Romans 8:28');
    const misread = (HELD_OUT_CORPUS as unknown as { spoken: string }[])
      .map((testCase) => ({ spoken: testCase.spoken, as: readCorrection(testCase.spoken, current) }))
      .filter((row) => row.as !== null);
    expect(misread.map((row) => `${row.spoken} -> ${row.as?.reference.canonical}`)).toEqual([]);
  });
});
