import { describe, expect, it } from 'vitest';
import { BRAND_SWATCHES, planBrandColorWrite, planLogoWrite } from './brandWrites';

describe('planBrandColorWrite', () => {
  it('writes the global default and the graphic colour together', () => {
    expect(planBrandColorWrite('main', '#ff0000')).toEqual({
      theme: { accentColor: '#ff0000' },
      values: { colorBrand: '#ff0000' }
    });
  });

  it('maps the accent swatch to its own pair', () => {
    expect(planBrandColorWrite('accent', '#00ff00')).toEqual({
      theme: { accent2Color: '#00ff00' },
      values: { colorAccent: '#00ff00' }
    });
  });

  it('touches exactly one field on each side', () => {
    for (const swatch of ['main', 'accent'] as const) {
      const write = planBrandColorWrite(swatch, '#123456');
      expect(Object.keys(write.theme)).toHaveLength(1);
      expect(Object.keys(write.values)).toHaveLength(1);
      expect(Object.keys(write.values)[0]).toBe(BRAND_SWATCHES[swatch].field);
    }
  });
});

describe('planLogoWrite', () => {
  it('clears the URL when an upload lands', () => {
    expect(planLogoWrite({ type: 'asset', assetId: 'asset-1' })).toEqual({
      logoAssetId: 'asset-1',
      logoUrl: ''
    });
  });

  it('clears the upload when a URL is typed', () => {
    expect(planLogoWrite({ type: 'url', url: 'https://example.test/logo.png' })).toEqual({
      logoUrl: 'https://example.test/logo.png',
      logoAssetId: ''
    });
  });

  it('clears both on removal', () => {
    expect(planLogoWrite({ type: 'clear' })).toEqual({ logoAssetId: '', logoUrl: '' });
  });

  it('always names both keys, so one setFields call can never leave a stale pair', () => {
    const actions = [
      { type: 'asset', assetId: 'a' },
      { type: 'url', url: 'https://example.test/x.png' },
      { type: 'clear' }
    ] as const;
    for (const action of actions) {
      expect(Object.keys(planLogoWrite(action)).sort()).toEqual(['logoAssetId', 'logoUrl']);
    }
  });
});
