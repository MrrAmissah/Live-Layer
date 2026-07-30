import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  resolveGraphicVisualState,
  resolvePaletteColors,
  resolveSeedVisualState
} from './visualState';
import { PALETTE_FIELD_IDS } from './variantPalette';
import { PREMIUM_FALLBACKS, STAGE_FALLBACKS, paletteFamilyFor } from './rendererFallbacks';
import { defaultBrandTheme } from './storage';
import { templateRegistry, templateRendererMap } from '../components/templates/registry';

const PREMIUM = 'preacher-lower-third';
const STAGE = 'sermon-title';
const premium = templateRegistry.find((entry) => entry.id === PREMIUM)!;
const stage = templateRegistry.find((entry) => entry.id === STAGE)!;

/** A legacy graphic: content only, no palette, no variant, no logo. */
const sparse = { name: 'Legacy Import', title: 'Guest Speaker' };

describe('premium templates ignore the theme for brand and accent', () => {
  it('falls back to the stylesheet constants, not the registry defaults', () => {
    // The graphic's theme names a brand, but --gfx-template-brand is only ever
    // set from values, so the plates paint the stylesheet's own constant.
    const state = resolveGraphicVisualState({
      templateId: PREMIUM,
      values: sparse,
      theme: { accentColor: '#123456', accent2Color: '#654321' }
    });
    expect(state.palette.colorBrand).toBe(PREMIUM_FALLBACKS.colorBrand);
    expect(state.palette.colorAccent).toBe(PREMIUM_FALLBACKS.colorAccent);
    expect(state.palette.colorBrand).not.toBe('#123456');
    expect(state.palette.colorBrand).not.toBe(premium.defaultValues.colorBrand);
  });

  it('still follows the theme for surface and text, which themeToVars does set', () => {
    const state = resolveGraphicVisualState({
      templateId: PREMIUM,
      values: sparse,
      theme: { surfaceColor: '#101010', primaryColor: '#fafafa' }
    });
    expect(state.palette.colorSurface).toBe('#101010');
    expect(state.palette.colorText).toBe('#fafafa');
  });

  it('uses the graphic surface slot before the text slot, as themeToVars does', () => {
    const withSurface = resolveGraphicVisualState({
      templateId: PREMIUM,
      values: sparse,
      theme: { surfaceColor: '#101010', primaryColor: '#fafafa' }
    });
    expect(withSurface.palette.colorSurface).toBe('#101010');
    // themeToVars: surface = surfaceColor || primaryColor.
    const withoutSurface = resolveGraphicVisualState({
      templateId: PREMIUM,
      values: sparse,
      theme: { primaryColor: '#fafafa', surfaceColor: undefined }
    });
    expect(withoutSurface.palette.colorSurface).toBe('#fafafa');
  });

  it('has no theme slot for the secondary colour in either family', () => {
    const state = resolveGraphicVisualState({ templateId: PREMIUM, values: sparse, theme: {} });
    expect(state.palette.colorSecondary).toBe(PREMIUM_FALLBACKS.colorSecondary);
  });

  it('a per-graphic value wins over every fallback', () => {
    const state = resolveGraphicVisualState({
      templateId: PREMIUM,
      values: { ...sparse, colorBrand: '#abcdef' },
      theme: { accentColor: '#123456' }
    });
    expect(state.palette.colorBrand).toBe('#abcdef');
  });
});

