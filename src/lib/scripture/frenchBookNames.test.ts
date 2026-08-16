import { describe, expect, it } from 'vitest';
import { BIBLE_BOOKS, normalizeBibleBook, foldBookText } from './bibleBooks';
import { parseScriptureReference } from './parseReference';

/**
 * TYPING THE FRENCH NAME FINDS THE BOOK.
 *
 * The LSG went in and the search box still spoke only English: an operator
 * running a French service typed `Jean 3:16` and was told "No Bible book matches
 * 'Jean'". The verse on air was French and the only way to ask for it was in
 * English, which is a strange thing to hand someone mid-service.
 *
 * The names below are not from memory — they were read out of the Louis Segond
 * itself, one request per book, so they are the spellings the translation uses
 * rather than the ones I would have guessed.
 */
const FRENCH: Record<string, string> = {
  Genèse: 'Genesis',
  Exode: 'Exodus',
  Lévitique: 'Leviticus',
  Nombres: 'Numbers',
  Deutéronome: 'Deuteronomy',
  Josué: 'Joshua',
  Juges: 'Judges',
  '1 Rois': '1 Kings',
  '2 Rois': '2 Kings',
  '1 Chroniques': '1 Chronicles',
  Esdras: 'Ezra',
  Néhémie: 'Nehemiah',
  Psaumes: 'Psalms',
  Proverbes: 'Proverbs',
  Ecclésiaste: 'Ecclesiastes',
  'Cantique des Cantiques': 'Song of Songs',
  Ésaïe: 'Isaiah',
  Jérémie: 'Jeremiah',
  Ézéchiel: 'Ezekiel',
  Osée: 'Hosea',
  Joël: 'Joel',
  Abdias: 'Obadiah',
  Jonas: 'Jonah',
  Michée: 'Micah',
  Habacuc: 'Habakkuk',
  Sophonie: 'Zephaniah',
  Aggée: 'Haggai',
  Zacharie: 'Zechariah',
  Malachie: 'Malachi',
  Matthieu: 'Matthew',
  Marc: 'Mark',
  Luc: 'Luke',
  Jean: 'John',
  Actes: 'Acts',
  Romains: 'Romans',
  '1 Corinthiens': '1 Corinthians',
  Galates: 'Galatians',
  Éphésiens: 'Ephesians',
  Philippiens: 'Philippians',
  Colossiens: 'Colossians',
  '1 Thessaloniciens': '1 Thessalonians',
  '1 Timothée': '1 Timothy',
  Tite: 'Titus',
  Philémon: 'Philemon',
  Hébreux: 'Hebrews',
  Jacques: 'James',
  '1 Pierre': '1 Peter',
  '1 Jean': '1 John',
  '3 Jean': '3 John',
  Apocalypse: 'Revelation'
};

describe('the French book names resolve', () => {
  it('finds each book by its Segond name', () => {
    for (const [french, english] of Object.entries(FRENCH)) {
      expect(normalizeBibleBook(french), french).toBe(english);
    }
  });

  it('finds them without the accents, which is how they get typed', () => {
    /**
     * The operator who most needs these is typing quickly on whatever keyboard
     * the desk has. Requiring `è` and `ï` would make the aliases decorative.
     *
     * BOTH MATCHERS, and that is the point. This first went through
     * `normalizeBibleBook` alone and passed while `Esaie 40:31` was still
     * failing in the app — there are two book matchers, and the typed reference
     * box uses the OTHER one (`resolveBook`, via `parseScriptureReference`).
     * `jean` has no accent to lose, so the one name I spot-checked by hand hid
     * it. A test that exercises the function you happened to change proves
     * nothing about the path an operator takes.
     */
    for (const [french, english] of Object.entries(FRENCH)) {
      const bare = foldBookText(french);
      expect(normalizeBibleBook(bare), `normalizeBibleBook("${bare}")`).toBe(english);

      const parsed = parseScriptureReference(`${bare} 1:1`);
      expect(parsed.ok, `parseScriptureReference("${bare} 1:1")`).toBe(true);
      if (parsed.ok) expect(parsed.reference.book, bare).toBe(english);
    }
  });

  it('reads an accented French reference through the typed box too', () => {
    // The same two paths, with the accents present.
    for (const [french, english] of Object.entries(FRENCH)) {
      const parsed = parseScriptureReference(`${french} 1:1`);
      expect(parsed.ok, french).toBe(true);
      if (parsed.ok) expect(parsed.reference.book, french).toBe(english);
    }
  });

  it('parses a whole French reference, verses and all', () => {
    const parsed = parseScriptureReference('Jean 3:16-18');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // The canonical form stays ENGLISH: it is what the picker, the chapter
    // table and every other provider are keyed on. The French only has to get
    // the operator in — the LSG provider puts `Jean 3:16-18` back on the card.
    expect(parsed.reference.book).toBe('John');
    expect(parsed.reference.chapter).toBe(3);
    expect(parsed.reference.canonical).toBe('John 3:16-18');
  });

  it('tells 1, 2 and 3 Jean apart, and from Jean', () => {
    // The leading number is split off before the book is matched, so these
    // four share a name and must not share a book.
    expect(normalizeBibleBook('Jean')).toBe('John');
    expect(normalizeBibleBook('1 Jean')).toBe('1 John');
    expect(normalizeBibleBook('2 Jean')).toBe('2 John');
    expect(normalizeBibleBook('3 Jean')).toBe('3 John');
  });
});

describe('nothing that used to resolve stopped resolving', () => {
  /**
   * THE REAL RISK OF ADDING ALIASES. `normalizeBibleBook` falls back to a UNIQUE
   * prefix match, so a new alias can make a previously unambiguous input
   * ambiguous and turn a working reference into "no book matches". Every
   * canonical name and every declared alias is asserted, in both languages at
   * once, because they now share one table.
   */
  it('resolves every canonical name to itself', () => {
    for (const book of BIBLE_BOOKS) {
      expect(normalizeBibleBook(book.name), book.name).toBe(book.name);
    }
  });

  it('resolves every declared alias to its own book', () => {
    const broken: string[] = [];
    for (const book of BIBLE_BOOKS) {
      for (const alias of book.aliases) {
        if (normalizeBibleBook(alias) !== book.name) broken.push(`${alias} → ${book.name}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('still reads the English references it always did', () => {
    for (const [input, expected] of [
      ['John 3:16', 'John'],
      ['1 Cor 13:4-7', '1 Corinthians'],
      ['ps 23', 'Psalms'],
      ['Rev 22', 'Revelation'],
      ['jude 1', 'Jude']
    ] as const) {
      const parsed = parseScriptureReference(input);
      expect(parsed.ok, input).toBe(true);
      if (parsed.ok) expect(parsed.reference.book, input).toBe(expected);
    }
  });
});
