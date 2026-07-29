import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { PackSwitchGuardProvider } from '../../hooks/usePackSwitchGuard';
import { createDraftValues } from '../../lib/draftSeed';
import { defaultBrandTheme } from '../../lib/storage';
import { templateRegistry } from '../templates/registry';
import { CLEAR_PROGRAM_STATE } from '../../types/program';
import { getRundown } from '../../lib/rundown/rundownStore';
import {
  addItem,
  clearAllRundowns,
  createRundown,
  setActiveRundown,
  setSelectedItem
} from '../../lib/rundown/rundownStore';
import BrandTab from './BrandTab';
import { BRAND_RESET_TITLE } from './FieldEditor';
import ContentTab from './ContentTab';
import BrandStep from './steps/BrandStep';
import type { GraphicInstance } from '../../types/graphics';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

const HOUSE_SEED = () => createDraftValues('preacher-lower-third', 'house', defaultBrandTheme(), []);

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
  clearAllRundowns();
  useLiveLayerStore.setState({
    currentTemplateId: 'preacher-lower-third',
    draftValues: HOUSE_SEED(),
    theme: defaultBrandTheme(),
    activePackId: 'house',
    presets: [],
    program: { ...CLEAR_PROGRAM_STATE }
  });
});

/**
 * Static markup for a studio-scoped tree; the pack guard is required context.
 *
 * NOTE for anyone extending this file: under `renderToStaticMarkup`, zustand
 * reads resolve to the snapshot taken when the store module was first imported,
 * so calling `useLiveLayerStore.setState` and re-rendering does NOT change what
 * these components see. Vary the AD-HOC DRAFT only through the module's initial
 * seed (House Style, default brand); vary everything else through a selected
 * rundown item, whose state lives in the rundown store and does render live.
 * The draft-side arithmetic is covered directly in `visualOverrides.test.ts`.
 */
const render = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(createElement(PackSwitchGuardProvider, null, element));

const brandTab = () => render(createElement(BrandTab));

function makeGraphic(values: Record<string, string>): GraphicInstance {
  return {
    id: 'graphic-1',
    templateId: 'preacher-lower-third',
    values,
    theme: {},
    layout: {},
    durationSeconds: 6,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  };
}

function selectItem(values: Record<string, string>) {
  const rundown = createRundown('Service')!;
  const item = addItem(rundown.id, { graphic: makeGraphic(values), title: 'Opening slate' })!;
  setActiveRundown(rundown.id);
  setSelectedItem(rundown.id, item.id);
  return { rundownId: rundown.id, itemId: item.id };
}

describe('Brand tab structure', () => {
  it('renders the three ordered sections', () => {
    const html = brandTab();
    expect(html).toContain('Save this graphic');
    expect(html).toContain('Brand and event pack');
    expect(html).toContain('Graphic overrides');
  });

  it('keeps the brand colour and logo controls', () => {
    const html = brandTab();
    expect(html).toContain('brand-grid');
    expect(html).toContain('aria-label="Main colour"');
    expect(html).toContain('brand-logo-upload');
  });

  it('offers exactly one save action and no fabricated save state', () => {
    const html = brandTab();
    expect(html).toContain('Save preset');
    expect(html).not.toContain('Save as new');
    expect(html).not.toContain('All changes saved');
    expect(html).not.toMatch(/Saved \d+ minutes ago/);
  });

  it('names the save target for the ad-hoc draft', () => {
    expect(brandTab()).toContain('Saves the current graphic');
  });

  it('names the save target for a selected rundown item', () => {
    selectItem(HOUSE_SEED());
    const html = brandTab();
    expect(html).toContain('Saves the selected rundown item');
    expect(html).toContain('Colours and logo apply to the selected rundown item only');
    expect(html).toContain('Brand defaults are unchanged');
  });

  it('shows no unbacked pack metadata', () => {
    const html = brandTab();
    expect(html).not.toContain('Typeface');
    expect(html).not.toContain('Manage event pack');
    expect(html).not.toContain('Last updated');
  });
});

describe('Event pack section', () => {
  it('offers the real switcher in draft mode', () => {
    const html = brandTab();
    expect(html).toContain('House Style');
    expect(html).toContain('PPC &#x27;26'); // apostrophe is HTML-escaped in static markup
    expect(html).toContain('pack-seg');
  });

  it('is read-only when a rundown item is selected', () => {
    selectItem(HOUSE_SEED());
    const html = brandTab();
    expect(html).toContain('brand-pack__readonly');
    expect(html).not.toContain('pack-seg');
    expect(html).toContain('does not alter the selected rundown item');
  });
});

