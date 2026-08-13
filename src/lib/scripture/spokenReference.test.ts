import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSpokenReference, isAmbiguous, hasMultipleReferences } from './spokenReference';
import { parseScriptureReference } from './parseReference';

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
     * Honest about WHICH mechanism holds this. Mutating the anchoring filter does
     * NOT break these — the hard boundary at the next book plus the empty-locator
     * skip already do, because a bare mention has no numbers between it and the next
     * book. The filter's own observable effect is on the FAILURE message, pinned by
     * the test below; an earlier version of this comment claimed the wrong-book test
     * proved it, which was simply untrue.
     */
    expect(groups('John three sixteen and also in Romans')).toEqual([['John 3:16']]);
    expect(groups('in John and Romans eight twenty eight')).toEqual([['Romans 8:28']]);
    expect(groups('Romans and John three sixteen')).toEqual([['John 3:16']]);
    expect(groups('John three sixteen Romans')).toEqual([['John 3:16']]);
  });

  it('blames the book that actually carried the numbers', () => {
    /**
     * What the anchoring filter is really for. When nothing resolves, the operator
     * is told which book was heard — and without the filter a bare mention wins that
     * slot, so "in John and Romans ninety nine one" reported a problem with JOHN.
     * Sending the operator to check the wrong book during a service is its own kind
     * of confidently wrong.
     */
    for (const text of [
      'in John and Romans ninety nine one',
      'turn to John then Romans ninety nine one'
    ]) {
      const r = parseSpokenReference(text);
      expect(r.ok, text).toBe(false);
      if (r.ok) continue;
      expect(r.message, text).toContain('Romans');
      expect(r.message, text).not.toContain('John');
    }
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

  it('a chapter spoken before its book cannot be taken from the reference before it', () => {
    /**
     * The other half of the boundary, and the one the forward clamp missed.
     * `resolveSpan` scans BACKWARDS for "the third chapter of Romans", and that scan
     * used to start at the end of the previous book's NAME — so in "John chapter
     * three and Romans chapter eight" the Romans span looked back over "chapter
     * three" and offered Romans 3:8. John's chapter number wearing Romans' name,
     * and Romans 3:8 is a verse that really exists.
     */
    expect(groups('John chapter three and Romans chapter eight')).toEqual([['John 3'], ['Romans 8']]);
    expect(groups('John chapter three verse sixteen and Romans eight one')).toEqual([['John 3:16'], ['Romans 8:1']]);
    expect(groups('John chapter three verse sixteen and Romans chapter eight verse one')).toEqual([
      ['John 3:16'],
      ['Romans 8:1']
    ]);
    // With no separator at all, the modifiers stay with the reference that had them
    // rather than being moved on a guess.
    expect(groups('John chapter three Romans chapter eight')).toEqual([['John 3'], ['Romans 8']]);
    // No candidate anywhere may be the cross-contaminated reading.
    for (const text of [
      'John chapter three and Romans chapter eight',
      'John chapter three verse sixteen and Romans eight one'
    ]) {
      const r = parseSpokenReference(text);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.candidates.map((c) => c.reference.canonical), text).not.toContain('Romans 3:8');
    }
  });

  it('still lets a reference keep a chapter spoken before its own book', () => {
    // The boundary must not be so tight that it severs a legitimate pre-modifier.
    expect(groups('John three sixteen and in the third chapter of Romans verse one')).toEqual([
      ['John 3:16'],
      ['Romans 3:1']
    ]);
    expect(groups('the third chapter of John verse sixteen and Romans eight one')).toEqual([
      ['John 3:16'],
      ['Romans 8:1']
    ]);
  });

  it('says how many passages were heard', () => {
    const one = parseSpokenReference('John three sixteen');
    const two = parseSpokenReference('John three sixteen and Romans eight twenty eight');
    expect(one.ok && one.message).toContain('John 3:16');
    expect(two.ok && two.message).toContain('2 passages');
  });
});

