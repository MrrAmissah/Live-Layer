import { beforeEach, describe, expect, it } from 'vitest';
import { createDraftValues, NO_EXPLICIT_BRAND, themeSeedValues } from './draftSeed';
import {
  defaultBrandTheme,
  loadExplicitBrandKeys,
  saveBrandOverrides,
  saveExplicitBrandKeys
} from './storage';
import { PPC_PALETTE } from './packs';
import { templateRegistry } from '../components/templates/registry';

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
    expect(seeded.variantId).toBe('convention-strap');
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

  it('rejects a malformed stored value instead of trusting it', () => {
    localStorage.setItem('livelayer.brandExplicit', JSON.stringify(['nonsense', 42, null]));
    expect(loadExplicitBrandKeys()).toEqual([]);
  });

  it('treats an explicitly emptied set as empty, not as a legacy record', () => {
    saveBrandOverrides({ ...defaultBrandTheme(), accentColor: '#ff0000' });
    saveExplicitBrandKeys([]);
    expect(loadExplicitBrandKeys()).toEqual([]);
  });
});

describe('explicit brand markers — legacy records', () => {
  it('infers a marker where a stored colour differs from the default', () => {
    // Written before markers existed: no marker key at all.
    saveBrandOverrides({ ...defaultBrandTheme(), accentColor: '#ff0000' });
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
});