describe('Graphic overrides disclosure', () => {
  it('is a collapsed button carrying aria-expanded and aria-controls', () => {
    const html = brandTab();
    expect(html).toMatch(/<button[^>]*class="gfx-overrides__toggle"[^>]*aria-expanded="false"/);
    expect(html).toContain('aria-controls=');
    // A real <button> is what makes Enter/Space work without a key handler.
    expect(html).toMatch(/<button[^>]*class="gfx-overrides__toggle"/);
  });

  it('hides its panel while collapsed', () => {
    expect(brandTab()).toMatch(/class="gfx-overrides__panel"[^>]*hidden/);
  });

  it('reports no overrides for a freshly seeded draft', () => {
    expect(brandTab()).toContain('No visual overrides');
  });

  it('reports no overrides for an item matching the seed', () => {
    selectItem(HOUSE_SEED());
    expect(brandTab()).toContain('No visual overrides');
  });

  it('reports one override', () => {
    selectItem({ ...HOUSE_SEED(), colorAccent: '#00ff00' });
    expect(brandTab()).toContain('1 visual override');
  });

  it('reports several overrides', () => {
    selectItem({
      ...HOUSE_SEED(),
      colorBrand: '#ff0000',
      variantId: 'split-bar',
      logoUrl: 'https://x.test/l.png'
    });
    expect(brandTab()).toContain('3 visual overrides');
  });

  it('does not count content edits', () => {
    selectItem({ ...HOUSE_SEED(), name: 'Someone Else', title: 'Guest', subtitle: 'Elsewhere' });
    expect(brandTab()).toContain('No visual overrides');
  });

  it('ships friendly field names in the collapsed markup', () => {
    selectItem({ ...HOUSE_SEED(), colorAccent: '#00ff00' });
    const html = brandTab();
    // Rendered (hidden) so the labels ship with the collapsed markup.
    expect(html).toContain('Accent colour');
    expect(html).toContain('Compared with House Style');
  });

  it('degrades honestly when the target template is unknown', () => {
    const rundown = createRundown('Service')!;
    const graphic = { ...makeGraphic({ colorBrand: '#ff0000' }), templateId: 'retired-template' };
    const item = addItem(rundown.id, { graphic, title: 'Legacy' })!;
    setActiveRundown(rundown.id);
    setSelectedItem(rundown.id, item.id);
    expect(brandTab()).toContain('Comparison unavailable');
  });

  it('survives a target carrying no values at all', () => {
    selectItem({});
    // Every seeded visual field is absent, which IS a difference — the point is
    // that it renders a real count instead of throwing. Note 'No visual
    // overrides' contains the substring 'visual override', so this must match
    // a number or it cannot fail.
    expect(brandTab()).toMatch(/\d+ visual overrides?/);
  });
});

describe('Dock is unaffected', () => {
  it('mounts the shared brand controls without any studio Brand tab chrome', () => {
    const html = render(createElement(BrandStep));
    expect(html).toContain('brand-grid');
    // The dock keeps its own event-pack switcher inside BrandControls.
    expect(html).toContain('pack-seg');
    expect(html).toContain('Reset to template colours');
    // ...and none of the studio-only sections.
    expect(html).not.toContain('brand-tab__section');
    expect(html).not.toContain('gfx-overrides');
    expect(html).not.toContain('brand-save');
    expect(html).not.toContain('Save preset');
  });

  it('still edits the selected rundown item from the dock', () => {
    selectItem(HOUSE_SEED());
    const html = render(createElement(BrandStep));
    expect(html).toContain('Colours and logo apply to the selected rundown item only');
    expect(html).toContain('Brand defaults are unchanged');
  });
});

/* --- swatch fallbacks for legacy / imported graphics --------------------- *
 * A stored graphic need not carry colour values. The picker must then fall
 * back the way the RENDERER does — the target's own theme over its template's
 * declared theme — not to the hidden ad-hoc draft's theme.
 * ------------------------------------------------------------------------ */

const PREACHER = templateRegistry.find((t) => t.id === 'preacher-lower-third')!;
/** The module-init draft theme these tests must never see reported. */
const DRAFT_THEME = defaultBrandTheme();

function swatches(html: string): { main?: string; accent?: string } {
  const read = (label: string) =>
    new RegExp(`<input[^>]*aria-label="${label}"[^>]*value="([^"]*)"`).exec(html)?.[1] ??
    new RegExp(`<input[^>]*value="([^"]*)"[^>]*aria-label="${label}"`).exec(html)?.[1];
  return { main: read('Main colour'), accent: read('Accent') };
}