describe('a spoken zero is a digit, not noise', () => {
  const first = (t: string): string => {
    const r = parseSpokenReference(t);
    if (!r.ok) throw new Error(`expected candidates for "${t}", got ${r.problem}`);
    return r.candidates[0].reference.canonical;
  };

  it('reads "one oh five" as 105', () => {
    /**
     * Psalm 119:105 is among the most-quoted verses there is, and dropping the "oh"
     * as noise read it as 1 and 5 — offering Psalms 119:1-5, a real passage that is
     * not what was said.
     */
    expect(first('Psalm one hundred and nineteen one oh five')).toBe('Psalms 119:105');
    expect(first('Psalm one oh three')).toBe('Psalms 103');
    expect(first('Psalm one oh three verse one')).toBe('Psalms 103:1');
  });

  it('stops the digit run after one zero group, so the verse survives', () => {
    // Consuming every digit in reach made this 1051, which is not a chapter.
    expect(first('Psalm one oh five one')).toBe('Psalms 105:1');
  });

  it('falls back to reading the zero as a pause when the digits do not exist', () => {
    /**
     * The digit reading must never LOSE a passage the looser reading would have
     * found. "John three oh five" as 305 does not exist, so 3:5 is offered instead
     * — and the interpretation says which reading it is, because the operator is
     * the one deciding.
     */
    const r = parseSpokenReference('John three oh five');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates[0].reference.canonical).toBe('John 3:5');
    expect(r.candidates[0].interpretation).toContain('pause');
  });

  it('does not turn ordinary spoken numbers into concatenations', () => {
    // The zero-word requirement is the whole guard: no "oh", no digit reading.
    expect(first('John three sixteen')).toBe('John 3:16');
    expect(first('Psalm twenty three one')).toBe('Psalms 23:1');
    expect(first('Psalm one hundred and nineteen one')).toBe('Psalms 119:1');
    expect(first('Matthew twenty eight nineteen and twenty')).toBe('Matthew 28:19-20');
    // A leading interjection is still just noise.
    expect(first('oh John three sixteen')).toBe('John 3:16');
  });
});

describe('quoted scripture cannot donate its numbers to the reference', () => {
  const canon = (t: string): string => {
    const r = parseSpokenReference(t);
    return r.ok ? r.candidates.map((c) => c.reference.canonical).join(' | ') : `FAIL:${r.problem}`;
  };

  it('stops the locator where the reference stops', () => {
    /**
     * A preacher names the reference and then reads it aloud. The locator used to
     * skip unrecognised words and keep scanning, so the QUOTED verse handed its
     * numbers to the reference that introduced it — each of these came back as a
     * single confident reading with no alternative offered.
     */
    expect(canon('Acts two there were about three thousand souls added')).toBe('Acts 2');
    expect(canon('John six Jesus fed five thousand men')).toBe('John 6');
    expect(canon('Genesis one God created the heavens in six days')).toBe('Genesis 1');
    expect(canon('Luke fifteen the father had two sons')).toBe('Luke 15');
    // A homophone in the quotation, where only the chapter had landed — the
    // `foundSoFar` gate does not cover this one, which its comment used to imply.
    expect(canon('Mark ten it is easier for a camel to go through the eye of a needle')).toBe('Mark 10');
  });

  it('still reads a complete reference followed by its quotation', () => {
    expect(canon('John three sixteen for God so loved the world')).toBe('John 3:16');
    expect(canon('Romans eight verse one for there is therefore now no condemnation')).toBe('Romans 8:1');
    expect(canon('John three sixteen for God so loved the world and Romans eight one')).toBe('John 3:16 | Romans 8:1');
    expect(canon('turn with me to John three sixteen and also Romans eight one')).toBe('John 3:16 | Romans 8:1');
  });

  it('does not stop before the reference has begun', () => {
    // Ordinary words BEFORE the first number must not end the scan.
    expect(canon('John chapter three verse sixteen')).toBe('John 3:16');
    expect(canon('in the third chapter of John verse sixteen')).toBe('John 3:16');
  });
});

