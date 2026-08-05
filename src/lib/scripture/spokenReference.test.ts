import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSpokenReference, isAmbiguous, hasMultipleReferences } from './spokenReference';

/**
 * Spoken normalisation is a SEPARATE boundary in front of the strict parser, not a
 * relaxation of it. Every candidate below has been through
 * `parseScriptureReference`; a reading it rejects never reaches this list.
 */

const cands = (t: string): string[] => {
  const r = parseSpokenReference(t);
  if (!r.ok) throw new Error(`expected candidates for "${t}", got ${r.problem}: ${r.message}`);
  return r.candidates.map((c) => c.reference.canonical);
};
const best = (t: string): string => cands(t)[0];
const problemOf = (t: string): string => {
  const r = parseSpokenReference(t);
  if (r.ok) throw new Error(`expected "${t}" to fail, got ${r.candidates[0].reference.canonical}`);
  return r.problem;
};

describe('the required spoken forms', () => {
  it.each([
    ['John three sixteen', 'John 3:16'],
    ['First Corinthians thirteen verse four to seven', '1 Corinthians 13:4-7'],
    ['Psalm twenty three one to three', 'Psalms 23:1-3'],
    ['Romans chapter eight verse twenty eight', 'Romans 8:28'],
    ['Second Timothy one seven', '2 Timothy 1:7']
  ])('%s → %s', (spoken, expected) => {
    expect(best(spoken)).toBe(expected);
  });
});

describe('spoken numbered books', () => {
  it.each([
    ['first john one nine', '1 John 1:9'],
    ['second john one four', '2 John 1:4'],
    ['third john one two', '3 John 1:2'],
    ['first peter one three', '1 Peter 1:3'],
    ['second samuel seven one', '2 Samuel 7:1'],
    ['first kings eight one', '1 Kings 8:1'],
    ['second chronicles seven fourteen', '2 Chronicles 7:14'],
    ['1st thessalonians five sixteen', '1 Thessalonians 5:16']
  ])('%s → %s', (spoken, expected) => {
    expect(best(spoken)).toBe(expected);
  });

  it('offers every family member when the number was not spoken', () => {
    // "Timothy" is not a book on its own, so which one was meant is genuinely
    // unknown — and the honest answer is to ask, not to assume.
    expect(cands('Timothy one seven')).toEqual(['1 Timothy 1:7', '2 Timothy 1:7']);
    expect(cands('Peter one three')).toEqual(['1 Peter 1:3', '2 Peter 1:3']);
    expect(cands('Corinthians thirteen four')).toEqual(['1 Corinthians 13:4', '2 Corinthians 13:4']);
    expect(isAmbiguous(parseSpokenReference('Timothy one seven'))).toBe(true);
  });

  it('does NOT offer siblings for a name that is a book in its own right', () => {
    // Burying "John 3:16" under 1/2/3 John every time would make the common case
    // worse to serve the rare one.
    expect(cands('John three sixteen')).toEqual(['John 3:16']);
    expect(isAmbiguous(parseSpokenReference('John three sixteen'))).toBe(false);
  });
});

describe('chapter and verse wording', () => {
  it.each([
    ['Romans chapter eight verse twenty eight', 'Romans 8:28'],
    ['John chapter three', 'John 3'],
    ['turn to the book of John chapter three verse sixteen', 'John 3:16'],
    ['lets read from Psalm one hundred nineteen verse one', 'Psalms 119:1'],
    ['Genesis one one', 'Genesis 1:1'],
    ['Revelation twenty two twenty one', 'Revelation 22:21']
  ])('%s → %s', (spoken, expected) => {
    expect(best(spoken)).toBe(expected);
  });

  it('handles compound number words', () => {
    expect(best('Psalm twenty three one')).toBe('Psalms 23:1');
    expect(best('Isaiah fifty three five')).toBe('Isaiah 53:5');
    expect(best('Psalm one hundred nineteen one')).toBe('Psalms 119:1');
    expect(best('Psalm one hundred fifty one')).toBe('Psalms 150:1');
  });

  it('reads a bare number in a one-chapter book as a verse, via the strict parser', () => {
    // Inherited, not reimplemented — the strict parser owns that rule.
    expect(best('Jude three')).toBe('Jude 1:3');
    expect(best('Obadiah fifteen')).toBe('Obadiah 1:15');
  });
});

