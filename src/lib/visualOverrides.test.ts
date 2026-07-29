import { describe, expect, it } from 'vitest';
import { describeOverrideCount, findVisualOverrides, VISUAL_OVERRIDE_FIELDS } from './visualOverrides';

const seed = {
  variantId: 'signature-medallion',
  colorBrand: '#0d2095',
  colorAccent: '#E8B93C',
  colorSurface: '#f8fafc',
  colorText: '#081052',
  colorSecondary: '#07106a',
  name: 'Rev. Ishmael K. Awotwe',
  title: 'Lead Pastor',
  subtitle: 'Mathapoly Church International'
};

describe('findVisualOverrides', () => {
  it('reports nothing for an untouched graphic', () => {
    expect(findVisualOverrides({ ...seed }, seed)).toEqual([]);
  });

  it('reports a single changed visual field', () => {
    const found = findVisualOverrides({ ...seed, colorBrand: '#ff0000' }, seed);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 'colorBrand', label: 'Main colour', value: '#ff0000' });
  });

  it('reports several changed visual fields', () => {
    const found = findVisualOverrides(
      { ...seed, colorBrand: '#ff0000', variantId: 'split-bar', logoUrl: 'https://example.test/l.png' },
      seed
    );
    expect(found.map((entry) => entry.id).sort()).toEqual(['colorBrand', 'logoUrl', 'variantId']);
  });

  it('ignores content fields entirely', () => {
    const found = findVisualOverrides(
      {
        ...seed,
        name: 'Someone Else',
        title: 'Guest Speaker',
        subtitle: 'Another Church',
        reference: 'John 3:16',
        body: 'Announcement copy'
      },
      seed
    );
    expect(found).toEqual([]);
  });

  it('treats hex casing as equal, so picking the colour already in use is not an override', () => {
    expect(findVisualOverrides({ ...seed, colorAccent: '#e8b93c' }, seed)).toEqual([]);
  });

  it('treats an absent logo and an empty logo as the same', () => {
    expect(findVisualOverrides({ ...seed, logoUrl: '', logoAssetId: '   ' }, seed)).toEqual([]);
  });

  it('detects a logo that was added where the seed has none', () => {
    const found = findVisualOverrides({ ...seed, logoAssetId: 'asset-1' }, seed);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('logoAssetId');
  });

  it('detects a seeded value that was cleared', () => {
    const found = findVisualOverrides({ ...seed, colorSurface: '' }, seed);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 'colorSurface', value: '' });
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

describe('describeOverrideCount', () => {
  it('reads naturally at zero, one and many', () => {
    expect(describeOverrideCount(0)).toBe('No visual overrides');
    expect(describeOverrideCount(1)).toBe('1 visual override');
    expect(describeOverrideCount(4)).toBe('4 visual overrides');
  });
});
