import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveGraphicVisualState, resolveRenderedLogoFallback, resolveSeedVisualState } from './visualState';
import { compareVisualStates } from './visualOverrides';
import { CONVENTION_LOGO_URL, DEFAULT_CHURCH_LOGO_URL } from './brandAssets';
import { defaultBrandTheme } from './storage';
import { templateRegistry, templateRendererMap } from '../components/templates/registry';

/**
 * The claim under test: `resolveRenderedLogoFallback` says what each renderer
 * paints for a graphic that names no logo. Two sources of truth are needed,
 * because the renderers decide it in two different places — JSX for the
 * conditionally drawn images, CSS for the lower third's medallion.
 */
const css = readFileSync('src/styles.css', 'utf8');
const brandTheme = defaultBrandTheme();
const LOWER_THIRD = 'preacher-lower-third';
const preacher = templateRegistry.find((entry) => entry.id === LOWER_THIRD)!;

const variantIdsOf = (templateId: string): string[] => {
  const template = templateRegistry.find((entry) => entry.id === templateId)!;
  return [...new Set([template.defaultValues.variantId, ...(template.variants ?? []).map((v) => v.id)])].filter(
    Boolean
  ) as string[];
};

/** What the markup paints for a graphic naming no logo — the JSX-side truth. */
const paintedImages = (templateId: string, variantId: string): string[] => {
  const Renderer = templateRendererMap[templateId];
  const template = templateRegistry.find((entry) => entry.id === templateId)!;
  const html = renderToStaticMarkup(
    createElement(Renderer, {
      values: { ...template.defaultValues, variantId, logoUrl: '', logoAssetId: '' },
      theme: template.theme
    })
  );
  return [...html.matchAll(/src="([^"]+)"/g)].map((match) => match[1]);
};

/**
 * Whether the stylesheet leaves `.l3-medallion` visible for a variant — the
 * CSS-side truth for the lower third, re-derived here so the list inside
 * `PreacherLowerThird` cannot drift from the cascade. Equal-specificity rules, so
 * the last `display` in source order wins; measured against `getComputedStyle`
 * in a real browser when the list was written.
 */
const medallionVisible = (variantId: string): boolean => {
  let visible = true;
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/\.l3-medallion\s*(,|\{|$)/.test(`${selector.trim()},`)) continue;
    if (!selector.includes('.l3-medallion')) continue;
    const display = /(?:^|;)\s*display:\s*([^;!]+)/.exec(body)?.[1]?.trim();
    if (!display) continue;
    const scoped = /\[data-variant='([^']+)'\]/.exec(selector);
    const excluded = /:not\(\[data-variant='([^']+)'\]\)/.exec(selector);
    const applies = excluded
      ? excluded[1] !== variantId
      : scoped
        ? scoped[1] === variantId
        : true;
    if (applies) visible = display !== 'none';
  }
  return visible;
};

describe('the lower third’s fallback follows its medallion and its strap', () => {
  for (const variantId of variantIdsOf(LOWER_THIRD)) {
    it(`${variantId}`, () => {
      const resolved = resolveRenderedLogoFallback(LOWER_THIRD, variantId);
      if (variantId === 'convention-strap') {
        // The strap image is JSX-conditional and carries its own fallback.
        expect(paintedImages(LOWER_THIRD, variantId)).toContain(CONVENTION_LOGO_URL);
        expect(resolved).toBe(CONVENTION_LOGO_URL);
        return;
      }
      expect(resolved).toBe(medallionVisible(variantId) ? DEFAULT_CHURCH_LOGO_URL : undefined);
    });
  }

  it('the medallion really is hidden for some variants and shown for others', () => {
    // Guards the derivation itself: if this collapses to all-or-nothing, the
    // per-variant assertions above stop discriminating.
    const shown = variantIdsOf(LOWER_THIRD).filter((id) => medallionVisible(id));
    const hidden = variantIdsOf(LOWER_THIRD).filter((id) => !medallionVisible(id));
    expect(shown.length).toBeGreaterThan(3);
    expect(hidden.length).toBeGreaterThan(3);
    expect(shown).toContain('signature-medallion');
    expect(hidden).toContain('bold-plate');
  });
});

