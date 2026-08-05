import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSpokenReference, isAmbiguous } from './spokenReference';

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

  it('does not resolve "to" as two — that ambiguity is offered, not guessed', () => {
    /**
     * "John three to five" and "John three two five" are different references and
     * the transcript cannot distinguish them. Treating `to` as a number would
     * silently pick one, which is the whole failure mode this layer avoids.
     */
    const list = cands('John three to five');
    expect(list.length).toBeGreaterThan(1);
    expect(list).toContain('John 3:5');
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

  it('never returns a passage that does not exist', () => {
    // The strict parser is the gate: John has 21 chapters, so 99 is refused here
    // rather than becoming a provider 404 or, worse, a different passage.
    expect(problemOf('John ninety nine one')).toBe('unresolvable');
    expect(problemOf('Obadiah chapter five verse one')).toBe('unresolvable');
  });

  it('never silently substitutes an unrelated passage', () => {
    // Every candidate must be a reading of what was actually said — the book named
    // in the transcript, and numbers that appeared in it.
    const list = cands('Psalm twenty three one to three');
    for (const c of list) expect(c.startsWith('Psalms 23')).toBe(true);
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
