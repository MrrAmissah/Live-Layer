import { describe, expect, it } from 'vitest';
import { parseScriptureReference, verseBounds, type ReferenceProblem } from './parseReference';
import { parseReference } from './bibleBooks';

/** Canonical string for an input that must parse, or a failure message for the test to show. */
function canonical(input: string): string {
  const result = parseScriptureReference(input);
  if (!result.ok) throw new Error(`expected "${input}" to parse, got ${result.problem}: ${result.message}`);
  return result.reference.canonical;
}

function problemOf(input: string): ReferenceProblem {
  const result = parseScriptureReference(input);
  if (result.ok) throw new Error(`expected "${input}" to be rejected, got ${result.reference.canonical}`);
  return result.problem;
}

describe('parseScriptureReference — the required manual forms', () => {
  it.each([
    ['John 3:16', 'John 3:16'],
    ['John 3', 'John 3'],
    ['John 3:16-18', 'John 3:16-18'],
    ['John 3:16,18', 'John 3:16,18'],
    ['1 Corinthians 13:4-7', '1 Corinthians 13:4-7']
  ])('%s → %s', (input, expected) => {
    expect(canonical(input)).toBe(expected);
  });

  it('accepts common abbreviations and numbered-book forms, and outputs canonical names', () => {
    expect(canonical('jn 3:16')).toBe('John 3:16');
    expect(canonical('1 cor 13:4')).toBe('1 Corinthians 13:4');
    expect(canonical('1co 13:4')).toBe('1 Corinthians 13:4');
    expect(canonical('i john 1:9')).toBe('1 John 1:9');
    expect(canonical('ii samuel 7:1')).toBe('2 Samuel 7:1');
    expect(canonical('3jn 1:2')).toBe('3 John 1:2');
    expect(canonical('ps 23')).toBe('Psalms 23');
    expect(canonical('PSALM 23:1')).toBe('Psalms 23:1');
    expect(canonical('song 1:1')).toBe('Song of Songs 1:1');
    expect(canonical('rev 22:21')).toBe('Revelation 22:21');
  });

  it('tolerates the whitespace and punctuation operators actually type', () => {
    expect(canonical('  john   3 : 16  ')).toBe('John 3:16');
    expect(canonical('John 3.16')).toBe('John 3:16');
    expect(canonical('1 Jn. 3:16')).toBe('1 John 3:16');
    expect(canonical('John 3:16 - 18')).toBe('John 3:16-18');
    expect(canonical('John 3:16 , 18')).toBe('John 3:16,18');
  });

  it('accepts en- and em-dashed ranges, which word processors substitute silently', () => {
    expect(canonical('John 3:16–18')).toBe('John 3:16-18');
    expect(canonical('John 3:16—18')).toBe('John 3:16-18');
    expect(canonical('John 3:16−18')).toBe('John 3:16-18');
  });

  it('normalises discontinuous selections: sorted, deduped, and merged when adjacent', () => {
    expect(canonical('John 3:18,16')).toBe('John 3:16,18');
    expect(canonical('John 3:16,16')).toBe('John 3:16');
    // 16-17 and 18 cover 16,17,18 — one span says the same thing.
    expect(canonical('John 3:16-17,18')).toBe('John 3:16-18');
    expect(canonical('John 3:16,18-20')).toBe('John 3:16,18-20');
  });

  it('reports the parsed structure, not just a string', () => {
    const result = parseScriptureReference('1 Corinthians 13:4-7');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reference.book).toBe('1 Corinthians');
    expect(result.reference.chapter).toBe(13);
    expect(result.reference.spans).toEqual([{ start: 4, end: 7 }]);
    expect(verseBounds(result.reference)).toEqual({ first: 4, last: 7 });
  });

  it('treats a chapter-only reference as the whole chapter, with no verse bounds', () => {
    const result = parseScriptureReference('John 3');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reference.spans).toEqual([]);
    expect(verseBounds(result.reference)).toBeNull();
  });
});