describe('every other template’s fallback matches what it draws', () => {
  for (const template of templateRegistry) {
    if (template.id === LOWER_THIRD || template.id === 'performer-lower-third') continue;
    for (const variantId of variantIdsOf(template.id)) {
      it(`${template.id} / ${variantId}`, () => {
        const resolved = resolveRenderedLogoFallback(template.id, variantId);
        const painted = paintedImages(template.id, variantId);
        // These renderers draw their logo conditionally in JSX, so the markup is
        // the whole truth: a fallback exists exactly when an image appears.
        if (resolved) {
          expect(painted).toContain(resolved);
        } else {
          expect(painted.filter((src) => src === CONVENTION_LOGO_URL || src === DEFAULT_CHURCH_LOGO_URL)).toEqual([]);
        }
      });
    }
  }
});

describe('the resolution order is unchanged above the fallback', () => {
  const state = (values: Record<string, string>, logoAssetStatus?: string) =>
    resolveGraphicVisualState({ templateId: LOWER_THIRD, values, theme: preacher.theme, logoAssetStatus });

  it('a ready upload wins over the renderer fallback', () => {
    expect(state({ logoAssetId: 'asset-1', logoUrl: '' }, 'ready').logo).toMatchObject({
      source: 'asset',
      assetId: 'asset-1'
    });
  });

  it('an explicit URL wins over the renderer fallback', () => {
    expect(state({ logoUrl: 'https://own.test/l.png' }).logo).toMatchObject({
      source: 'url',
      painted: 'https://own.test/l.png'
    });
  });

  it('an unavailable upload falls through to the URL, and to the fallback without one', () => {
    expect(state({ logoAssetId: 'gone', logoUrl: 'https://own.test/l.png' }, 'missing').logo).toMatchObject({
      source: 'url',
      painted: 'https://own.test/l.png'
    });
    expect(state({ logoAssetId: 'gone', logoUrl: '' }, 'missing').logo).toMatchObject({
      source: 'fallback',
      painted: DEFAULT_CHURCH_LOGO_URL
    });
  });

  it('a loading upload is still treated as the source, so no row flickers', () => {
    expect(state({ logoAssetId: 'asset-1' }, 'loading').logo).toMatchObject({ source: 'asset' });
  });
});

describe('the seed resolves through the same logo chain', () => {
  const seedOf = (templateId: string) =>
    resolveSeedVisualState({ templateId, packId: 'house', brandTheme, explicitBrandKeys: [] });

  it('a sparse lower third and its fresh seed paint the same logo', () => {
    const sparse = resolveGraphicVisualState({
      templateId: LOWER_THIRD,
      values: { name: 'Legacy Import' },
      theme: preacher.theme
    });
    const seed = seedOf(LOWER_THIRD);
    // The seed names the URL; the sparse graphic reaches it through the renderer.
    expect(seed.logo.painted).toBe(DEFAULT_CHURCH_LOGO_URL);
    expect(sparse.logo.painted).toBe(seed.logo.painted);
    expect(seed.logo.source).toBe('url');
    expect(sparse.logo.source).toBe('fallback');
    // Different stored shapes, one painted image, so no override.
    expect(compareVisualStates(sparse, seed).map((entry) => entry.id)).not.toContain('logoUrl');
  });

  it('a genuinely different logo still reports exactly one row', () => {
    const other = resolveGraphicVisualState({
      templateId: LOWER_THIRD,
      values: { ...preacher.defaultValues, logoUrl: 'https://other.test/mark.png' },
      theme: preacher.theme
    });
    expect(compareVisualStates(other, seedOf(LOWER_THIRD))).toEqual([
      { id: 'logoUrl', label: 'Logo URL', value: 'https://other.test/mark.png' }
    ]);
  });
});
