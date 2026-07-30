import { describe, expect, it } from 'vitest';
import { compareVisualStates, describeOverrideCount, VISUAL_OVERRIDE_FIELDS } from './visualOverrides';
import { resolveGraphicVisualState, resolveSeedVisualState } from './visualState';
import { PREMIUM_FALLBACKS } from './rendererFallbacks';
import { defaultBrandTheme } from './storage';
import { templateRegistry } from '../components/templates/registry';
import type { TemplateTheme } from '../types/graphics';

const TEMPLATE_ID = 'preacher-lower-third';
const template = templateRegistry.find((entry) => entry.id === TEMPLATE_ID)!;
const brandTheme = defaultBrandTheme();

/** What selecting this template right now would produce, under the house pack. */
const seed = resolveSeedVisualState({
  templateId: TEMPLATE_ID,
  packId: 'house',
  brandTheme,
  explicitBrandKeys: []
});

const seedValues: Record<string, string> = { ...template.defaultValues };

const compare = (
  values: Record<string, string>,
  theme: Partial<TemplateTheme> = brandTheme,
  logoAssetStatus?: string
) => compareVisualStates(resolveGraphicVisualState({ templateId: TEMPLATE_ID, values, theme, logoAssetStatus }), seed);

describe('compareVisualStates', () => {
  it('reports nothing for an untouched graphic', () => {
    expect(compare({ ...seedValues })).toEqual([]);
  });

  it('reports a single changed visual field', () => {
    const found = compare({ ...seedValues, colorBrand: '#ff0000' });
    expect(found).toEqual([{ id: 'colorBrand', label: 'Main colour', value: '#ff0000' }]);
  });

  it('reports several changed visual fields', () => {
    const found = compare({
      ...seedValues,
      colorBrand: '#ff0000',
      variantId: 'split-bar',
      logoUrl: 'https://example.test/l.png'
    });
    expect(found.map((entry) => entry.id).sort()).toEqual(['colorBrand', 'logoUrl', 'variantId']);
  });

  it('ignores content fields entirely', () => {
    const found = compare({
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
    expect(compare({ ...seedValues, colorAccent: inUse.toLowerCase() })).toEqual([]);
    expect(compare({ ...seedValues, colorAccent: inUse.toUpperCase() })).toEqual([]);
  });

  it('reports a seeded logo the operator cleared', () => {
    const found = compare({ ...seedValues, logoUrl: '' });
    expect(found).toEqual([{ id: 'logoUrl', label: 'Logo URL', value: '' }]);
  });

  it('counts an upload that resolves, because that is what paints', () => {
    const found = compare({ ...seedValues, logoAssetId: 'asset-1' }, brandTheme, 'ready');
    expect(found).toEqual([{ id: 'logoAssetId', label: 'Uploaded logo', value: 'asset-1' }]);
  });

  it('does not count an unavailable upload that the URL fallback covers', () => {
    expect(compare({ ...seedValues, logoAssetId: 'asset-gone' }, brandTheme, 'missing')).toEqual([]);
  });

  it('still reports an unavailable upload when the URL beneath it differs', () => {
    const found = compare(
      { ...seedValues, logoAssetId: 'asset-gone', logoUrl: 'https://other.test/l.png' },
      brandTheme,
      'missing'
    );
    expect(found).toEqual([{ id: 'logoUrl', label: 'Logo URL', value: 'https://other.test/l.png' }]);
  });

  it('treats a not-yet-resolved upload as present, so no row blinks out and back', () => {
    expect(compare({ ...seedValues, logoAssetId: 'asset-1' }).map((entry) => entry.id)).toEqual(['logoAssetId']);
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

/* --- Sparse graphics are compared as they render ------------------------- *
 * A legacy or imported graphic that carries no palette is NOT the same as a
 * freshly seeded one: on a premium template its plates paint the stylesheet's
 * constants, because --gfx-template-brand is only ever set from values. The
 * comparison has to say so — reporting "nothing changed" there was the defect.
 * ------------------------------------------------------------------------ */
describe('compareVisualStates — sparse premium graphics', () => {
  const sparse = { name: 'Legacy Import', title: 'Guest Speaker', logoUrl: seedValues.logoUrl };

  it('reports the stylesheet constants the plates actually paint', () => {
    // The theme matches the seed's colours exactly, and it still differs: the
    // premium plates never consult the theme for brand or accent.
    const found = compare(sparse, brandTheme);
    const byId = Object.fromEntries(found.map((entry) => [entry.id, entry.value]));
    expect(byId.colorBrand).toBe(PREMIUM_FALLBACKS.colorBrand);
    expect(byId.colorAccent).toBe(PREMIUM_FALLBACKS.colorAccent);
    expect(byId.colorSecondary).toBe(PREMIUM_FALLBACKS.colorSecondary);
  });

  it('never reports an em dash for a colour the graphic renders', () => {
    for (const override of compare(sparse, brandTheme)) {
      if (override.id.startsWith('color')) expect(override.value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('an absent variant is the renderer’s fallback, which the seed also renders', () => {
    expect(compare({ ...seedValues, variantId: '' })).toEqual([]);
  });

  it('reports a legacy variant id that no longer exists, because it is not the seed’s look', () => {
    const found = compare({ ...seedValues, variantId: 'variant-that-was-removed' });
    expect(found).toEqual([{ id: 'variantId', label: 'Design variant', value: 'variant-that-was-removed' }]);
  });

  it('reports the variant a shared renderer paints, not the registry default', () => {
    const performer = templateRegistry.find((entry) => entry.id === 'performer-lower-third')!;
    const performerSeed = resolveSeedVisualState({
      templateId: 'performer-lower-third',
      packId: 'house',
      brandTheme,
      explicitBrandKeys: []
    });
    const found = compareVisualStates(
      resolveGraphicVisualState({
        templateId: 'performer-lower-third',
        values: { name: 'Mass Choir', logoUrl: performer.defaultValues.logoUrl },
        theme: performer.theme
      }),
      performerSeed
    );
    expect(found.filter((entry) => entry.id === 'variantId')).toEqual([
      { id: 'variantId', label: 'Design variant', value: 'signature-medallion' }
    ]);
  });

  it('surface and text still track the theme, so a matching theme is not an override', () => {
    const found = compare(sparse, { ...brandTheme, surfaceColor: seedValues.colorSurface, primaryColor: seedValues.colorText });
    expect(found.map((entry) => entry.id)).not.toContain('colorSurface');
    expect(found.map((entry) => entry.id)).not.toContain('colorText');
  });
});

describe('describeOverrideCount', () => {
  it('reads naturally at zero, one and many', () => {
    expect(describeOverrideCount(0)).toBe('No visual overrides');
    expect(describeOverrideCount(1)).toBe('1 visual override');
    expect(describeOverrideCount(4)).toBe('4 visual overrides');
  });
});

/* --- Only fields the template can actually show --------------------------- *
 * A graphic carries fields its design never renders: `setTemplate` carries the
 * logo across a switch, and every template is seeded all five palette values.
 * Counting those reported differences nobody could see.
 * ------------------------------------------------------------------------ */
describe('compareVisualStates — capability filtering', () => {
  const stateFor = (templateId: string, values: Record<string, string>, theme?: Partial<TemplateTheme>) =>
    resolveGraphicVisualState({ templateId, values, theme });
  const seedFor = (templateId: string) =>
    resolveSeedVisualState({ templateId, packId: 'house', brandTheme, explicitBrandKeys: [] });

  for (const templateId of ['scripture-card', 'quote-card', 'fullscreen-message']) {
    it(`${templateId} never reports a logo it cannot draw`, () => {
      const template = templateRegistry.find((entry) => entry.id === templateId)!;
      const carried = { ...template.defaultValues, logoUrl: 'https://carried.test/l.png', logoAssetId: 'asset-1' };
      const found = compareVisualStates(stateFor(templateId, carried, template.theme), seedFor(templateId));
      expect(found.map((entry) => entry.id)).not.toContain('logoUrl');
      expect(found.map((entry) => entry.id)).not.toContain('logoAssetId');
    });
  }

  it('a lower third still reports its logo, which it does draw', () => {
    const found = compare({ ...seedValues, logoUrl: 'https://carried.test/l.png' });
    expect(found.map((entry) => entry.id)).toContain('logoUrl');
  });

  it('a stage template reports only the palette fields it paints', () => {
    const sermon = templateRegistry.find((entry) => entry.id === 'sermon-title')!;
    const changed = {
      ...sermon.defaultValues,
      colorSecondary: '#ff0000',
      colorSurface: '#ff0000',
      colorText: '#ff0000',
      colorBrand: '#ff0000'
    };
    const found = compareVisualStates(stateFor('sermon-title', changed, sermon.theme), seedFor('sermon-title'));
    expect(found.map((entry) => entry.id)).toEqual(['colorBrand']);
  });

  it('a premium template reports all five, because it paints all five', () => {
    const found = compare({
      ...seedValues,
      colorBrand: '#ff0000',
      colorAccent: '#ff0001',
      colorSurface: '#ff0002',
      colorText: '#ff0003',
      colorSecondary: '#ff0004'
    });
    expect(found.map((entry) => entry.id).sort()).toEqual(
      ['colorAccent', 'colorBrand', 'colorSecondary', 'colorSurface', 'colorText'].sort()
    );
  });
});

/* --- Colours are compared as painted, not as the picker shows them -------- *
 * A theme may store any CSS colour; `themeToVars` passes it through. The picker
 * needs hex, but the comparison must use what is painted.
 * ------------------------------------------------------------------------ */
describe('compareVisualStates — painted colours', () => {
  const sermon = templateRegistry.find((entry) => entry.id === 'sermon-title')!;
  const sermonSeed = resolveSeedVisualState({
    templateId: 'sermon-title',
    packId: 'house',
    brandTheme,
    explicitBrandKeys: []
  });
  const sermonState = (theme: Partial<TemplateTheme>) =>
    resolveGraphicVisualState({ templateId: 'sermon-title', values: { name: 'Legacy sermon' }, theme });

  it('reports a colour a picker cannot express, as the graphic stores it', () => {
    const found = compareVisualStates(sermonState({ ...sermon.theme, accentColor: 'rebeccapurple' }), sermonSeed);
    expect(found.find((entry) => entry.id === 'colorBrand')?.value).toBe('rebeccapurple');
  });

  it('treats two notations for one colour as equal', () => {
    const asName = compareVisualStates(sermonState({ ...sermon.theme, accentColor: 'red' }), sermonSeed);
    const asHex = compareVisualStates(sermonState({ ...sermon.theme, accentColor: '#FF0000' }), sermonSeed);
    const asRgb = compareVisualStates(sermonState({ ...sermon.theme, accentColor: 'rgb(255 0 0)' }), sermonSeed);
    const brandOf = (found: ReturnType<typeof compareVisualStates>) =>
      found.filter((entry) => entry.id === 'colorBrand').length;
    // All three differ from the seed, and none of them is the teal fallback.
    expect([brandOf(asName), brandOf(asHex), brandOf(asRgb)]).toEqual([1, 1, 1]);
  });

  it('does not report an override for a colour only the picker had to approximate', () => {
    // The seed paints the house brand; a theme naming the same colour any other
    // way is not a difference.
    const seedBrand = sermonSeed.painted.colorBrand;
    const found = compareVisualStates(sermonState({ ...sermon.theme, accentColor: seedBrand.toUpperCase() }), sermonSeed);
    expect(found.map((entry) => entry.id)).not.toContain('colorBrand');
  });
});

/* --- One painted logo, one row -------------------------------------------- *
 * `resolveLogoSrc` picks a resolved asset, else the URL. A ready upload shadows
 * whatever URL sits beneath it, so a graphic that paints one image must not be
 * reported as differing in two fields.
 * ------------------------------------------------------------------------ */
describe('compareVisualStates — the logo the renderer selects', () => {
  it('reports the upload only, when a stale URL sits beneath a ready asset', () => {
    const found = compare(
      { ...seedValues, logoAssetId: 'asset-1', logoUrl: 'https://stale.test/old.png' },
      brandTheme,
      'ready'
    );
    expect(found).toEqual([{ id: 'logoAssetId', label: 'Uploaded logo', value: 'asset-1' }]);
  });

  it('reports the URL when the upload beneath it cannot be produced', () => {
    const found = compare(
      { ...seedValues, logoAssetId: 'asset-gone', logoUrl: 'https://other.test/l.png' },
      brandTheme,
      'missing'
    );
    expect(found).toEqual([{ id: 'logoUrl', label: 'Logo URL', value: 'https://other.test/l.png' }]);
  });

  it('names the seed’s field when the target paints no logo at all', () => {
    const found = compare({ ...seedValues, logoUrl: '', logoAssetId: '' });
    expect(found).toEqual([{ id: 'logoUrl', label: 'Logo URL', value: '' }]);
  });

  it('is silent when both paint the same image, however each stores it', () => {
    expect(compare({ ...seedValues, logoAssetId: 'asset-gone' }, brandTheme, 'missing')).toEqual([]);
  });
});

/* --- Alpha is a visible difference --------------------------------------- */
describe('compareVisualStates — translucent colours', () => {
  const sermon = templateRegistry.find((entry) => entry.id === 'sermon-title')!;
  const sermonSeed = resolveSeedVisualState({
    templateId: 'sermon-title',
    packId: 'house',
    brandTheme,
    explicitBrandKeys: []
  });

  it('reports a translucent theme colour against an opaque seed', () => {
    const translucent = resolveGraphicVisualState({
      templateId: 'sermon-title',
      values: { name: 'Legacy sermon' },
      theme: { ...sermon.theme, accentColor: 'rgba(255, 0, 0, 0.5)' }
    });
    const opaque = resolveGraphicVisualState({
      templateId: 'sermon-title',
      values: { name: 'Legacy sermon' },
      theme: { ...sermon.theme, accentColor: '#ff0000' }
    });
    expect(compareVisualStates(translucent, sermonSeed).map((entry) => entry.id)).toContain('colorBrand');
    // ...and the two are not each other: the alpha is the difference.
    expect(compareVisualStates(translucent, opaque).map((entry) => entry.id)).toContain('colorBrand');
  });
});
