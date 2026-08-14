import { beforeEach, describe, expect, it } from 'vitest';
import { createDraftValues, NO_EXPLICIT_BRAND, themeSeedValues } from './draftSeed';
import {
  defaultBrandTheme,
  loadBrandOverrides,
  loadExplicitBrandKeys,
  saveBrandOverrides,
  saveExplicitBrandKeys
} from './storage';
import { PPC_PALETTE } from './packs';
import { templateRegistry } from '../components/templates/registry';

const MARKER_KEY = 'livelayer.brandExplicit';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});

const registryDefaults = (templateId: string) =>
  templateRegistry.find((template) => template.id === templateId)!.defaultValues;

/** The built-in accent: the value an equality check would mistake for "untouched". */
const DEFAULT_ACCENT2 = defaultBrandTheme().accent2Color!;

describe('themeSeedValues', () => {
  it('contributes nothing while no swatch has been chosen', () => {
    expect(themeSeedValues(defaultBrandTheme(), NO_EXPLICIT_BRAND)).toEqual({});
  });

  it('contributes only the swatches marked explicit', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '#ff0000', accent2Color: '#00ff00' };
    expect(themeSeedValues(theme, ['accentColor'])).toEqual({ colorBrand: '#ff0000' });
  });

  it('maps both swatches to their per-graphic colour fields', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '#ff0000', accent2Color: '#00ff00' };
    expect(themeSeedValues(theme, ['accentColor', 'accent2Color'])).toEqual({
      colorBrand: '#ff0000',
      colorAccent: '#00ff00'
    });
  });

  it('seeds an explicit choice that happens to equal the built-in default', () => {
    // The whole point of tracking markers: value equality is not evidence of
    // "untouched", and this choice must survive like any other.
    const theme = { ...defaultBrandTheme(), accent2Color: DEFAULT_ACCENT2 };
    expect(themeSeedValues(theme, ['accent2Color'])).toEqual({ colorAccent: DEFAULT_ACCENT2 });
  });

  it('ignores a marked but blank value rather than seeding an empty colour', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '   ' };
    expect(themeSeedValues(theme, ['accentColor'])).toEqual({});
  });

  it('ignores an unmarked swatch even when its value differs from the default', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '#ff0000' };
    expect(themeSeedValues(theme, NO_EXPLICIT_BRAND)).toEqual({});
  });
});

describe('createDraftValues', () => {
  it('leaves every template on its own declared palette while nothing is chosen', () => {
    for (const template of templateRegistry) {
      const seeded = createDraftValues(template.id, 'house', defaultBrandTheme(), NO_EXPLICIT_BRAND);
      expect(seeded.colorBrand).toBe(registryDefaults(template.id).colorBrand);
      expect(seeded.colorAccent).toBe(registryDefaults(template.id).colorAccent);
    }
  });

  it('seeds new House Style graphics from the chosen brand colours', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '#ff0000', accent2Color: '#00ff00' };
    const seeded = createDraftValues('preacher-lower-third', 'house', theme, ['accentColor', 'accent2Color']);
    expect(seeded.colorBrand).toBe('#ff0000');
    expect(seeded.colorAccent).toBe('#00ff00');
  });

  it('keeps a default-equal choice across every template it seeds', () => {
    // Preacher ships gold; the operator picked the built-in electric blue.
    expect(registryDefaults('preacher-lower-third').colorAccent).not.toBe(DEFAULT_ACCENT2);
    const theme = { ...defaultBrandTheme(), accent2Color: DEFAULT_ACCENT2 };
    for (const templateId of ['preacher-lower-third', 'quote-card', 'sermon-title']) {
      const seeded = createDraftValues(templateId, 'house', theme, ['accent2Color']);
      expect(seeded.colorAccent).toBe(DEFAULT_ACCENT2);
    }
  });

  it('keeps content defaults intact while seeding brand colours', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '#ff0000' };
    const seeded = createDraftValues('preacher-lower-third', 'house', theme, ['accentColor']);
    expect(seeded.name).toBe(registryDefaults('preacher-lower-third').name);
    expect(seeded.variantId).toBe(registryDefaults('preacher-lower-third').variantId);
  });

  it('lets an explicit event-pack palette beat the chosen brand', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '#ff0000', accent2Color: '#00ff00' };
    const seeded = createDraftValues('preacher-lower-third', 'ppc-2026', theme, ['accentColor', 'accent2Color']);
    expect(seeded.colorBrand).toBe(PPC_PALETTE.colorBrand);
    expect(seeded.colorAccent).toBe(PPC_PALETTE.colorAccent);
  });

  it('keeps a pack template’s non-palette overrides alongside the brand seed', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '#ff0000' };
    const seeded = createDraftValues('preacher-lower-third', 'ppc-2026', theme, ['accentColor']);
    // The pack's own variant choice, whatever it currently is — what this test
    // is about is that a pack's NON-palette overrides survive the brand seed,
    // and naming the variant literally made it fail when the pack's default
    // moved to modern-minimal.
    expect(seeded.variantId).toBe('modern-minimal');
    expect(seeded.subtitle).toBe("Annual PPC '26");
  });

  it('returns nothing for an unknown template', () => {
    expect(createDraftValues('not-a-template', 'house', defaultBrandTheme(), NO_EXPLICIT_BRAND)).toEqual({});
  });
});

