import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDraftValues } from '../../lib/draftSeed';
import { defaultBrandTheme, type ExplicitBrandKey } from '../../lib/storage';
import { PPC_PALETTE } from '../../lib/packs';
import { templateRegistry } from '../templates/registry';
import TemplateThumb, { composeThumbTheme, composeThumbValues } from './TemplateThumb';

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

const PREACHER = templateRegistry.find((t) => t.id === 'preacher-lower-third')!;
const DEFAULT_ACCENT2 = defaultBrandTheme().accent2Color!;
const NONE: ExplicitBrandKey[] = [];

const brandWith = (patch: Partial<ReturnType<typeof defaultBrandTheme>>) => ({
  ...defaultBrandTheme(),
  ...patch
});

/**
 * A thumbnail and a real selection must start from the same values. The
 * component reads its inputs from the store, which a static render cannot vary
 * (zustand resolves to the module-init snapshot under renderToStaticMarkup), so
 * the precedence is asserted against the exported composer and the component is
 * covered by one default-state smoke test below.
 */
describe('composeThumbValues — thumbnail/selection parity', () => {
  it('equals the selection seed when nothing is layered on top', () => {
    const brand = brandWith({ accentColor: '#ff0000', accent2Color: '#00ff00' });
    const keys: ExplicitBrandKey[] = ['accentColor', 'accent2Color'];
    for (const template of templateRegistry) {
      expect(composeThumbValues(template.id, 'house', brand, keys)).toEqual(
        createDraftValues(template.id, 'house', brand, keys)
      );
    }
  });

  it('shows each template’s own palette while no brand colour is chosen', () => {
    for (const template of templateRegistry) {
      const values = composeThumbValues(template.id, 'house', defaultBrandTheme(), NONE);
      expect(values.colorBrand).toBe(template.defaultValues.colorBrand);
      expect(values.colorAccent).toBe(template.defaultValues.colorAccent);
    }
  });

  it('shows an explicitly chosen House Style brand colour', () => {
    const values = composeThumbValues(
      PREACHER.id,
      'house',
      brandWith({ accent2Color: '#00ff00' }),
      ['accent2Color']
    );
    expect(values.colorAccent).toBe('#00ff00');
  });

  it('shows a chosen colour that equals the built-in default', () => {
    // Preacher ships gold; the operator picked the built-in electric blue.
    expect(PREACHER.defaultValues.colorAccent).not.toBe(DEFAULT_ACCENT2);
    const values = composeThumbValues(
      PREACHER.id,
      'house',
      brandWith({ accent2Color: DEFAULT_ACCENT2 }),
      ['accent2Color']
    );
    expect(values.colorAccent).toBe(DEFAULT_ACCENT2);
  });

  it('ignores an unmarked brand colour, exactly as selection does', () => {
    const values = composeThumbValues(PREACHER.id, 'house', brandWith({ accent2Color: '#00ff00' }), NONE);
    expect(values.colorAccent).toBe(PREACHER.defaultValues.colorAccent);
  });

  it('lets the active event pack win over a chosen brand', () => {
    const brand = brandWith({ accentColor: '#ff0000', accent2Color: '#00ff00' });
    const keys: ExplicitBrandKey[] = ['accentColor', 'accent2Color'];
    const values = composeThumbValues(PREACHER.id, 'ppc-2026', brand, keys);
    expect(values.colorBrand).toBe(PPC_PALETTE.colorBrand);
    expect(values.colorAccent).toBe(PPC_PALETTE.colorAccent);
    // ...and the selection seed agrees, so thumbnail and graphic still match.
    expect(values).toEqual(createDraftValues(PREACHER.id, 'ppc-2026', brand, keys));
  });

  it('still lets valuesOverride win, for the Design carousel', () => {
    const values = composeThumbValues(
      PREACHER.id,
      'house',
      brandWith({ accent2Color: '#00ff00' }),
      ['accent2Color'],
      { ...PREACHER.defaultValues, colorAccent: '#abcdef' }
    );
    expect(values.colorAccent).toBe('#abcdef');
  });

  it('lets an explicit variantId win over the seed and the override', () => {
    const values = composeThumbValues(
      PREACHER.id,
      'house',
      defaultBrandTheme(),
      NONE,
      { variantId: 'from-override' },
      'split-bar'
    );
    expect(values.variantId).toBe('split-bar');
  });

  it('keeps the seeded palette when a variant is pinned', () => {
    const values = composeThumbValues(
      PREACHER.id,
      'house',
      brandWith({ accent2Color: '#00ff00' }),
      ['accent2Color'],
      undefined,
      'split-bar'
    );
    expect(values.variantId).toBe('split-bar');
    expect(values.colorAccent).toBe('#00ff00');
  });

});