function selectItemWithTheme(values: Record<string, string>, theme: GraphicInstance['theme']) {
  const rundown = createRundown('Service')!;
  const item = addItem(rundown.id, {
    graphic: { ...makeGraphic(values), theme },
    title: 'Legacy item'
  })!;
  setActiveRundown(rundown.id);
  setSelectedItem(rundown.id, item.id);
  return { rundownId: rundown.id, itemId: item.id };
}

describe('Brand swatch fallbacks follow the visible target', () => {
  it('uses the item’s own theme when it carries no colour values', () => {
    selectItemWithTheme(
      { name: 'Legacy speaker' },
      { primaryColor: '#ffffff', accentColor: '#654321', backgroundColor: 'transparent', accent2Color: '#123456' }
    );
    const found = swatches(brandTab());
    expect(found.main).toBe('#654321');
    expect(found.accent).toBe('#123456');
    // ...and demonstrably not the hidden draft's theme.
    expect(found.main).not.toBe(DRAFT_THEME.accentColor);
    expect(found.accent).not.toBe(DRAFT_THEME.accent2Color);
  });

  it('ignores an invalid stored colour value and falls back to the item theme', () => {
    selectItemWithTheme(
      { colorBrand: 'not-a-colour', colorAccent: '' },
      { primaryColor: '#ffffff', accentColor: '#654321', backgroundColor: 'transparent', accent2Color: '#123456' }
    );
    const found = swatches(brandTab());
    expect(found.main).toBe('#654321');
    expect(found.accent).toBe('#123456');
  });

  it('falls back to the template’s declared theme when the item has neither', () => {
    // Exactly what TemplatePreview merges, so picker and preview agree.
    selectItemWithTheme({ name: 'Legacy speaker' }, {} as GraphicInstance['theme']);
    const found = swatches(brandTab());
    expect(found.accent).toBe(PREACHER.theme.accent2Color);
    expect(found.accent).not.toBe(DRAFT_THEME.accent2Color);
    // Discriminates the template-theme fallback from the stage default, which
    // the accent alone cannot (GFX_DEFAULT_ACCENT_2 === PREACHER gold).
    expect(found.main).toBe(PREACHER.theme.accentColor);
  });

  it('still prefers the item’s own colour values when it has them', () => {
    selectItemWithTheme(
      { colorBrand: '#abcdef', colorAccent: '#fedcba' },
      { primaryColor: '#ffffff', accentColor: '#654321', backgroundColor: 'transparent', accent2Color: '#123456' }
    );
    const found = swatches(brandTab());
    expect(found.main).toBe('#abcdef');
    expect(found.accent).toBe('#fedcba');
  });

  it('is unchanged in draft mode', () => {
    const found = swatches(brandTab());
    const seed = HOUSE_SEED();
    expect(found.main).toBe(seed.colorBrand);
    expect(found.accent).toBe(seed.colorAccent);
  });
});

/* --- variant thumbnails follow the visible target ------------------------ *
 * The Content tab's variant strip stands in for the graphic on screen, so it
 * must render with that graphic's theme — not the brand default and not the
 * hidden draft's theme.
 * ------------------------------------------------------------------------ */

const MAGENTA = {
  primaryColor: '#ffffff',
  accentColor: '#ff00ff',
  backgroundColor: 'transparent',
  accent2Color: '#ff00ff'
} as const;

