import { describe, expect, it } from 'vitest';
import { matchSpokenBook, recoverSpokenBook, recoverStructuralWord, SPOKEN_BOOK_FORMS } from './spokenBookLexicon';
import { parseSpokenReference } from './spokenReference';
import { parseScriptureReference } from './parseReference';
import { BIBLE_BOOKS } from './bibleBooks';

const canon = (spoken: string) => {
  const parsed = parseSpokenReference(spoken);
  return parsed.ok ? parsed.groups.map((g) => g.candidates.map((c) => c.reference.canonical)) : null;
};

describe('what counts as a spoken book name', () => {
  it('accepts every canonical name', () => {
    for (const book of BIBLE_BOOKS) {
      expect(matchSpokenBook(book.name), book.name).toBe(book.name);
    }
  });

  it('accepts the handful of forms people genuinely say', () => {
    expect(matchSpokenBook('psalm')).toBe('Psalms');
    expect(matchSpokenBook('song of solomon')).toBe('Song of Songs');
    expect(matchSpokenBook('revelations')).toBe('Revelation');
  });

  it('rejects written abbreviations, which is the whole point', () => {
    // Nobody says these. They reach a transcript only as a mis-transcription.
    for (const written of ['jn', 'jhn', 'joh', 'jon', 'jnh', 'ps', 'is', 'am', 'gen', 'mk', 'rev', 'phil']) {
      expect(matchSpokenBook(written), written).toBeNull();
    }
  });

  it('leaves the TYPED parser abbreviations working', () => {
    // The policy is spoken-path only; breaking typed entry would trade one
    // regression for another.
    expect(parseScriptureReference('jn 3:16').ok).toBe(true);
    expect(parseScriptureReference('ps 23').ok).toBe(true);
    expect(parseScriptureReference('gen 1:1').ok).toBe(true);
  });

  it('has a form for every book, so no book is unsayable', () => {
    const reachable = new Set(SPOKEN_BOOK_FORMS.values());
    for (const book of BIBLE_BOOKS) expect(reachable.has(book.name), book.name).toBe(true);
  });
});

describe('recovering a corrupted book name', () => {
  const targets = (heard: string) => recoverSpokenBook(heard).map((r) => r.target);

  it('recovers a dropped letter', () => {
    expect(targets('luoke')).toContain('Luke');
    expect(targets('salm')).toContain('Psalms');
    expect(targets('romands')).toContain('Romans');
    expect(targets('ephesian')).toContain('Ephesians');
  });

  it('recovers a transposition, which plain Levenshtein would miss', () => {
    // `jamse` is two substitutions away without the Damerau step, and the budget
    // for a five-letter target is one.
    expect(targets('jamse')).toContain('James');
  });

  it('recovers a numbered family as a STEM, so both siblings survive', () => {
    const recovered = recoverSpokenBook('corintians');
    expect(recovered.some((r) => r.isStem && r.target === 'corinthians')).toBe(true);
    expect(canon('corintians thirteen four')).toEqual([['1 Corinthians 13:4', '2 Corinthians 13:4']]);
  });

  it('refuses a word that is not near any book', () => {
    expect(recoverSpokenBook('blorptus')).toEqual([]);
    expect(recoverSpokenBook('microphone')).toEqual([]);
    expect(recoverSpokenBook('offering')).toEqual([]);
  });

  it('refuses vowel-less strings, which are written abbreviations not speech', () => {
    // `jhn` is one edit from `john`; recovering it would reintroduce the typed
    // abbreviations through the back door.
    for (const written of ['jhn', 'jnh', 'mk', 'ps', 'rv', 'phlm']) {
      expect(recoverSpokenBook(written), written).toEqual([]);
    }
  });

  it('refuses tokens too short to carry signal', () => {
    for (const tiny of ['is', 'am', 'ex', 'ho', 'na']) {
      expect(recoverSpokenBook(tiny), tiny).toEqual([]);
    }
  });

  it('does not recover something that is already a book', () => {
    expect(recoverSpokenBook('john')).toEqual([]);
    expect(recoverSpokenBook('psalm')).toEqual([]);
  });
});

describe('the Stage 5 failure, as a permanent regression test', () => {
  /**
   * The whole reason this module exists. A recogniser wrote "John" as `jon`; the
   * typed alias table declares `jon` an abbreviation of JONAH; and the parser
   * produced a confident Jonah 3:16 for an utterance that named John.
   */
  it('never reads "jon three sixteen" as Jonah', () => {
    const groups = canon('jon three sixteen');
    expect(groups?.flat() ?? []).not.toContain('Jonah 3:16');
  });

  it('reads it as John, the word actually spoken', () => {
    expect(canon('jon three sixteen')).toEqual([['John 3:16']]);
  });

  it('prefers a dropped letter over a changed one, which is what decides John vs Job', () => {
    // `jon` is one edit from BOTH `john` (drop a letter) and `job` (change one).
    // Distance alone is a coin flip, and it landed on Job before the tie-break.
    expect(targetsOf('jon')).toEqual(['John']);
  });

  it('still reads a real "Jonah" as Jonah', () => {
    // The fix must not make the actual book unreachable.
    expect(canon('Jonah two one')).toEqual([['Jonah 2:1']]);
    expect(canon('the book of Jonah chapter one')).toEqual([['Jonah 1']]);
  });

  function targetsOf(heard: string) {
    return recoverSpokenBook(heard).map((r) => r.target);
  }
});