describe('ranges and lists', () => {
  it.each([
    ['First Corinthians thirteen four to seven', '1 Corinthians 13:4-7'],
    ['Psalm twenty three one through three', 'Psalms 23:1-3'],
    ['John three sixteen and eighteen', 'John 3:16,18'],
    ['Romans eight thirty eight to thirty nine', 'Romans 8:38-39']
  ])('%s → %s', (spoken, expected) => {
    expect(best(spoken)).toBe(expected);
  });

  it('offers both readings when three numbers arrive with no spoken connector', () => {
    // "John three sixteen eighteen" could be 16-18 or 16 with a stray number.
    const list = cands('John three sixteen eighteen');
    expect(list).toContain('John 3:16-18');
    expect(list).toContain('John 3:16');
    expect(list[0]).toBe('John 3:16-18');
  });
});

describe('homophones and ambiguity', () => {
  it('reads common number homophones as numbers', () => {
    expect(best('John three for')).toBe('John 3:4');
    expect(best('Matthew five ate')).toBe('Matthew 5:8');
  });

  it('treats "too" as the range word it sounds like, not as a dropped token', () => {
    /**
     * `too` was excluded from homophone resolution but never added to the range
     * words, so it matched nothing and was skipped — "John three too five" became
     * a single confident `John 3:5` with the middle number gone. It now behaves
     * exactly like `to`.
     */
    expect(cands('John three too five')).toEqual(cands('John three to five'));
    expect(cands('John three too five').length).toBeGreaterThan(1);
  });

  it('offers more than one reading for a range utterance, including a chapter-only one', () => {
    // Deliberately NOT asserting mere `length > 1`: two members of the same family
    // would satisfy that while the property failed. These are distinct readings.
    const list = cands('John three to five');
    expect(list).toContain('John 3:5');
    expect(list).toContain('John 3');
  });

  it('ranks readings deterministically — the same utterance always sorts the same', () => {
    const a = cands('Timothy one seven');
    const b = cands('Timothy one seven');
    expect(a).toEqual(b);
  });
});