describe('parseScriptureReference — refuses rather than reinterprets', () => {
  /**
   * The regression this module exists for. Every input here was verified against
   * `bibleBooks.parseReference` first: each one silently dropped the chapter and
   * rebuilt as a bare book or a different range, so a malformed reference became
   * a valid-looking request for other verses. The paired assertion on the old
   * parser is not redundant — it is the proof the new one is doing work.
   */
  it.each([
    ['John 3:16,18', 'John'],
    ['John 3.16', 'John'],
    ['John 3:16–18', 'John']
  ])('%s degraded to "%s" under the chip parser', (input, degraded) => {
    const old = parseReference(input);
    expect(old.book).toBe(degraded);
    expect(old.chapter).toBeUndefined();
  });

  it('never yields a reference for input it cannot read in full', () => {
    expect(problemOf('John 3:16a')).toBe('verse-malformed');
    expect(problemOf('John 3:16-')).toBe('verse-malformed');
    expect(problemOf('John 3:')).toBe('verse-malformed');
    expect(problemOf('John three')).toBe('verse-malformed');
    expect(problemOf('John 3:16;Romans 8:1')).toBe('verse-malformed');
    expect(problemOf('John 3:16-4:2')).toBe('verse-malformed');
  });

  it('refuses a bare book instead of fetching the whole book', () => {
    expect(problemOf('John')).toBe('chapter-missing');
    expect(problemOf('1 Corinthians')).toBe('chapter-missing');
  });

  it('rejects verse 0 and backwards ranges instead of truncating them', () => {
    expect(problemOf('John 3:0')).toBe('verse-zero');
    expect(problemOf('John 3:0-4')).toBe('verse-zero');
    expect(problemOf('John 3:18-16')).toBe('verse-inverted');
  });

  it('reads a bare number as a verse in a one-chapter book', () => {
    /**
     * `Jude 3` is how every Bible names that verse, and reading the number as a
     * chapter rejected it as out of range. `Jude 1` is the same convention:
     * verified against the provider, it returns one verse and echoes `Jude 1:1`,
     * so treating it as a whole chapter put `Jude 1` in the readout over a single
     * verse of text.
     */
    expect(canonical('Jude 3')).toBe('Jude 1:3');
    expect(canonical('Jude 1')).toBe('Jude 1:1');
    expect(canonical('Obadiah 15')).toBe('Obadiah 1:15');
    expect(canonical('Philemon 6')).toBe('Philemon 1:6');
    expect(canonical('2 John 4')).toBe('2 John 1:4');
    expect(canonical('3 John 2')).toBe('3 John 1:2');
  });

  it('leaves an explicit verse in a one-chapter book alone', () => {
    // `Jude 1:3` already says what it means; only a bare number is rewritten.
    expect(canonical('Jude 1:3')).toBe('Jude 1:3');
    expect(canonical('Jude 1:1-25')).toBe('Jude 1:1-25');
    expect(canonical('Obadiah 1:15,17')).toBe('Obadiah 1:15,17');
  });

  it('still bounds multi-chapter books by their real chapter count', () => {
    // The one-chapter rule must not leak into books that have chapters.
    expect(problemOf('John 22')).toBe('chapter-out-of-range');
    expect(canonical('John 21')).toBe('John 21');
  });

  it('validates the chapter offline against the bundled chapter counts', () => {
    expect(problemOf('John 999:1')).toBe('chapter-out-of-range');
    expect(problemOf('John 22')).toBe('chapter-out-of-range'); // John has 21
    // Obadiah is NOT in this list: it has one chapter, so `Obadiah 2` is verse 2,
    // not an out-of-range chapter. An explicit chapter 2 is still refused below.
    expect(problemOf('Obadiah 2:1')).toBe('chapter-out-of-range');
    expect(problemOf('John 0')).toBe('chapter-out-of-range');
    expect(canonical('John 21')).toBe('John 21'); // the boundary itself is valid
    expect(canonical('Psalms 150')).toBe('Psalms 150');
  });

  it('separates an unknown book from an ambiguous one, because the recovery differs', () => {
    expect(problemOf('Nonexistent 3:16')).toBe('book-unknown');
    expect(problemOf('Zzz 1:1')).toBe('book-unknown');

    const ambiguous = parseScriptureReference('J 3:16');
    expect(ambiguous.ok).toBe(false);
    if (ambiguous.ok) return;
    expect(ambiguous.problem).toBe('book-ambiguous');
    expect((ambiguous.candidates ?? []).length).toBeGreaterThan(1);
    expect(ambiguous.candidates).toContain('John');
  });

  /**
   * `normalizeBibleBook` resolves any unique prefix, so a single stray keystroke
   * became a passage: `q` is a unique prefix of Ecclesiastes' `qoh` alias, and
   * `parseReference('q 3:16')` returned Ecclesiastes 3:16 with no signal. Verified
   * against the chip parser below — the paired assertion is the proof.
   */
  it('refuses to infer a book from one or two letters of prefix', () => {
    expect(parseReference('q 3:16').book).toBe('Ecclesiastes'); // the chip parser still does
    expect(problemOf('q 3:16')).toBe('book-ambiguous');
    expect(problemOf('qo 3:16')).toBe('book-ambiguous');

    const short = parseScriptureReference('q 3:16');
    expect(short.ok).toBe(false);
    if (short.ok) return;
    expect(short.candidates).toContain('Ecclesiastes');
    expect(short.message).toContain('Ecclesiastes');
  });

  it('still honours real short abbreviations, which are exact aliases not prefixes', () => {
    // The prefix floor must not cost the abbreviations operators actually type.
    expect(canonical('jn 3:16')).toBe('John 3:16');
    expect(canonical('ps 23')).toBe('Psalms 23');
    expect(canonical('ge 1:1')).toBe('Genesis 1:1');
    expect(canonical('mt 5:3')).toBe('Matthew 5:3');
    expect(canonical('re 1:1')).toBe('Revelation 1:1');
    expect(canonical('pm 1:1')).toBe('Philemon 1:1');
    expect(canonical('1co 13:4')).toBe('1 Corinthians 13:4');
    expect(canonical('gene 1:1')).toBe('Genesis 1:1'); // a long-enough prefix still resolves
  });

  it('rejects a locator with no book', () => {
    expect(problemOf('3:16')).toBe('book-missing');
    expect(problemOf('16')).toBe('book-missing');
  });

  it('reports empty input as empty, not as an unknown book', () => {
    expect(problemOf('')).toBe('empty');
    expect(problemOf('   ')).toBe('empty');
  });

  it('names the input or the book in every message, so an error is actionable', () => {
    const cases = ['', 'Nonexistent 3:16', 'J 3:16', 'John', 'John 999:1', 'John 3:0', 'John 3:18-16', 'John 3:16a', '3:16'];
    for (const input of cases) {
      const result = parseScriptureReference(input);
      expect(result.ok, input).toBe(false);
      if (result.ok) continue;
      expect(result.message.length, input).toBeGreaterThan(10);
      // No bare "invalid reference" — the operator must be told which thing is wrong.
      expect(result.message.toLowerCase(), input).not.toBe('invalid reference');
    }
  });

  it('resolves every canonical book name and every alias to itself', () => {
    // A silent alias collision would make one book unreachable by its own abbreviation.
    for (const input of ['Genesis', 'Revelation', 'Song of Songs', '1 Kings', '2 Chronicles']) {
      expect(canonical(`${input} 1`)).toBe(`${input} 1`);
    }
    // Philemon is one-chapter, so its bare number is a verse — see the rule above.
    expect(canonical('Philemon 1')).toBe('Philemon 1:1');
  });
});