describe('TemplateThumb renders the composed values', () => {
  it('paints the template’s palette onto the renderer root', () => {
    const html = renderToStaticMarkup(createElement(TemplateThumb, { template: PREACHER }));
    // Renderers redeclare --gfx-* from `values`, so the inline style IS the
    // thumbnail's palette — the merged theme cannot correct it.
    expect(html).toContain(`--gfx-template-brand:${PREACHER.defaultValues.colorBrand}`);
    expect(html).toContain(`--gfx-template-accent:${PREACHER.defaultValues.colorAccent}`);
  });

  it('renders the requested variant', () => {
    const html = renderToStaticMarkup(
      createElement(TemplateThumb, { template: PREACHER, variantId: 'split-bar' })
    );
    expect(html).toContain('data-variant="split-bar"');
  });
});

/* --- thumbnail THEME by context ------------------------------------------ *
 * A library row represents a graphic that does not exist yet, so it wears the
 * brand default. A thumbnail standing in for the visible edit target wears that
 * target's captured theme, or it disagrees with the preview and with Take
 * whenever the target carries no per-value colours.
 * ------------------------------------------------------------------------ */

const MAGENTA_THEME = {
  primaryColor: '#ffffff',
  accentColor: '#ff00ff',
  backgroundColor: 'transparent',
  accent2Color: '#ff00ff'
} as const;

describe('composeThumbTheme — context decides the theme', () => {
  it('uses the brand default for a library thumbnail', () => {
    const brand = brandWith({ accentColor: '#00ff00', accent2Color: '#00ff00' });
    const theme = composeThumbTheme(PREACHER.theme, brand);
    expect(theme.accentColor).toBe('#00ff00');
    expect(theme.accent2Color).toBe('#00ff00');
  });

  it('uses the target’s theme for a current-target thumbnail', () => {
    const theme = composeThumbTheme(PREACHER.theme, MAGENTA_THEME);
    expect(theme.accentColor).toBe('#ff00ff');
    expect(theme.accent2Color).toBe('#ff00ff');
  });

  it('falls back through the template theme for a partial target theme', () => {
    const theme = composeThumbTheme(PREACHER.theme, { accentColor: '#ff00ff' });
    expect(theme.accentColor).toBe('#ff00ff');
    // Untouched slots still resolve from the template.
    expect(theme.accent2Color).toBe(PREACHER.theme.accent2Color);
    expect(theme.primaryColor).toBe(PREACHER.theme.primaryColor);
  });

  it('falls back entirely for an empty target theme', () => {
    expect(composeThumbTheme(PREACHER.theme, {})).toEqual(PREACHER.theme);
  });

  it('never lets an explicit undefined clobber a resolved slot', () => {
    const theme = composeThumbTheme(PREACHER.theme, { accentColor: undefined, accent2Color: '#ff00ff' });
    expect(theme.accentColor).toBe(PREACHER.theme.accentColor);
    expect(theme.accent2Color).toBe('#ff00ff');
  });

  it('survives a template with no declared theme', () => {
    expect(composeThumbTheme(undefined, MAGENTA_THEME).accentColor).toBe('#ff00ff');
  });
});

