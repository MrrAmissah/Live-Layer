import { describe, expect, it } from 'vitest';
import { describeOverrideCount, findVisualOverrides, VISUAL_OVERRIDE_FIELDS } from './visualOverrides';
import { templateRegistry } from '../components/templates/registry';

const TEMPLATE_ID = 'preacher-lower-third';
const template = templateRegistry.find((entry) => entry.id === TEMPLATE_ID)!;

/** What a graphic seeded right now under the house pack carries. */
const seedValues: Record<string, string> = {
  ...template.defaultValues,
  name: 'Rev. Ishmael K. Awotwe',
  title: 'Lead Pastor',
  subtitle: 'Mathapoly Church International'
};

/** The theme such a graphic carries: the persisted brand default. */
const brandTheme = { ...template.theme };
const seed = { values: seedValues, theme: brandTheme };

const find = (values: Record<string, string>, theme: Partial<Record<string, string>> = brandTheme) =>
  findVisualOverrides(TEMPLATE_ID, { values, theme }, seed);

describe('findVisualOverrides', () => {
  it('reports nothing for an untouched graphic', () => {
    expect(find({ ...seedValues })).toEqual([]);
  });

  it('reports a single changed visual field', () => {
    const found = find({ ...seedValues, colorBrand: '#ff0000' });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 'colorBrand', label: 'Main colour', value: '#ff0000' });
  });

  it('reports several changed visual fields', () => {
    const found = find({
      ...seedValues,
      colorBrand: '#ff0000',
      variantId: 'split-bar',
      logoUrl: 'https://example.test/l.png'
    });
    expect(found.map((entry) => entry.id).sort()).toEqual(['colorBrand', 'logoUrl', 'variantId']);
  });

  it('ignores content fields entirely', () => {
    const found = find({
      ...seedValues,
      name: 'Someone Else',
      title: 'Guest Speaker',
      subtitle: 'Another Church',
      reference: 'John 3:16',
      body: 'Announcement copy'
    });
    expect(found).toEqual([]);
  });

  it('treats hex casing as equal, so picking the colour already in use is not an override', () => {
    const inUse = seedValues.colorAccent;
    expect(find({ ...seedValues, colorAccent: inUse.toLowerCase() })).toEqual([]);
    expect(find({ ...seedValues, colorAccent: inUse.toUpperCase() })).toEqual([]);
  });

  it('treats an absent logo and an empty logo as the same', () => {
    // This template seeds a logo URL, so compare against a seed that has none.
    const noLogo = { values: { ...seedValues, logoUrl: '' }, theme: brandTheme };
    expect(
      findVisualOverrides(
        TEMPLATE_ID,
        { values: { ...seedValues, logoUrl: '   ', logoAssetId: '   ' }, theme: brandTheme },
        noLogo
      )
    ).toEqual([]);
  });

  it('reports a seeded logo the operator cleared', () => {
    const found = find({ ...seedValues, logoUrl: '' });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 'logoUrl', value: '' });
  });

  it('detects a logo that was added where the seed has none', () => {
    const found = find({ ...seedValues, logoAssetId: 'asset-1' });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('logoAssetId');
  });

  it('only ever looks at the allowlist', () => {
    expect(VISUAL_OVERRIDE_FIELDS.map((field) => field.id)).toEqual([
      'variantId',
      'colorBrand',
      'colorAccent',
      'colorSurface',
      'colorText',
      'colorSecondary',
      'logoUrl',
      'logoAssetId'
    ]);
  });
});

/* --- Resolution, not raw records ----------------------------------------- *
 * A legacy or imported graphic can omit palette and variant fields; the
 * renderer fills them from the theme and the template. Comparing what is
 * stored rather than what is painted reported overrides nobody could see, and
 * missed differences carried only by the theme.
 * ------------------------------------------------------------------------ */
describe('findVisualOverrides — sparse graphics are compared as they render', () => {
  /**
   * A legacy graphic: content and the seeded logo, but no palette and no
   * variant. Its theme fills every palette gap with the colour the seed stores,
   * so it renders exactly like a graphic seeded now — the raw comparison called
   * it four overrides with an em dash for a value.
   */
  const sparse = { name: 'Rev. Ishmael K. Awotwe', title: 'Lead Pastor', logoUrl: seedValues.logoUrl };
  const matchingTheme = {
    accentColor: seedValues.colorBrand,
    accent2Color: seedValues.colorAccent,
    surfaceColor: seedValues.colorSurface,
    primaryColor: seedValues.colorText
  };

  it('reports nothing when the omitted fields resolve to the seed', () => {
    expect(find(sparse, matchingTheme)).toEqual([]);
  });

  it('reports a difference carried only by the theme, with the colour it paints', () => {
    const found = find(sparse, { ...matchingTheme, accentColor: '#ff0000' });
    expect(found).toHaveLength(1);
    // `colorBrand` falls back to `accentColor` — and the row shows the colour
    // on screen rather than the em dash a missing value used to produce.
    expect(found[0]).toMatchObject({ id: 'colorBrand', value: '#ff0000' });
  });

  it('never reports an em dash for a colour the graphic actually renders', () => {
    const found = find(sparse, { ...matchingTheme, accentColor: '#ff0000', surfaceColor: '#101010' });
    expect(found.map((entry) => entry.id).sort()).toEqual(['colorBrand', 'colorSurface']);
    for (const override of found) {
      expect(override.value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('an absent variant is the template default, which is what the seed renders', () => {
    expect(find({ ...seedValues, variantId: '' })).toEqual([]);
  });

  it('reports a legacy variant id that no longer exists, because it is not the seed’s look', () => {
    const found = find({ ...seedValues, variantId: 'variant-that-was-removed' });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 'variantId', value: 'variant-that-was-removed' });
  });

  it('still reports a cleared colour when clearing it changes what is painted', () => {
    // Cleared, `colorSurface` falls back to the theme's surfaceColor.
    const found = find({ ...seedValues, colorSurface: '' }, { ...brandTheme, surfaceColor: '#101010' });
    expect(found).toEqual([{ id: 'colorSurface', label: 'Surface colour', value: '#101010' }]);
  });
});

describe('describeOverrideCount', () => {
  it('reads naturally at zero, one and many', () => {
    expect(describeOverrideCount(0)).toBe('No visual overrides');
    expect(describeOverrideCount(1)).toBe('1 visual override');
    expect(describeOverrideCount(4)).toBe('4 visual overrides');
  });
});