/** Stage-level --gfx-brand values of every variant-strip thumbnail. */
function stripBrandVars(html: string): string[] {
  // Scoped by counting thumbs, not by a non-greedy </div></div> terminator —
  // that cut point lands inside the first renderer's own nesting and varies by
  // variant, so it silently inspected a single thumbnail.
  const strip = html.slice(html.indexOf('<div class="variant-strip">'));
  return [...strip.matchAll(/class="gfx-stage" style="[^"]*?--gfx-brand:\s*([^;"]+)/g)].map((m) => m[1].trim());
}

const contentTab = () => render(createElement(ContentTab, { onManageLogo: () => undefined }));

describe('Variant strip renders the visible target’s theme', () => {
  it('uses a selected rundown item’s captured theme, not the hidden draft’s', () => {
    // A legacy item: a distinct theme and no per-value colours at all.
    selectItemWithTheme({ name: 'Legacy speaker' }, MAGENTA);
    const vars = stripBrandVars(contentTab());

    expect(vars.length).toBeGreaterThan(0);
    for (const value of vars) expect(value).toBe('#ff00ff');
    // The hidden draft's theme is the default brand — demonstrably not used.
    expect(vars).not.toContain(defaultBrandTheme().accentColor);
  });

  it('matches what the preview and Take would use for that item', () => {
    const { rundownId, itemId } = selectItemWithTheme({ name: 'Legacy speaker' }, MAGENTA);
    const item = getRundown(rundownId)!.items.find((entry) => entry.id === itemId)!;

    // Preview (useLiveTakeContext) and Take (cloneRundownGraphic) both read the
    // item's own theme, so the strip agreeing with it is the invariant.
    expect(item.graphic.theme.accentColor).toBe('#ff00ff');
    for (const value of stripBrandVars(contentTab())) {
      expect(value).toBe(item.graphic.theme.accentColor);
    }
  });

  it('falls back through the template theme for an item with an empty theme', () => {
    selectItemWithTheme({ name: 'Legacy speaker' }, {} as GraphicInstance['theme']);
    for (const value of stripBrandVars(contentTab())) {
      expect(value).toBe(PREACHER.theme.accentColor);
    }
  });

  it('uses the draft’s own theme in draft mode', () => {
    // No rundown selected: the module-init draft theme is the default brand.
    const vars = stripBrandVars(contentTab());
    expect(vars.length).toBeGreaterThan(0);
    for (const value of vars) expect(value).toBe(defaultBrandTheme().accentColor);
  });

  it('leaves Program unchanged', () => {
    const before = useLiveLayerStore.getState().program;
    selectItemWithTheme({ name: 'Legacy speaker' }, MAGENTA);
    contentTab();
    expect(useLiveLayerStore.getState().program).toBe(before);
  });
});

/* --- a logo reference that cannot be resolved ---------------------------- *
 * An asset id may not resolve (evicted, or imported without its blob). The UI
 * must still admit the reference exists, say so honestly, and let the operator
 * clear it — export counts it either way.
 * ------------------------------------------------------------------------ */
describe('Unresolvable logo reference', () => {
  const MISSING = 'asset-that-cannot-resolve';

  it('reports a logo is set and offers removal, gated on presence not resolution', () => {
    selectItemWithTheme({ name: 'Legacy speaker', logoAssetId: MISSING, logoUrl: '' }, {} as GraphicInstance['theme']);
    const html = brandTab();
    expect(html).toContain('Replace image');
    expect(html).not.toContain('Choose image');
    expect(html).toContain('Remove image');
  });

  it('never fabricates a preview for an image it cannot load', () => {
    // The "unavailable" copy itself needs useAsset's effect, which does not run
    // under renderToStaticMarkup; describeLogoRef covers that decision directly
    // in brandWrites.test.ts, and the browser pass covers the rendered hint.
    selectItemWithTheme({ name: 'Legacy speaker', logoAssetId: MISSING, logoUrl: '' }, {} as GraphicInstance['theme']);
    expect(brandTab()).not.toContain('brand-preview__img');
  });

  it('offers no removal when the graphic genuinely has no logo', () => {
    selectItemWithTheme({ name: 'Legacy speaker', logoAssetId: '', logoUrl: '' }, {} as GraphicInstance['theme']);
    const html = brandTab();
    expect(html).toContain('Choose image');
    expect(html).not.toContain('Remove image');
  });

  it('does not claim unavailability for a plain URL logo', () => {
    selectItemWithTheme({ name: 'Legacy speaker', logoUrl: 'https://x.test/l.png' }, {} as GraphicInstance['theme']);
    const html = brandTab();
    expect(html).toContain('Replace image');
    expect(html).toContain('Remove image');
  });
});

/* --- Reset brand says what it will do, per target ------------------------ *
 * `useBrandReset` restores the persisted default only in draft mode. The tab
 * that shows this button starts on Content and cannot be switched under
 * `renderToStaticMarkup`, so the copy is asserted directly.
 * ------------------------------------------------------------------------ */
describe('Reset brand tooltip follows the target', () => {
  it('promises new graphics only where new graphics are actually affected', () => {
    expect(BRAND_RESET_TITLE.draft).toContain('and for new graphics');
  });

  it('with an item selected, scopes the promise to that item and disclaims the default', () => {
    expect(BRAND_RESET_TITLE.item).toContain('selected rundown item');
    expect(BRAND_RESET_TITLE.item).toContain('unchanged');
    // The contradiction this closes: the item copy must not read as a promise
    // that the brand default was reset too.
    expect(BRAND_RESET_TITLE.item).not.toMatch(/and for new graphics(?!\s*are unchanged)/);
  });
});