describe('explicit brand markers — persistence', () => {
  it('starts empty on a fresh install', () => {
    expect(loadExplicitBrandKeys()).toEqual([]);
  });

  it('round-trips a saved marker set', () => {
    saveExplicitBrandKeys(['accent2Color']);
    expect(loadExplicitBrandKeys()).toEqual(['accent2Color']);
  });

  it('round-trips a default-equal choice, the case value comparison would lose', () => {
    saveBrandOverrides({ ...defaultBrandTheme(), accent2Color: DEFAULT_ACCENT2 });
    saveExplicitBrandKeys(['accent2Color']);
    expect(loadExplicitBrandKeys()).toEqual(['accent2Color']);
  });

  it('saves only the two allowed keys, de-duplicated and in a stable order', () => {
    saveExplicitBrandKeys([
      'accent2Color',
      'accentColor',
      'accent2Color',
      'primaryColor' as unknown as 'accentColor'
    ]);
    expect(loadExplicitBrandKeys()).toEqual(['accentColor', 'accent2Color']);
  });

  it('filters unsupported entries out of a stored array', () => {
    localStorage.setItem(MARKER_KEY, JSON.stringify(['accentColor', 'primaryColor', 'surfaceColor']));
    expect(loadExplicitBrandKeys()).toEqual(['accentColor']);
  });

  it('de-duplicates repeated entries in a stored array', () => {
    localStorage.setItem(MARKER_KEY, JSON.stringify(['accent2Color', 'accent2Color', 'accent2Color']));
    expect(loadExplicitBrandKeys()).toEqual(['accent2Color']);
  });

  it('treats an explicitly emptied set as empty, not as a legacy record', () => {
    saveBrandOverrides({ ...defaultBrandTheme(), accentColor: '#ff0000' });
    saveExplicitBrandKeys([]);
    expect(loadExplicitBrandKeys()).toEqual([]);
  });
});

/*
 * A PRESENT-but-broken marker record is not a legacy record. Falling through to
 * inference would let a corrupted file quietly resume seeding whatever colours
 * happen to sit in `livelayer.brand`. Every case below therefore pairs the bad
 * marker data with a CUSTOM brand, so inference would be visible if it ran.
 */
