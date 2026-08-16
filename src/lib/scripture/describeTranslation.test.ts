import { describe, expect, it } from 'vitest';
import { availableTranslations, describeTranslation, providerForTranslation } from './providers';

/**
 * A PICKER ROW HAS TO SAY WHAT THE THING IS.
 *
 * The lookup panel spelled the full name out and the reference picker printed
 * the bare code, so the same list read as "KJV — King James Version" in one
 * surface and "KJV" in the other. Survivable for the KJV; useless for `LSG`,
 * `DRA` or `OEB-CW`, which say nothing at all to an operator who has not met
 * them — and the list passed a dozen entries the moment French arrived.
 */
describe('how a translation reads in a picker', () => {
  it('names the translation, not just its code', () => {
    const kjv = availableTranslations().find((t) => t.id === 'kjv')!;
    expect(describeTranslation(kjv)).toBe('KJV — King James Version');
  });

  it('says the language when it is not English', () => {
    const lsg = availableTranslations().find((t) => t.id === 'lsg')!;
    expect(describeTranslation(lsg)).toContain('Louis Segond');
    expect(describeTranslation(lsg)).toContain('French');
  });

  it('stays quiet about English, which is most of the list', () => {
    /**
     * Eleven rows reading "English" is noise that hides the two rows where the
     * language is the whole point. The non-English entries stand out precisely
     * because the others say nothing.
     */
    for (const translation of availableTranslations()) {
      if (translation.language === 'English') {
        // The APPENDED suffix, not the word: "World English Bible" carries
        // "English" in its own name and always should.
        expect(describeTranslation(translation), translation.id).not.toContain('\u00b7 English');
      }
    }
  });

  it('warns where a translation does not cover the whole canon', () => {
    // A Genesis lookup against a New-Testament-only text returns "not found",
    // which reads as a broken service rather than a missing book.
    const ylt = availableTranslations().find((t) => t.id === 'ylt')!;
    expect(describeTranslation(ylt)).toContain('New Testament only');
  });

  it('gives every offered translation something to read', () => {
    for (const translation of availableTranslations()) {
      const described = describeTranslation(translation);
      expect(described, translation.id).toContain('—');
      // Longer than the bare code, which is the whole point of the change.
      expect(described.length, translation.id).toBeGreaterThan(translation.label.length + 3);
    }
  });
});

describe('verse chips are asked of the right service', () => {
  it('routes the verse count by translation, not to a fixed provider', () => {
    /**
     * `useChapterVerses` read `defaultScriptureProvider` — permanently
     * `bibleApiProvider` — so choosing the LSG sent a verse-count request for
     * `lsg` to a service with no French at all. It failed, the hook degraded to
     * `unavailable` exactly as designed, and the operator got two number inputs
     * where the KJV had given them a grid. Silent, and only on the newest
     * translation: everything looked fine until you picked that one.
     */
    expect(providerForTranslation('lsg').id).toBe('getbible');
    expect(providerForTranslation('kjv').id).toBe('bible-api');
    expect(providerForTranslation('lsg').fetchChapterVerseCount).toBeTypeOf('function');
  });

  it('leaves the ESV on typed inputs, which is correct rather than broken', () => {
    // Crossway's endpoint cannot say how long a chapter is, so that provider
    // deliberately implements none and the picker degrades to its inputs.
    const esv = providerForTranslation('esv');
    if (esv.id === 'esv-api') expect(esv.fetchChapterVerseCount).toBeUndefined();
  });
});
