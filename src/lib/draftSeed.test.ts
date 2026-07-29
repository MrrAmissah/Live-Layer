import { beforeEach, describe, expect, it } from 'vitest';
import { createDraftValues, themeSeedValues } from './draftSeed';
import { defaultBrandTheme } from './storage';
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

describe('themeSeedValues', () => {
  it('contributes nothing while the brand is untouched', () => {
    expect(themeSeedValues(defaultBrandTheme())).toEqual({});
  });

  it('contributes only the swatches the operator actually changed', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '#ff0000' };
    expect(themeSeedValues(theme)).toEqual({ colorBrand: '#ff0000' });
  });

  it('maps both swatches to their per-graphic colour fields', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '#ff0000', accent2Color: '#00ff00' };
    expect(themeSeedValues(theme)).toEqual({ colorBrand: '#ff0000', colorAccent: '#00ff00' });
  });

  it('ignores a changed case of the same colour', () => {
    const defaults = defaultBrandTheme();
    const theme = { ...defaults, accentColor: defaults.accentColor.toUpperCase() };
    expect(themeSeedValues(theme)).toEqual({});
  });

  it('ignores blank values rather than seeding an empty colour', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '   ' };
    expect(themeSeedValues(theme)).toEqual({});
  });
});

describe('createDraftValues', () => {
  it('leaves every template on its own declared palette when the brand is untouched', () => {
    for (const template of templateRegistry) {
      const seeded = createDraftValues(template.id, 'house', defaultBrandTheme());
      expect(seeded.colorBrand).toBe(registryDefaults(template.id).colorBrand);
      expect(seeded.colorAccent).toBe(registryDefaults(template.id).colorAccent);
    }
  });

  it('seeds new House Style graphics from the saved brand colours', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '#ff0000', accent2Color: '#00ff00' };
    const seeded = createDraftValues('preacher-lower-third', 'house', theme);
    expect(seeded.colorBrand).toBe('#ff0000');
    expect(seeded.colorAccent).toBe('#00ff00');
  });

  it('keeps content defaults intact while seeding brand colours', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '#ff0000' };
    const seeded = createDraftValues('preacher-lower-third', 'house', theme);
    expect(seeded.name).toBe(registryDefaults('preacher-lower-third').name);
    expect(seeded.variantId).toBe(registryDefaults('preacher-lower-third').variantId);
  });

  it('lets an explicit event-pack palette beat the saved brand', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '#ff0000', accent2Color: '#00ff00' };
    const seeded = createDraftValues('preacher-lower-third', 'ppc-2026', theme);
    expect(seeded.colorBrand).toBe(PPC_PALETTE.colorBrand);
    expect(seeded.colorAccent).toBe(PPC_PALETTE.colorAccent);
  });

  it('keeps a pack template’s non-palette overrides alongside the brand seed', () => {
    const theme = { ...defaultBrandTheme(), accentColor: '#ff0000' };
    const seeded = createDraftValues('preacher-lower-third', 'ppc-2026', theme);
    expect(seeded.variantId).toBe('convention-strap');
    expect(seeded.subtitle).toBe("Annual PPC '26");
  });

  it('returns nothing for an unknown template', () => {
    expect(createDraftValues('not-a-template', 'house', defaultBrandTheme())).toEqual({});
  });
});