describe('explicit brand markers — a present but broken record reads as empty', () => {
  beforeEach(() => {
    saveBrandOverrides({ ...defaultBrandTheme(), accentColor: '#ff0000', accent2Color: '#00ff00' });
  });

  it('malformed JSON', () => {
    localStorage.setItem(MARKER_KEY, '{not json');
    expect(loadExplicitBrandKeys()).toEqual([]);
  });

  it('an empty string', () => {
    localStorage.setItem(MARKER_KEY, '');
    expect(loadExplicitBrandKeys()).toEqual([]);
  });

  it('a JSON object', () => {
    localStorage.setItem(MARKER_KEY, JSON.stringify({ accentColor: true }));
    expect(loadExplicitBrandKeys()).toEqual([]);
  });

  it('a JSON string', () => {
    localStorage.setItem(MARKER_KEY, JSON.stringify('accentColor'));
    expect(loadExplicitBrandKeys()).toEqual([]);
  });

  it('a JSON number', () => {
    localStorage.setItem(MARKER_KEY, JSON.stringify(42));
    expect(loadExplicitBrandKeys()).toEqual([]);
  });

  it('a JSON boolean', () => {
    localStorage.setItem(MARKER_KEY, JSON.stringify(true));
    expect(loadExplicitBrandKeys()).toEqual([]);
  });

  it('JSON null', () => {
    localStorage.setItem(MARKER_KEY, JSON.stringify(null));
    expect(loadExplicitBrandKeys()).toEqual([]);
  });

  it('and a broken record never seeds the custom brand into a new draft', () => {
    localStorage.setItem(MARKER_KEY, JSON.stringify({ accentColor: true }));
    const seeded = createDraftValues(
      'preacher-lower-third',
      'house',
      loadBrandOverrides(),
      loadExplicitBrandKeys()
    );
    expect(seeded.colorBrand).toBe(registryDefaults('preacher-lower-third').colorBrand);
    expect(seeded.colorAccent).toBe(registryDefaults('preacher-lower-third').colorAccent);
    expect(seeded.colorBrand).not.toBe('#ff0000');
  });
});

describe('explicit brand markers — unreadable storage', () => {
  it('returns empty rather than inferring, because absence was never established', () => {
    saveBrandOverrides({ ...defaultBrandTheme(), accentColor: '#ff0000' });
    const working = globalThis.localStorage;
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem(key: string) {
        if (key === MARKER_KEY) throw new Error('storage unavailable');
        return working.getItem(key);
      },
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0
    };
    try {
      expect(loadExplicitBrandKeys()).toEqual([]);
    } finally {
      (globalThis as unknown as { localStorage: unknown }).localStorage = working;
    }
  });
});

describe('explicit brand markers — legacy records (marker key genuinely absent)', () => {
  it('infers a marker where a stored colour differs from the default', () => {
    // Written before markers existed: no marker key at all.
    saveBrandOverrides({ ...defaultBrandTheme(), accentColor: '#ff0000' });
    expect(localStorage.getItem(MARKER_KEY)).toBeNull();
    expect(loadExplicitBrandKeys()).toEqual(['accentColor']);
  });

  it('infers both markers when both differ', () => {
    saveBrandOverrides({ ...defaultBrandTheme(), accentColor: '#ff0000', accent2Color: '#00ff00' });
    expect(loadExplicitBrandKeys()).toEqual(['accentColor', 'accent2Color']);
  });

  it('leaves default-equal legacy values unmarked — indistinguishable from untouched', () => {
    saveBrandOverrides({ ...defaultBrandTheme() });
    expect(loadExplicitBrandKeys()).toEqual([]);
  });

  it('ignores non-brand differences', () => {
    saveBrandOverrides({ ...defaultBrandTheme(), surfaceColor: '#123456' });
    expect(loadExplicitBrandKeys()).toEqual([]);
  });

  it('an inferred legacy marker does seed the stored colour', () => {
    saveBrandOverrides({ ...defaultBrandTheme(), accentColor: '#ff0000' });
    const seeded = createDraftValues(
      'preacher-lower-third',
      'house',
      loadBrandOverrides(),
      loadExplicitBrandKeys()
    );
    expect(seeded.colorBrand).toBe('#ff0000');
  });
});