describe('TemplateThumb theme by context', () => {
  /** The stage-level --gfx-* vars, which is where the merged theme lands. */
  function stageVars(props: Parameters<typeof TemplateThumb>[0]): Record<string, string> {
    const html = renderToStaticMarkup(createElement(TemplateThumb, props));
    const style = /class="gfx-stage" style="([^"]*)"/.exec(html)?.[1] ?? '';
    const found: Record<string, string> = {};
    for (const [, prop, value] of style.matchAll(/(--gfx-[\w-]+):\s*([^;"]+)/g)) found[prop] = value.trim();
    return found;
  }

  it('a library thumbnail (no themeOverride) uses the brand default', () => {
    const vars = stageVars({ template: PREACHER });
    // --gfx-brand is #0d2095 in BOTH the brand default and the template theme,
    // so only the accent discriminates: brand #1284ff vs template #E8B93C.
    expect(defaultBrandTheme().accent2Color).not.toBe(PREACHER.theme.accent2Color);
    expect(vars['--gfx-accent-2']).toBe(defaultBrandTheme().accent2Color);
    expect(vars['--gfx-brand']).toBe(defaultBrandTheme().accentColor);
  });

  it('a current-target thumbnail uses the supplied theme', () => {
    const vars = stageVars({ template: PREACHER, themeOverride: MAGENTA_THEME });
    expect(vars['--gfx-brand']).toBe('#ff00ff');
    expect(vars['--gfx-accent-2']).toBe('#ff00ff');
  });

  it('a legacy target with no colour values renders its captured theme', () => {
    // No colorBrand/colorAccent in valuesOverride: the theme is all there is.
    const vars = stageVars({
      template: PREACHER,
      valuesOverride: { name: 'Legacy speaker' },
      themeOverride: MAGENTA_THEME
    });
    expect(vars['--gfx-brand']).toBe('#ff00ff');
    expect(vars['--gfx-brand']).not.toBe(defaultBrandTheme().accentColor);
  });

  it('a target theme does not leak into library thumbnails', () => {
    const library = stageVars({ template: PREACHER });
    stageVars({ template: PREACHER, themeOverride: MAGENTA_THEME });
    expect(stageVars({ template: PREACHER })).toEqual(library);
  });

  it('per-value colours still win over the target theme', () => {
    // Renderers redeclare --gfx-* from values on their own root.
    const html = renderToStaticMarkup(
      createElement(TemplateThumb, {
        template: PREACHER,
        valuesOverride: { ...PREACHER.defaultValues, colorBrand: '#abcdef' },
        themeOverride: MAGENTA_THEME
      })
    );
    expect(html).toContain('--gfx-template-brand:#abcdef');
  });

  it('keeps variantId precedence with a theme override in play', () => {
    const html = renderToStaticMarkup(
      createElement(TemplateThumb, {
        template: PREACHER,
        variantId: 'split-bar',
        valuesOverride: { variantId: 'from-override' },
        themeOverride: MAGENTA_THEME
      })
    );
    expect(html).toContain('data-variant="split-bar"');
  });
});

describe('composeThumbValues — a target thumbnail is not re-seeded', () => {
  it('renders a sparse target verbatim, exactly as the preview does', () => {
    // A legacy/imported graphic may carry no colour values at all. Filling them
    // from the current brand and pack painted the strip in colours the preview
    // and Take never used.
    const sparse = { name: 'Legacy speaker', title: 'Guest' };
    const brand = brandWith({ accentColor: '#ff0000', accent2Color: '#00ff00' });
    const values = composeThumbValues(PREACHER.id, 'ppc-2026', brand, ['accentColor', 'accent2Color'], sparse);
    expect(values).toEqual(sparse);
    expect(values.colorBrand).toBeUndefined();
    expect(values.colorAccent).toBeUndefined();
  });

  it('still layers an explicit variantId over a sparse target', () => {
    const values = composeThumbValues(
      PREACHER.id, 'house', defaultBrandTheme(), NONE, { name: 'Legacy speaker' }, 'split-bar'
    );
    expect(values).toEqual({ name: 'Legacy speaker', variantId: 'split-bar' });
  });

  it('keeps the library seed when no target values are supplied', () => {
    const brand = brandWith({ accentColor: '#ff0000' });
    expect(composeThumbValues(PREACHER.id, 'house', brand, ['accentColor'])).toEqual(
      createDraftValues(PREACHER.id, 'house', brand, ['accentColor'])
    );
  });

  it('does not let the active pack repaint a target that predates it', () => {
    const sparse = { name: 'Legacy speaker' };
    const underPack = composeThumbValues(PREACHER.id, 'ppc-2026', defaultBrandTheme(), NONE, sparse);
    const underHouse = composeThumbValues(PREACHER.id, 'house', defaultBrandTheme(), NONE, sparse);
    expect(underPack).toEqual(underHouse);
  });
});
