import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planLogoWrite } from '../../lib/brandWrites';

/**
 * Reusing a saved image must stay a REFERENCE operation.
 *
 * The store has always held saved images; nothing that authored a graphic could
 * reach them, so the church logo was re-uploaded per graphic and per Person.
 * The risk in fixing that is the obvious one: a picker that hands back bytes,
 * or writes a data/object URL where an id belongs, or quietly deletes the
 * underlying file when the operator only meant to take it off this graphic.
 */

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const picker = strip(readFileSync('src/components/control/SavedImagePicker.tsx', 'utf8'));
const logo = strip(readFileSync('src/components/control/LogoControls.tsx', 'utf8'));

describe('the picker hands back a reference, never bytes', () => {
  it('its selection callback carries an asset id', () => {
    expect(picker).toMatch(/onSelect:\s*\(assetId: string\)\s*=>\s*void/);
    expect(picker).toContain('onSelect(asset.id)');
  });

  it('never reads or passes a blob', () => {
    for (const forbidden of [/getAssetBlob/, /URL\.createObjectURL/, /new Blob/, /FileReader/]) {
      expect(picker, `${forbidden}`).not.toMatch(forbidden);
    }
  });

  it('lists through the existing store rather than a second one', () => {
    expect(picker).toContain("from '../../lib/assets/assetStore'");
    expect(picker).toContain('listAssets()');
    expect(picker).not.toMatch(/localStorage|indexedDB\.open|saveAsset/);
  });

  it('thumbnails come from the stored preview, so listing opens no blobs', () => {
    // `dataUrl` is the compact downscaled preview the store already keeps.
    expect(picker).toContain('asset.dataUrl');
  });

  it('offers no deletion — removing from a graphic is not deleting a file', () => {
    // Other graphics and People may hold the same reference. Only the Library
    // owns that operation.
    for (const forbidden of [/deleteAsset/, /Delete\b/, /\bdelete\b/i]) {
      expect(picker, `${forbidden}`).not.toMatch(forbidden);
    }
  });

  it('filters by the store’s own taxonomy, not by "it is an image"', () => {
    expect(picker).toContain('accept.includes(asset.type)');
  });

  it('does not call anything "recently used" — the store records no use time', () => {
    expect(picker).not.toMatch(/recently used/i);
    expect(picker).toMatch(/Saved images/);
  });
});

describe('the logo slot writes through the existing atomic helper', () => {
  it('a saved pick and an upload use the same write', () => {
    // `planLogoWrite` is what defines "asset and URL are alternatives". Two
    // paths writing logo state differently is how they end up disagreeing.
    expect(logo).toContain("planLogoWrite({ type: 'asset', assetId })");
    expect(logo).toContain("planLogoWrite({ type: 'asset', assetId: asset.id })");
  });

  it('accepts logo kinds only — a speaker headshot is not a church logo', () => {
    expect(logo).toMatch(/LOGO_ASSET_TYPES[^=]*=\s*\['logo', 'event-logo'\]/);
  });

  it('keeps the URL path intact', () => {
    expect(logo).toContain("planLogoWrite({ type: 'url'");
    expect(logo).toContain("planLogoWrite({ type: 'clear' })");
  });
});

describe('planLogoWrite still guarantees asset and URL cannot both be live', () => {
  it('choosing a saved asset clears any competing URL in one write', () => {
    const patch = planLogoWrite({ type: 'asset', assetId: 'asset-1' });
    expect(patch.logoAssetId).toBe('asset-1');
    expect(patch.logoUrl).toBe('');
  });

  it('a URL clears the asset reference in one write', () => {
    const patch = planLogoWrite({ type: 'url', url: 'https://church.example/logo.png' });
    expect(patch.logoUrl).toBe('https://church.example/logo.png');
    expect(patch.logoAssetId).toBe('');
  });

  it('removing from the graphic clears both references and nothing else', () => {
    const patch = planLogoWrite({ type: 'clear' });
    expect(patch.logoAssetId).toBe('');
    expect(patch.logoUrl).toBe('');
    // It is a values patch. It cannot reach the asset store at all.
    expect(Object.keys(patch).every((key) => key.startsWith('logo'))).toBe(true);
  });

  it('writes only string values, so no blob can enter a graphic', () => {
    for (const patch of [
      planLogoWrite({ type: 'asset', assetId: 'a' }),
      planLogoWrite({ type: 'url', url: 'https://x/y.png' }),
      planLogoWrite({ type: 'clear' })
    ]) {
      for (const value of Object.values(patch)) {
        expect(typeof value).toBe('string');
        expect(value).not.toMatch(/^\s*(data|blob):/i);
      }
    }
  });
});