describe('the explanation matches the reference it labels', () => {
  const why = (t: string): string => {
    const r = parseSpokenReference(t);
    if (!r.ok) throw new Error(`expected candidates for "${t}"`);
    return r.candidates[0].interpretation;
  };

  it('calls a one-chapter book’s number a verse, because that is what it is', () => {
    /**
     * The strict parser reads a bare number in a one-chapter book as a verse, so
     * "Jude three" is Jude 1:3 — but the explanation said "chapter 3" right beside
     * it. The explanation is the only thing telling the operator why a reading was
     * offered; contradicting the canonical makes it worse than nothing.
     */
    expect(why('Jude three')).toContain('verse 3');
    expect(why('Jude three')).not.toContain('chapter 3');
    expect(why('Obadiah fifteen')).toContain('verse 15');
    expect(why('Philemon six')).toContain('verse 6');
    // And two numbers are two verses, not two chapters of a one-chapter book.
    const jude = parseSpokenReference('Jude verse twenty four and twenty five');
    expect(jude.ok).toBe(true);
    if (jude.ok) {
      expect(jude.candidates[0].reference.canonical).toBe('Jude 1:24-25');
      expect(jude.candidates[0].interpretation).not.toContain('per chapter');
    }
  });

  it('does not claim a number "was not spoken" when it was', () => {
    /**
     * "the first book of Kings" is ordinary formal phrasing. The ordinal sits three
     * tokens back, so it was missed — producing a spurious 1 Kings/2 Kings ambiguity
     * AND the note `"1" was not spoken` about a word the speaker had just said.
     */
    for (const [text, expected] of [
      ['the first book of Kings chapter eight verse one', '1 Kings 8:1'],
      ['the second book of Samuel seven one', '2 Samuel 7:1']
    ] as const) {
      const r = parseSpokenReference(text);
      expect(r.ok, text).toBe(true);
      if (!r.ok) continue;
      expect(r.candidates.map((c) => c.reference.canonical), text).toEqual([expected]);
      expect(r.candidates[0].interpretation, text).not.toContain('was not spoken');
    }
    // The genuinely ambiguous case still says so.
    const bare = parseSpokenReference('Timothy one seven');
    expect(bare.ok && bare.candidates[0].interpretation).toContain('was not spoken');
    // And an ordinal that belongs to a locator is not stolen for the book name.
    expect(canonOf('chapter three of John')).toBe('John 3');
  });

  it('admits every number it drops, on every branch', () => {
    /**
     * `dropped` was applied to the two branches with a spoken connector and not to
     * the one without — so "Matthew five three four five six" read as "verses 3 to 4"
     * and the 5 and the 6 vanished from the branch whose whole job is to say what it
     * is ignoring.
     */
    const r = parseSpokenReference('Matthew five three four five six');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates[0].interpretation).toContain('ignoring 5, 6');
    expect(r.candidates[1].interpretation).toContain('ignoring 4, 5, 6');
    for (const c of r.candidates) expect(c.interpretation).toMatch(/ignoring/);
  });
});

function canonOf(text: string): string {
  const r = parseSpokenReference(text);
  return r.ok ? r.candidates.map((c) => c.reference.canonical).join(' | ') : `FAIL:${r.problem}`;
}

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

describe('a reference whose NUMBER was damaged, not its book', () => {
  /**
   * Every transcript below came out of the recogniser during the rehearsal that
   * preceded the human gate — synthetic speech, but the real model and the real
   * browser endpointer, so the damage is what it actually produces rather than
   * what a corruption function imagines.
   *
   * The asymmetry these fix: `romens eight twenty eight` already read as Romans
   * 8:28, because a damaged BOOK is repaired. `romans eig twenty eight` was refused
   * outright, because a damaged NUMBER was not — and refusing loses the whole
   * reference, not just its chapter.
   */
  it('reads a chapter the recogniser cut short', () => {
    expect(best('let us read romans eig twenty eight')).toBe('Romans 8:28');
    expect(best('let us read romans eigh twenty eight')).toBe('Romans 8:28');
    expect(best('psalm twent three one')).toBe('Psalms 23:1');
  });

  it('lets a damaged number anchor the book it belongs to', () => {
    // The failure was HERE and not in the locator: `eig` sits between the book and
    // its numbers, so `romans` looked unanchored and nothing was offered at all.
    expect(best('jon thre sixteen')).toBe('John 3:16');
  });

  /**
   * `three` came back as `thee` on the shortest form of all. That is a homophone
   * rather than a truncation, so it is handled by the homophone table — the same
   * mechanism that already carries `free` and `tree` — and inherits its guard.
   */
  it('reads `thee` as three only while a reference is still incomplete', () => {
    expect(best('jon thee sixteen')).toBe('John 3:16');
    expect(problemOf('i say unto thee that the lord is good')).toBe('no-book');
    expect(problemOf('blessed art thou among women and blessed is thee')).toBe('no-book');
    // A complete reference followed by KJV prose keeps the reference and nothing more.
    expect(best('unto thee o lord do i lift up my soul psalm twenty five one')).toBe('Psalms 25:1');
  });

  /**
   * The repair is confirmed by what comes AFTER it. A damaged number with nothing
   * following confirms nothing, and inventing the second half of a reference is
   * the exact failure this layer exists to prevent — so it stays coarse instead.
   */
  it('will not repair a number that nothing follows', () => {
    expect(best('john three sixtee')).toBe('John 3');
    expect(problemOf('romans eig')).toBe('no-numbers');
  });

  it('still refuses to find numbers in prose', () => {
    expect(best('romans eight verse one for there is therefore now no condemnation')).toBe('Romans 8:1');
    expect(best('acts two there were about three thousand souls added')).toBe('Acts 2');
    expect(problemOf('my sermon even touches on grace')).toBe('no-book');
    expect(best('i have a mine of gold in psalm twenty three')).toBe('Psalms 23');
  });

  /**
   * A KNOWN BOUND, written down as a test because it is what the operator sees.
   *
   * Half an utterance can name a reference that does not exist: "…verse sixty" is
   * a perfectly good parse a moment before the speaker says "sixteen". There is no
   * per-chapter verse data bundled, so nothing here can reject it. The panel is
   * what protects the operator — a provisional card is published only once its
   * passage has actually been retrieved, so a verse with no text is never shown.
   */
  it('cannot tell that John 3:60 is not a verse — the lookup is what catches it', () => {
    expect(best('turn with me to jon chapter three vers sixty')).toBe('John 3:60');
  });
});