describe('malformed transcripts fail honestly', () => {
  it('reports no book when there is none', () => {
    expect(problemOf('gibberish here')).toBe('no-book');
    expect(problemOf('and then he said')).toBe('no-book');
  });

  it('reports no numbers when a book was heard alone', () => {
    expect(problemOf('John')).toBe('no-numbers');
    expect(problemOf('turn to the book of Romans')).toBe('no-numbers');
  });

  it('reports empty for an empty transcript', () => {
    expect(problemOf('')).toBe('empty');
    expect(problemOf('   ')).toBe('empty');
  });

  it('never returns a CHAPTER that does not exist', () => {
    /**
     * Named precisely. The strict parser validates the chapter against the bundled
     * counts, so John 99 is refused rather than becoming a provider 404 or a
     * different passage. It does NOT validate verse numbers — no per-chapter verse
     * data exists locally — so `Psalms 23:99` is still accepted and left to the
     * provider to reject. Claiming otherwise here would be the test lying.
     */
    expect(problemOf('John ninety nine one')).toBe('unresolvable');
    expect(problemOf('Obadiah chapter five verse one')).toBe('unresolvable');
  });

  it('never silently substitutes an unrelated BOOK, however the sentence is padded', () => {
    /**
     * The version of this test that only checked "Psalm twenty three one to three"
     * was trivially true — one book, its own numbers. These are the inputs that
     * actually broke it: `is` is an alias of Isaiah, `am` of Amos, and `Mark`,
     * `Numbers`, `Job` and `Song` are ordinary English words. Scanning for the
     * first match returned the wrong book with a single high-scored candidate and
     * no hint that the real one had been spoken.
     */
    expect(best('This is John chapter three verse sixteen')).toBe('John 3:16');
    expect(best('and it is written in John three sixteen')).toBe('John 3:16');
    expect(best('I am reading Romans eight verse one')).toBe('Romans 8:1');
    expect(best('let us mark this Romans twelve two')).toBe('Romans 12:2');
    expect(best('numbers do not matter read John three sixteen')).toBe('John 3:16');
    expect(best('his job is to preach Romans eight one')).toBe('Romans 8:1');
    expect(best('our text is Psalm twenty three')).toBe('Psalms 23');
    expect(best('the song we sang is Psalm one hundred')).toBe('Psalms 100');
  });

  it('reads "one hundred and N" as one number, not a chapter and a verse', () => {
    /**
     * `and` is a list separator, so it was splitting the hundreds compound and
     * "Psalm one hundred and nineteen" became Psalms 100:19 — a REAL verse from
     * the wrong chapter, which is why nothing downstream could catch it. Standard
     * British and Ghanaian English, over the most-read book on this surface.
     */
    expect(best('Psalm one hundred and nineteen')).toBe('Psalms 119');
    expect(best('Psalm one hundred and three')).toBe('Psalms 103');
    expect(best('Psalm one hundred and twenty one')).toBe('Psalms 121');
    expect(best('Psalm one hundred and thirty nine verse fourteen')).toBe('Psalms 139:14');
    // The no-"and" form must keep working.
    expect(best('Psalm one hundred nineteen one')).toBe('Psalms 119:1');
  });

  it('offers chapters separately when two are joined by "and"', () => {
    // The list marker was recorded and then discarded, so "Genesis one and two"
    // became Genesis 1:2 — again a real verse, silently.
    const list = cands('Genesis one and two');
    expect(list[0]).toBe('Genesis 1');
    expect(list).toContain('Genesis 2');
    expect(list).toContain('Genesis 1:2');
  });

  it('does not let quoted words after a reference invent a number', () => {
    /**
     * A preacher who says the reference and then starts quoting it handed the
     * parser a phantom number: "Romans eight verse one, FOR there is therefore now
     * no condemnation" ranked `Romans 8:1-4` above the `Romans 8:1` spoken.
     * Homophones may only supply a number while the reference is incomplete.
     */
    expect(best('Romans eight verse one for there is therefore now no condemnation')).toBe('Romans 8:1');
    expect(best('John three sixteen for God so loved the world')).toBe('John 3:16');
    expect(best('Acts one eight for you shall receive power')).toBe('Acts 1:8');
    // And the legitimate homophone still works.
    expect(best('John three for')).toBe('John 3:4');
  });

  it('reads a chapter named before the book, in either order', () => {
    // Ordinary pulpit phrasing. The locator only reads forward, so the chapter was
    // dropped and "John 16" was offered as a confident single candidate.
    expect(best('in the third chapter of John verse sixteen')).toBe('John 3:16');
    expect(best('John the third chapter verse sixteen')).toBe('John 3:16');
    expect(best('chapter three of John verse sixteen')).toBe('John 3:16');
    expect(best('in the eighth chapter of Romans verse twenty eight')).toBe('Romans 8:28');
  });

  it('discloses numbers it could not represent', () => {
    // Silent truncation reads as "understood you" when it did not.
    const r = parseSpokenReference('Matthew five verse three and four and five');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates[0].interpretation).toContain('ignoring');
  });
});

