import { describe, expect, it } from 'vitest';
import { compactReading, compactReadings } from './compactLocator';

const reading = (book: string, digits: string) => compactReading(book, digits)?.reference.canonical ?? null;
const all = (book: string, digits: string) => compactReadings(book, digits).map((r) => r.reference.canonical);

describe('a chapter and verse spoken as one number', () => {
  /**
   * Both of these came from a real microphone, and both were refused with "that
   * is not a passage" while the operator stood there having said the most quoted
   * verse in the Bible.
   */
  it('reads the references the microphone actually produced', () => {
    expect(reading('John', '316')).toBe('John 3:16');
    expect(reading('Romans', '828')).toBe('Romans 8:28');
  });

  it('is the CANON that rejects the other split, not a preference', () => {
    // John 316 could be 3:16 or 31:6. John has 21 chapters, so only one exists.
    expect(all('John', '316')).toEqual(['John 3:16']);
    // Romans 828 could be 8:28 or 82:8. Romans has 16 chapters.
    expect(all('Romans', '828')).toEqual(['Romans 8:28']);
  });

  it('handles four digits', () => {
    // Genesis has 50 chapters: 1:234 and 12:34 survive chapter bounds, 123:4 does not.
    expect(all('Genesis', '1234')).toEqual(['Genesis 1:234', 'Genesis 12:34']);
    expect(reading('Genesis', '1234')).toBeNull(); // ambiguous — refused
  });

  it('refuses when the canon does not settle it', () => {
    // Psalms has 150 chapters, so 1:191, 11:91 and 119:1 are all structurally
    // possible. Guessing between real passages is the failure this prevents.
    expect(compactReadings('Psalms', '1191').length).toBeGreaterThan(1);
    expect(reading('Psalms', '1191')).toBeNull();
  });

  it('refuses when no split is a real passage', () => {
    expect(reading('Jude', '999')).toBeNull();
  });
});

describe('what it must never do', () => {
  it('leaves a plain chapter alone', () => {
    // "Psalm twenty three" is Psalm 23, not Psalm 2:3 — which is also a real
    // verse, which is exactly why two-digit locators are never split.
    expect(reading('Psalms', '23')).toBeNull();
    expect(reading('John', '21')).toBeNull();
  });

  it('does not invent, drop or round a digit', () => {
    // Every candidate is a split of the digits heard; 316 can never become 3:6.
    for (const r of compactReadings('John', '316')) {
      expect(`${r.chapter}${r.verse}`).toBe('316');
    }
  });

  it('refuses leading zeros rather than reinterpreting them', () => {
    expect(reading('John', '0316')).toBeNull();
    expect(all('John', '3016')).toEqual([]);
  });

  it('ignores anything that is not a run of digits', () => {
    expect(reading('John', '3:16')).toBeNull();
    expect(reading('John', 'three')).toBeNull();
    expect(reading('John', '')).toBeNull();
  });

  it('does not split a locator longer than four digits', () => {
    expect(all('Psalms', '11976')).toEqual([]);
  });
});
