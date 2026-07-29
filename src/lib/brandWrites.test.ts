import { beforeEach, describe, expect, it } from 'vitest';
import {
  BRAND_SWATCHES,
  applyLogoUrl,
  planBrandColorWrite,
  planBrandResetValues,
  planLogoWrite
} from './brandWrites';
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

describe('planBrandResetValues', () => {
  it('restores the template’s own brand colours', () => {
    const defaults = templateRegistry.find((t) => t.id === 'preacher-lower-third')!.defaultValues;
    expect(planBrandResetValues('preacher-lower-third', 'house')).toEqual({
      colorBrand: defaults.colorBrand,
      colorAccent: defaults.colorAccent
    });
  });

  it('restores the active pack’s palette rather than the house one', () => {
    expect(planBrandResetValues('preacher-lower-third', 'ppc-2026')).toEqual({
      colorBrand: PPC_PALETTE.colorBrand,
      colorAccent: PPC_PALETTE.colorAccent
    });
  });

  it('only ever touches the two fields Brand owns', () => {
    const keys = Object.keys(planBrandResetValues('scripture-card', 'house')).sort();
    expect(keys).toEqual(['colorAccent', 'colorBrand']);
  });

  it('yields nothing for an unknown template instead of guessing', () => {
    expect(planBrandResetValues('retired-template', 'house')).toEqual({});
  });
});

describe('applyLogoUrl', () => {
  it('clears an uploaded asset when a URL is typed', () => {
    const next = applyLogoUrl({ logoAssetId: 'asset-1', name: 'Keep me' }, 'https://x.test/l.png');
    expect(next).toEqual({ logoAssetId: '', logoUrl: 'https://x.test/l.png', name: 'Keep me' });
  });

  it('leaves an upload alone when the URL is merely cleared', () => {
    // Emptying the URL box is not a request to delete a stored image.
    const next = applyLogoUrl({ logoAssetId: 'asset-1', logoUrl: 'https://x.test/l.png' }, '');
    expect(next.logoAssetId).toBe('asset-1');
    expect(next.logoUrl).toBe('');
  });

  it('treats whitespace as empty', () => {
    expect(applyLogoUrl({ logoAssetId: 'asset-1' }, '   ').logoAssetId).toBe('asset-1');
  });

  it('preserves every unrelated value', () => {
    const next = applyLogoUrl({ name: 'Speaker', colorBrand: '#123456' }, 'https://x.test/l.png');
    expect(next.name).toBe('Speaker');
    expect(next.colorBrand).toBe('#123456');
  });

  it('never mutates its input', () => {
    const values = { logoAssetId: 'asset-1' };
    applyLogoUrl(values, 'https://x.test/l.png');
    expect(values).toEqual({ logoAssetId: 'asset-1' });
  });
});

describe('planBrandColorWrite — target semantics', () => {
  it('moves the global default in draft mode', () => {
    expect(planBrandColorWrite('main', '#ff0000', false)).toEqual({
      theme: { accentColor: '#ff0000' },
      values: { colorBrand: '#ff0000' }
    });
  });

  it('leaves the global default alone for a selected rundown item', () => {
    expect(planBrandColorWrite('main', '#ff0000', true)).toEqual({
      theme: {},
      values: { colorBrand: '#ff0000' }
    });
    expect(planBrandColorWrite('accent', '#00ff00', true)).toEqual({
      theme: {},
      values: { colorAccent: '#00ff00' }
    });
  });

  it('writes the visible graphic in both modes', () => {
    for (const isItem of [false, true]) {
      expect(planBrandColorWrite('main', '#123456', isItem).values).toEqual({ colorBrand: '#123456' });
    }
  });
});