describe('more than one reference in one transcript', () => {
  const groups = (t: string): string[][] => {
    const r = parseSpokenReference(t);
    if (!r.ok) throw new Error(`expected candidates for "${t}", got ${r.problem}`);
    return r.groups.map((g) => g.candidates.map((c) => c.reference.canonical));
  };

  it('keeps two complete references separate, in transcript order', () => {
    /**
     * The known failure this fixes: the locator read every number after the first
     * book to end-of-string, so "John three sixteen and Romans eight twenty eight"
     * folded into `John 3:8,16` — a real verse built from two books' numbers.
     */
    expect(groups('John three sixteen and Romans eight twenty eight')).toEqual([['John 3:16'], ['Romans 8:28']]);
    expect(hasMultipleReferences(parseSpokenReference('John three sixteen and Romans eight twenty eight'))).toBe(true);
  });

  it('handles three references', () => {
    expect(groups('John three sixteen then Romans eight twenty eight and Psalm twenty three one')).toEqual([
      ['John 3:16'],
      ['Romans 8:28'],
      ['Psalms 23:1']
    ]);
  });

  it('drops a book mention that has no numbers of its own', () => {
    /**
     * Honest about WHICH mechanism holds this. Mutating the anchoring filter
     * (`numberFollows` when choosing spans) does NOT break these — the hard
     * boundary at the next book plus the empty-locator skip already do, because a
     * bare mention has no numbers between it and the next book. The filter is
     * defence in depth here; its load-bearing use is book SELECTION, proven by the
     * wrong-book test above (mutating `findBook` to return the first match turns
     * that red).
     */
    expect(groups('John three sixteen and also in Romans')).toEqual([['John 3:16']]);
    expect(groups('in John and Romans eight twenty eight')).toEqual([['Romans 8:28']]);
    expect(groups('Romans and John three sixteen')).toEqual([['John 3:16']]);
    expect(groups('John three sixteen Romans')).toEqual([['John 3:16']]);
  });

  it('confines each locator to its own span, which is what stops numbers crossing', () => {
    /**
     * The mechanism, tested directly rather than by proxy. Removing the `until`
     * boundary from the locator call reproduces the original defect on five of
     * these at once, so this is the assertion that actually guards it.
     */
    expect(groups('John three sixteen and Romans eight twenty eight')).toEqual([['John 3:16'], ['Romans 8:28']]);
    // Without the boundary the first span swallowed 8 and 28 and produced John 3:8,16.
    const r = parseSpokenReference('John three sixteen and Romans eight twenty eight');
    expect(r.ok && r.candidates.every((c) => !c.reference.canonical.includes('3:8'))).toBe(true);
  });

  it('keeps two references to the same book apart, and dedupes an identical one', () => {
    expect(groups('John three sixteen and John three eighteen')).toEqual([['John 3:16'], ['John 3:18']]);
    // The same passage twice collapses rather than being offered twice.
    expect(groups('John three sixteen and John three sixteen')).toEqual([['John 3:16']]);
  });

  it('still reads a conjunction INSIDE one reference as a verse list', () => {
    // The regression risk of splitting: "and" is also how a verse list is spoken.
    expect(groups('John three sixteen and eighteen')).toEqual([['John 3:16,18']]);
    expect(hasMultipleReferences(parseSpokenReference('John three sixteen and eighteen'))).toBe(false);
  });

  it('survives quoted speech between two references', () => {
    expect(groups('John three sixteen for God so loved the world and Romans eight one')).toEqual([
      ['John 3:16'],
      ['Romans 8:1']
    ]);
  });

  it('a malformed second reference cannot corrupt a valid first', () => {
    // Romans has 16 chapters, so the second span yields nothing and is skipped.
    expect(groups('John three sixteen and Romans ninety nine one')).toEqual([['John 3:16']]);
  });

  it('a malformed first reference cannot suppress a valid second', () => {
    expect(groups('John ninety nine one and Romans eight twenty eight')).toEqual([['Romans 8:28']]);
  });

  it('fails honestly when every reference is malformed', () => {
    const r = parseSpokenReference('John ninety nine one and Romans ninety nine one');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problem).toBe('unresolvable');
  });

  it('does not re-rank across references — the transcript decides their order', () => {
    /**
     * A global sort would interleave two passages' readings by score and lose the
     * order they were spoken in. "Timothy" is ambiguous (two readings) and comes
     * second; its readings must stay together, after John's.
     */
    const r = parseSpokenReference('John three sixteen and Timothy one seven');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates.map((c) => c.reference.canonical)).toEqual([
      'John 3:16',
      '1 Timothy 1:7',
      '2 Timothy 1:7'
    ]);
  });

  it('says how many passages were heard', () => {
    const one = parseSpokenReference('John three sixteen');
    const two = parseSpokenReference('John three sixteen and Romans eight twenty eight');
    expect(one.ok && one.message).toContain('John 3:16');
    expect(two.ok && two.message).toContain('2 passages');
  });
});

describe('the strict parser is not weakened', () => {
  it('does not re-implement or bypass parseScriptureReference', () => {
    const source = readFileSync('src/lib/scripture/spokenReference.ts', 'utf8');
    // It must delegate, and every candidate must be validated.
    expect(source).toContain("import { parseScriptureReference");
    expect(source).toContain('const parsed = parseScriptureReference(built.raw);');
    expect(source).toContain('if (!parsed.ok) continue;');
    // And it must not have grown its own laxer copy of the rules.
    expect(source).not.toContain('chapterCount');
    expect(source).not.toContain('verse-inverted');
  });

  it('leaves the typed parser behaving exactly as before', async () => {
    // The typed path's own suite is the real guard; this asserts the shared module
    // was not edited to accommodate speech.
    const { parseScriptureReference } = await import('./parseReference');
    expect(parseScriptureReference('John 3:16a').ok).toBe(false);
    expect(parseScriptureReference('q 3:16').ok).toBe(false);
    expect(parseScriptureReference('John').ok).toBe(false);
    expect(parseScriptureReference('John 3:16').ok).toBe(true);
  });
});
