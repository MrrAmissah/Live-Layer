import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { localBibleProvider } from './localBibleProvider';
import { availableTranslations, providerForTranslation } from './providers';
import { usfmCodeFor } from './apiBibleProvider';
import { BIBLE_BOOKS } from './bibleBooks';

const NBSP = '\u00a0';
const TWI_DIR = 'public/bibles/twi';
const VENDORED = existsSync(`${TWI_DIR}/about.json`);

const readBook = (code: string) => JSON.parse(readFileSync(`${TWI_DIR}/${code}.json`, 'utf8'));

/** Serve the real vendored files the way the browser would. */
const fromDisk = (async (url: string) => {
  const code = String(url).split('/').pop()?.replace('.json', '') ?? '';
  const path = `${TWI_DIR}/${code}.json`;
  if (!existsSync(path)) return { ok: false, status: 404 } as unknown as Response;
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(readFileSync(path, 'utf8'))
  } as unknown as Response;
}) as unknown as typeof fetch;

/**
 * The Twi Bible, served by LiveLayer itself.
 *
 * Tested against the REAL vendored files rather than fixtures, because the
 * thing most likely to be wrong is the shape of what
 * `scripts/fetch-bible-text.mjs` wrote — not the code that reads it. Skips
 * rather than fails when they are absent, so a clean checkout that has not run
 * the fetch script yet is not a red suite.
 */
describe.skipIf(!VENDORED)('the Twi text on disk', () => {
  it('has all 66 books under the codes the app asks for', () => {
    /**
     * eBible's own VPL codes are NOT USFM for eleven books — `JOH` for John,
     * `1JO` for 1 John, `SOL` for Song of Songs. The fetch script normalises
     * them, and without that a lookup for the single most likely first request,
     * John 3:16, would have 404'd.
     */
    for (const book of BIBLE_BOOKS) {
      const code = usfmCodeFor(book.name)!;
      expect(existsSync(`${TWI_DIR}/${code}.json`), `${book.name} → ${code}`).toBe(true);
    }
  });

  it('carries the licence beside the text, not only in a comment', () => {
    // CC BY-SA is the entire permission for this file existing. It has to be
    // recorded where the text is, so a copy of the folder carries it too.
    const about = JSON.parse(readFileSync(`${TWI_DIR}/about.json`, 'utf8'));
    expect(about.licence).toBe('CC BY-SA 4.0');
    expect(about.attribution).toContain('Biblica');
    expect(about.source).toContain('ebible.org');
  });

  it('agrees with the provider about what it is', () => {
    /**
     * The provider declares the label and attribution so `translations` can be
     * synchronous; the script writes them beside the text. A disagreement would
     * put the wrong name under the right words, so the two are pinned.
     */
    const about = JSON.parse(readFileSync(`${TWI_DIR}/about.json`, 'utf8'));
    const declared = localBibleProvider.translations.find((t) => t.id === 'twi')!;
    expect(declared.label).toBe(about.label);
    expect(declared.name).toBe(about.name);
    expect(declared.language).toBe(about.language);
  });

  it('is a real Bible, not a truncated download', () => {
    // Genesis 1 and Revelation 22 both present is a cheap end-to-end check that
    // the archive was complete.
    expect(readBook('GEN')['1']['1']).toBeTruthy();
    expect(readBook('REV')['22']['21']).toBeTruthy();
    expect(Object.keys(readBook('PSA')).length).toBe(150);
  });
});

describe.skipIf(!VENDORED)('reading it', () => {
  it('is offered in the picker, and routes back to itself', () => {
    expect(availableTranslations().map((t) => t.id)).toContain('twi');
    expect(providerForTranslation('twi').id).toBe('local-bible');
  });

  it('returns the Twi words for an English reference', async () => {
    const result = await localBibleProvider.lookup('John 3:16', 'twi', { fetchImpl: fromDisk });
    expect(result.translation).toBe('TWI');
    expect(result.text).toContain('Onyankopɔn');
    // The citation stays English: this file has no Twi book names, and
    // inventing one would be worse than printing the English.
    expect(result.reference).toBe('John 3:16');
  });

  it('carries the attribution the licence requires onto the graphic', async () => {
    const result = await localBibleProvider.lookup('John 3:16', 'twi', { fetchImpl: fromDisk });
    expect(result.attribution).toContain('Biblica');
    expect(result.attribution).toContain('CC BY-SA');
  });

  it('numbers a passage and leaves a single verse alone', async () => {
    const one = await localBibleProvider.lookup('John 3:16', 'twi', { fetchImpl: fromDisk });
    expect(one.text.startsWith('16')).toBe(false);

    const many = await localBibleProvider.lookup('John 3:16-18', 'twi', { fetchImpl: fromDisk });
    expect(many.text.startsWith(`16${NBSP}`)).toBe(true);
    expect(many.text).toContain(`17${NBSP}`);
  });

  it('puts a whole chapter in NUMERIC order', async () => {
    /**
     * `Object.entries` yields "10" before "9". Sorting lexically would print
     * Psalm 119 with verse 100 in the middle of the teens — wrong in a way that
     * looks like a translation quirk rather than a bug.
     */
    const result = await localBibleProvider.lookup('Psalms 119', 'twi', { fetchImpl: fromDisk });
    const order = [...result.text.matchAll(/(\d+)\u00a0/g)].map((m) => Number(m[1]));
    expect(order[0]).toBe(1);
    expect(order[9]).toBe(10);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('takes only the verses asked for', async () => {
    const result = await localBibleProvider.lookup('John 3:16,18', 'twi', { fetchImpl: fromDisk });
    expect(result.text).toContain(`16${NBSP}`);
    expect(result.text).toContain(`18${NBSP}`);
    expect(result.text).not.toContain(`17${NBSP}`);
  });

  it('counts a chapter exactly, with no request of its own', async () => {
    const count = await localBibleProvider.fetchChapterVerseCount!('Psalms', 119, 'twi', {
      fetchImpl: fromDisk
    });
    expect(count).toBe(176);
  });

  it('lets the parser refuse an impossible chapter, in its own words', async () => {
    /**
     * `John 99:1` never reaches the files: `parseScriptureReference` knows John
     * has 21 chapters and says so, and the panel renders that sentence. This
     * test originally expected a bare `lookup-not-found` and was simply worse
     * than the behaviour — an operator is better served by "John has 21
     * chapters" than by a code.
     */
    await expect(
      localBibleProvider.lookup('John 99:1', 'twi', { fetchImpl: fromDisk })
    ).rejects.toThrow(/21 chapters/);
  });

  it('reports a text it does not have as not found', async () => {
    await expect(
      localBibleProvider.lookup('John 3:16', 'not-vendored', { fetchImpl: fromDisk })
    ).rejects.toThrow('lookup-not-found');
  });
});