describe('recovery cannot turn ordinary speech into scripture', () => {
  it('needs numbers after the word, so prose stays prose', () => {
    // Without the number guard, any near-miss noun becomes a reference.
    expect(parseSpokenReference('the jon we met was very kind').ok).toBe(false);
    expect(parseSpokenReference('salm was the name he used').ok).toBe(false);
  });

  it('refuses a book with numbers on neither side', () => {
    // Found on the held-out corpus: the unanchored fallback used to RESOLVE, so a
    // number anywhere in the sentence produced a reference from an ordinary word.
    expect(parseSpokenReference('my mark on the paper was three out of ten').ok).toBe(false);
    expect(parseSpokenReference('the numbers were down by twelve percent').ok).toBe(false);
  });

  it('still reads a chapter spoken BEFORE its book', () => {
    // The shape the fallback legitimately exists for.
    expect(canon('the third chapter of Romans')).toEqual([['Romans 3']]);
    expect(canon('in the eighth chapter of Romans verse twenty eight')).toEqual([['Romans 8:28']]);
  });

  it('reports no-numbers for a bare book, rather than no-book', () => {
    const parsed = parseSpokenReference('turn to the book of Romans');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.problem).toBe('no-numbers');
  });
});

describe('the operator can see that a book was recovered', () => {
  it('says what was heard, on every recovered candidate', () => {
    const parsed = parseSpokenReference('jon three sixteen');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      // Reasoning stays visible — the operator is reviewing a reconstruction and
      // must be able to tell that from a clean transcription.
      expect(parsed.candidates[0].interpretation).toContain('jon');
    }
  });

  it('ranks a recovered reading below one that was actually said', () => {
    const clean = parseSpokenReference('John three sixteen');
    const recovered = parseSpokenReference('jon three sixteen');
    if (clean.ok && recovered.ok) {
      expect(clean.candidates[0].score).toBeGreaterThan(recovered.candidates[0].score);
    }
  });
});

describe('recovering the joints of a spoken reference', () => {
  /**
   * From the first human microphone test. A real voice said "John chapter three
   * verse sixteen"; DONDO wrote "jon chapter three **vers** sixteen"; the locator
   * treated `vers` as prose, ended the reference there, and returned **John 3** —
   * discarding "sixteen" with no sign to the operator that anything was lost. A
   * whole chapter where a verse was named.
   */
  it('reads the exact utterance the microphone produced', () => {
    expect(canon('jon chapter three vers sixteen')).toEqual([['John 3:16']]);
  });

  it('is not tuned to that one word', () => {
    expect(canon('romans chapter eight verce twenty eight')).toEqual([['Romans 8:28']]);
    expect(canon('psalm chapte twenty three verse one')).toEqual([['Psalms 23:1']]);
    // The range LEADS. A damaged "through" also leaves the non-range reading
    // plausible, so it is offered underneath rather than suppressed — that is the
    // ambiguity contract, not a miss.
    expect(canon('matthew five three throug twelve')?.[0][0]).toBe('Matthew 5:3-12');
  });

  it('leaves ordinary prose alone, because a one-edit budget excludes real words', () => {
    // `worse`, `horse` and `nurse` are all TWO edits from `verse` (w→v, o→e), so
    // the budget refuses them without needing a stop-list.
    for (const word of ['worse', 'horse', 'nurse', 'course', 'souls', 'sixteen']) {
      expect(recoverStructuralWord(word), word).toBeNull();
    }
  });

  it('refuses words too short to carry the signal', () => {
    // `to`, `and`, `is` must stay untouchable — they already mean something.
    for (const word of ['to', 'and', 'is', 'the', 'ver']) {
      expect(recoverStructuralWord(word), word).toBeNull();
    }
  });

  it('does not rewrite a structural word that is already correct', () => {
    for (const word of ['verse', 'verses', 'chapter', 'through']) {
      expect(recoverStructuralWord(word), word).toBeNull();
    }
  });

  it('still lets prose END a reference, which is the rule this sits inside', () => {
    // The regression this must not cause: a quoted number donating itself to the
    // reference that introduced it.
    expect(canon('Acts two there were about three thousand souls added')).toEqual([['Acts 2']]);
    expect(canon('the horse three ran')).toBeNull();
    expect(canon('Jesus fed five thousand men that day')).toBeNull();
  });

  it('only recovers where a number actually follows', () => {
    // A broken joint introduces a number. Without one it is just a word.
    expect(canon('jon chapter three vers')).toEqual([['John 3']]);
  });
});
