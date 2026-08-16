import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSLATION_ID,
  availableTranslations,
  defaultTranslationId
} from './providers';
import { bibleApiProvider } from './bibleApiProvider';
import { getScriptureDraft } from './scriptureDraftStore';
import { templateRegistry } from '../../components/templates/registry';

/**
 * THE KING JAMES IS THE DEFAULT, AND IT IS A DECISION RATHER THAN AN ARRAY INDEX.
 *
 * It used to be the WEB, for no reason except that it stood first in
 * `bibleApiProvider.translations`. This congregation reads the King James aloud,
 * and a translation that has to be re-picked on every lookup is a step to forget
 * under pressure.
 *
 * These tests exist to stop it drifting back. Re-ordering the picker for
 * readability must not change what goes to air, and the provider's own fallback
 * must not disagree with the app's — it is a duplicated literal (importing the
 * constant would be a cycle), so it is pinned here instead.
 */
describe('the default translation', () => {
  it('is the KJV', () => {
    expect(DEFAULT_TRANSLATION_ID).toBe('kjv');
    expect(defaultTranslationId()).toBe('kjv');
  });

  it('is a translation something can actually serve', () => {
    // A default nobody offers is a picker that opens on a broken option.
    expect(availableTranslations().map((t) => t.id)).toContain(DEFAULT_TRANSLATION_ID);
  });

  it('does not move when the picker is re-ordered', () => {
    /**
     * The old code was `translations[0]?.id`. This asserts the two are no longer
     * the same thing: the WEB still leads the list, and the default is the KJV
     * regardless. If someone alphabetises the picker one day, nothing about what
     * airs should change.
     */
    expect(availableTranslations()[0]?.id).not.toBe(DEFAULT_TRANSLATION_ID);
    expect(defaultTranslationId()).toBe(DEFAULT_TRANSLATION_ID);
  });

  it('is what an untouched Scripture workspace is already set to', () => {
    expect(getScriptureDraft().translationId).toBe(DEFAULT_TRANSLATION_ID);
  });

  it('is also what a NEW scripture card is seeded with', () => {
    /**
     * Reported as "I still see WEB" after the default moved. The picker opened
     * on KJV and a new card still seeded `translationLabel: 'WEB'`, because the
     * template's `defaultValues` were written when the WEB was the default and
     * nothing tied the two together. This is that tie.
     */
    const card = templateRegistry.find((entry) => entry.id === 'scripture-card');
    expect(card?.defaultValues.translationLabel).toBe(DEFAULT_TRANSLATION_ID.toUpperCase());
  });

  it('seeds the WORDS of that translation, not just its name', () => {
    /**
     * The label and the text move together or not at all. A KJV label over the
     * WEB's wording is a citation on air that does not match what is under it —
     * worse than a stale label, because the label is what tells a viewer which
     * Bible they are reading.
     *
     * "Yahweh" is the World English Bible's rendering of the divine name and
     * appears in no King James verse, so its presence is a precise detector for
     * the seed having been left behind.
     */
    const card = templateRegistry.find((entry) => entry.id === 'scripture-card');
    expect(card?.defaultValues.verseText).not.toContain('Yahweh');
    expect(card?.defaultValues.verseText).toContain('The LORD is my shepherd');
  });

  it('is also what the provider falls back to when a caller omits it', async () => {
    // Every caller in the app passes one, so this only fires for a caller that
    // forgets — and a forgetful caller should still get the church's reading.
    let seenUrl = '';
    await bibleApiProvider.lookup('John 3:16', undefined, {
      fetchImpl: (async (url: string) => {
        seenUrl = String(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            reference: 'John 3:16',
            text: 'For God so loved the world.',
            translation_name: 'King James Version',
            verses: [{ verse: 16, text: 'For God so loved the world.' }]
          })
        } as unknown as Response;
      }) as unknown as typeof fetch
    });
    expect(seenUrl).toContain(DEFAULT_TRANSLATION_ID);
  });
});