describe('a chapter and verse the recogniser ran together', () => {
  /**
   * Both transcripts below came from a real microphone at normal distance, and
   * both were refused — the operator was told "John 316 is not a passage" having
   * just said the most quoted verse in the Bible.
   */
  it('reads what the microphone actually produced', () => {
    expect(best('John 316')).toBe('John 3:16');
    expect(best('Romans 828')).toBe('Romans 8:28');
    expect(best('let us read Romans 828')).toBe('Romans 8:28');
  });

  it('leaves a real chapter alone', () => {
    // Psalms has 150 chapters, so 119 is a chapter someone meant — and 1:19 and
    // 11:9 are both real verses, which is exactly why this must not fire.
    expect(best('Psalm 119')).toBe('Psalms 119');
    expect(best('John 21')).toBe('John 21');
    expect(best('Romans 8')).toBe('Romans 8');
  });

  it('marks every compact split as needing its verse verified', () => {
    /**
     * Genesis has 50 chapters, so 1:234 and 12:34 both survive the CHAPTER check
     * — and NEITHER is a real verse: Genesis 1 has 31, Genesis 12 has 20. The
     * parser cannot know that, because per-chapter verse counts are not bundled.
     *
     * So it produces them marked, and retrieval eliminates them. What matters is
     * that nothing unmarked escapes: a caller that displays a `compact` candidate
     * without retrieving it first is the bug this flag exists to prevent.
     */
    const parsed = parseSpokenReference('Genesis 1234');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.candidates.map((c) => c.reference.canonical)).toEqual(['Genesis 1:234', 'Genesis 12:34']);
    expect(parsed.candidates.every((c) => c.compact)).toBe(true);
  });

  it('marks a single survivor too — one split is still an unverified verse', () => {
    const parsed = parseSpokenReference('John 316');
    expect(parsed.ok && parsed.candidates[0].compact).toBe(true);
  });

  it('leaves ordinary readings unmarked', () => {
    const parsed = parseSpokenReference('John 3 16');
    expect(parsed.ok && parsed.candidates[0].compact).toBeFalsy();
  });

  it('still refuses when no split is a passage', () => {
    // Ruth has 4 chapters: 9:99, 99:9 and 999 are all impossible.
    expect(problemOf('Ruth 999')).toBe('unresolvable');
  });

  it('does not touch numbers the SPEAKER separated into words', () => {
    // "one hundred fifty one" is a person saying 151, not a recogniser running
    // 150 and 1 together — and splitting it would give Psalms 1:51 instead of
    // letting the ordinary reading find Psalms 150:1.
    expect(best('Psalm one hundred fifty one')).toBe('Psalms 150:1');
  });
});

describe('a compact locator can never present an impossible verse', () => {
  it('offers the canon-unique reading first', () => {
    expect(cands('John 316')).toEqual(['John 3:16']);
    expect(cands('Romans 828')).toEqual(['Romans 8:28']);
  });

  it('leaves the typed parser completely unchanged', () => {
    // The strict parser is the typed path's authority and knows nothing about
    // compact splitting — someone typing "John 316" made a visible typo.
    expect(parseScriptureReference('John 316').ok).toBe(false);
    expect(parseScriptureReference('Genesis 1234').ok).toBe(false);
    const typed = parseScriptureReference('John 3:16');
    expect(typed.ok && typed.reference.canonical).toBe('John 3:16');
  });

  it('keeps spoken-number provenance intact', () => {
    // Words the SPEAKER separated are never treated as a compact run.
    expect(best('Psalm one hundred fifty one')).toBe('Psalms 150:1');
    expect(best('Psalm one hundred nineteen one')).toBe('Psalms 119:1');
    expect(best('Psalm 119')).toBe('Psalms 119');
  });
});