describe('stage templates do follow the theme', () => {
  it('reads brand and accent from the theme, because they read --gfx-brand', () => {
    expect(paletteFamilyFor(STAGE)).toBe('stage');
    const state = resolveGraphicVisualState({
      templateId: STAGE,
      values: sparse,
      theme: { accentColor: '#123456', accent2Color: '#654321' }
    });
    expect(state.palette.colorBrand).toBe('#123456');
    expect(state.palette.colorAccent).toBe('#654321');
  });

  it('falls back to the stage defaults when the theme names nothing', () => {
    const state = resolveGraphicVisualState({ templateId: STAGE, values: sparse, theme: {} });
    // The template's own declared theme is merged underneath, so this is what
    // Preview and Take both paint.
    expect(state.palette.colorBrand).toBe(stage.theme.accentColor);
  });

  it('uses the stage default only when nothing declares a brand at all', () => {
    const state = resolvePaletteColors('template-from-a-newer-build', {}, {});
    expect(state.colorBrand).toBe(STAGE_FALLBACKS.colorBrand);
    expect(state.colorAccent).toBe(STAGE_FALLBACKS.colorAccent);
  });
});

describe('colour formats follow the two consumers exactly', () => {
  it('expands shorthand THEME hex, which themeToVars passes through unvalidated', () => {
    const state = resolveGraphicVisualState({ templateId: STAGE, values: sparse, theme: { accentColor: '#fff' } });
    expect(state.palette.colorBrand).toBe('#ffffff');
  });

  it('ignores a shorthand VALUE, which templateColorStyle would drop', () => {
    const state = resolveGraphicVisualState({
      templateId: STAGE,
      values: { ...sparse, colorBrand: '#fff' },
      theme: { accentColor: '#123456' }
    });
    expect(state.palette.colorBrand).toBe('#123456');
  });

  it('skips a theme colour no colour input can show', () => {
    // The renderer really does paint `rebeccapurple` — themeToVars copies it
    // into --gfx-brand and CSS resolves it. No colour input can express that, so
    // the chain continues rather than displaying a value the picker would then
    // write back as something else. Unreachable through the UI's own writes.
    const state = resolveGraphicVisualState({
      templateId: STAGE,
      values: sparse,
      theme: { accentColor: 'rebeccapurple' }
    });
    expect(state.palette.colorBrand).toBe(STAGE_FALLBACKS.colorBrand);
  });

  it('never yields an empty or malformed colour for any registered template', () => {
    for (const template of templateRegistry) {
      const state = resolveGraphicVisualState({ templateId: template.id, values: {}, theme: {} });
      for (const field of PALETTE_FIELD_IDS) {
        expect(state.palette[field], `${template.id}.${field}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe('logo state describes what resolveLogoSrc will use', () => {
  it('prefers a resolved upload', () => {
    const { logo } = resolveGraphicVisualState({
      templateId: PREMIUM,
      values: { logoAssetId: 'asset-1', logoUrl: 'https://x.test/l.png' },
      logoAssetStatus: 'ready'
    });
    expect(logo).toMatchObject({ source: 'asset', missing: false, hasRef: true });
  });

  it('falls through an unavailable upload to the URL', () => {
    const { logo } = resolveGraphicVisualState({
      templateId: PREMIUM,
      values: { logoAssetId: 'asset-gone', logoUrl: 'https://x.test/l.png' },
      logoAssetStatus: 'missing'
    });
    expect(logo).toMatchObject({ source: 'url', missing: true, hasRef: true });
  });

  it('reports a named upload as a reference even when it cannot be produced', () => {
    const { logo } = resolveGraphicVisualState({
      templateId: PREMIUM,
      values: { logoAssetId: 'asset-gone', logoUrl: '' },
      logoAssetStatus: 'missing'
    });
    expect(logo).toMatchObject({ source: 'none', missing: true, hasRef: true });
  });

  it('treats an unknown status as present, so nothing flickers while IndexedDB is read', () => {
    const { logo } = resolveGraphicVisualState({
      templateId: PREMIUM,
      values: { logoAssetId: 'asset-1' }
    });
    expect(logo).toMatchObject({ source: 'asset', missing: false });
  });

  it('reports no reference when the graphic names no logo', () => {
    const { logo } = resolveGraphicVisualState({ templateId: PREMIUM, values: { logoUrl: '   ' } });
    expect(logo).toMatchObject({ source: 'none', missing: false, hasRef: false });
  });
});

describe('seed state is the next new graphic, never a loaded snapshot', () => {
  it('resolves the coherent palette a fresh graphic carries', () => {
    const seed = resolveSeedVisualState({
      templateId: PREMIUM,
      packId: 'house',
      brandTheme: defaultBrandTheme(),
      explicitBrandKeys: []
    });
    // A seeded graphic has its own values for every palette field, so nothing
    // falls back — this is the coherent state a sparse graphic does not have.
    expect(seed.palette.colorBrand).toBe(premium.defaultValues.colorBrand);
    expect(seed.palette.colorSecondary).toBe(premium.defaultValues.colorSecondary);
    expect(seed.variantId).toBe(premium.defaultValues.variantId);
    expect(seed.logo.assetId).toBe('');
  });

  it('takes the event pack’s palette where the pack states one', () => {
    const house = resolveSeedVisualState({
      templateId: PREMIUM,
      packId: 'house',
      brandTheme: defaultBrandTheme(),
      explicitBrandKeys: []
    });
    const ppc = resolveSeedVisualState({
      templateId: PREMIUM,
      packId: 'ppc-2026',
      brandTheme: defaultBrandTheme(),
      explicitBrandKeys: []
    });
    expect(ppc.palette).not.toEqual(house.palette);
  });

  it('contributes an explicitly chosen brand colour, and only then', () => {
    const brandTheme = { ...defaultBrandTheme(), accentColor: '#abcdef' };
    const unmarked = resolveSeedVisualState({ templateId: PREMIUM, packId: 'house', brandTheme, explicitBrandKeys: [] });
    const marked = resolveSeedVisualState({
      templateId: PREMIUM,
      packId: 'house',
      brandTheme,
      explicitBrandKeys: ['accentColor']
    });
    expect(unmarked.palette.colorBrand).toBe(premium.defaultValues.colorBrand);
    expect(marked.palette.colorBrand).toBe('#abcdef');
  });
});

/* --- Renderer contract --------------------------------------------------- *
 * The resolver's claim is about what the renderers paint, so these read the
 * rendered markup rather than trusting the table: a palette slot the graphic
 * does not carry must be ABSENT from the inline style, which is exactly when the
 * stylesheet's fallback governs and the resolver must report it.
 * ------------------------------------------------------------------------ */
describe('renderer contract — sparse graphics', () => {
  const markupFor = (templateId: string, values: Record<string, string>) => {
    const Renderer = templateRendererMap[templateId];
    const template = templateRegistry.find((entry) => entry.id === templateId)!;
    return renderToStaticMarkup(createElement(Renderer, { values, theme: template.theme }));
  };

  for (const template of templateRegistry) {
    it(`${template.id}: omitted values declare no --gfx-template-* var`, () => {
      const html = markupFor(template.id, sparse);
      expect(html).not.toContain('--gfx-template-brand');
      expect(html).not.toContain('--gfx-template-accent');
      expect(html).not.toContain('--gfx-template-secondary');
    });

    it(`${template.id}: a carried value is declared, and the resolver agrees`, () => {
      const html = markupFor(template.id, { ...sparse, colorBrand: '#abcdef' });
      expect(html).toContain('--gfx-template-brand:#abcdef');
      const state = resolveGraphicVisualState({
        templateId: template.id,
        values: { ...sparse, colorBrand: '#abcdef' },
        theme: template.theme
      });
      expect(state.palette.colorBrand).toBe('#abcdef');
    });

    it(`${template.id}: a shorthand value is declared by neither the renderer nor the resolver`, () => {
      const html = markupFor(template.id, { ...sparse, colorBrand: '#fff' });
      expect(html).not.toContain('--gfx-template-brand');
      const state = resolveGraphicVisualState({
        templateId: template.id,
        values: { ...sparse, colorBrand: '#fff' },
        theme: template.theme
      });
      expect(state.palette.colorBrand).not.toBe('#fff');
    });
  }
});
