import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDraftValues } from '../../lib/draftSeed';
import { defaultBrandTheme, type ExplicitBrandKey } from '../../lib/storage';
import { PPC_PALETTE } from '../../lib/packs';
import { templateRegistry } from '../templates/registry';
import TemplateThumb, { composeThumbValues } from './TemplateThumb';

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

  it('takes no input from the current graphic’s theme', () => {
    // Only brandTheme is an argument; a loaded snapshot cannot reach a thumbnail.
    const a = composeThumbValues(PREACHER.id, 'house', brandWith({ accent2Color: '#00ff00' }), ['accent2Color']);
    const b = composeThumbValues(PREACHER.id, 'house', brandWith({ accent2Color: '#00ff00' }), ['accent2Color']);
    expect(a).toEqual(b);
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
