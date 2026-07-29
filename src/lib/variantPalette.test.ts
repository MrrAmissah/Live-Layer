import { describe, expect, it } from 'vitest';
import { applyVariantSelection, resolveResetPalette, resolvePaletteColors, PALETTE_FIELD_IDS } from './variantPalette';
import { templateRegistry } from '../components/templates/registry';

const preacher = templateRegistry.find((t) => t.id === 'preacher-lower-third')!;
// A variant that carries a signature palette, and (if any) one that does not.
const withPalette = preacher.variants!.find((v) => v.palette && Object.keys(v.palette).length > 0)!;
const withoutPalette = preacher.variants!.find((v) => !v.palette || Object.keys(v.palette).length === 0);

describe('applyVariantSelection — shared draft + rundown rule', () => {
  it('sets variantId and merges the signature palette', () => {
    const out = applyVariantSelection({ name: 'Keep me' }, preacher.id, withPalette.id);
    expect(out.variantId).toBe(withPalette.id);
    for (const [k, v] of Object.entries(withPalette.palette!)) {
      expect(out[k]).toBe(v);
    }
  });

  it('preserves unrelated values through the merge', () => {
    const out = applyVariantSelection(
      { name: 'Rev. Test', title: 'Lead Pastor', subtitle: 'Keep' },
      preacher.id,
      withPalette.id
    );
    expect(out.name).toBe('Rev. Test');
    expect(out.title).toBe('Lead Pastor');
    expect(out.subtitle).toBe('Keep');
  });

  it('does not mutate the input object', () => {
    const input = { name: 'x' };
    const out = applyVariantSelection(input, preacher.id, withPalette.id);
    expect(input).toEqual({ name: 'x' });
    expect(out).not.toBe(input);
  });

  it('a variant with no palette changes only variantId, keeping current colours', () => {
    const target = withoutPalette ?? { id: 'no-such-variant' };
    const current = { colorBrand: '#111111', colorAccent: '#222222', name: 'keep' };
    const out = applyVariantSelection(current, preacher.id, target.id);
    expect(out.variantId).toBe(target.id);
    expect(out.colorBrand).toBe('#111111'); // not erased
    expect(out.colorAccent).toBe('#222222');
    expect(out.name).toBe('keep');
  });
});

describe('resolveResetPalette — Reset palette target', () => {
  it("restores the selected variant's signature palette when it has one", () => {
    const reset = resolveResetPalette(preacher.id, withPalette.id);
    expect(reset).toEqual(withPalette.palette);
  });

  it('falls back to the template palette defaults when the variant has none', () => {
    const reset = resolveResetPalette(preacher.id, withoutPalette?.id);
    // Only palette fields the template actually defaults are returned.
    for (const field of PALETTE_FIELD_IDS) {
      if (typeof preacher.defaultValues[field] === 'string') {
        expect(reset[field]).toBe(preacher.defaultValues[field]);
      }
    }
    expect(Object.keys(reset).every((k) => (PALETTE_FIELD_IDS as readonly string[]).includes(k))).toBe(true);
  });

  it('falls back to template defaults for an unknown variant id', () => {
    const reset = resolveResetPalette(preacher.id, 'variant-that-does-not-exist');
    expect(Object.keys(reset).length).toBeGreaterThan(0);
    expect(Object.keys(reset).every((k) => (PALETTE_FIELD_IDS as readonly string[]).includes(k))).toBe(true);
  });
});

/* --- Theme slots are gated as the renderer gates them -------------------- *
 * `themeToVars` copies a theme colour straight into `--gfx-*`, so CSS resolves
 * shorthand hex and Program really does paint `#fff`. A chip that rejected it
 * showed a colour the graphic was not painted with. Per-graphic VALUES keep the
 * stricter rule, because `templateColorStyle` drops anything but six digits.
 * ------------------------------------------------------------------------ */
describe('resolvePaletteColors — theme shorthand vs value strictness', () => {
  const TEMPLATE_ID = 'preacher-lower-third';
  const template = templateRegistry.find((entry) => entry.id === TEMPLATE_ID)!;

  it('expands a shorthand THEME colour to what the picker can show', () => {
    const resolved = resolvePaletteColors(TEMPLATE_ID, {}, { accentColor: '#fff' });
    expect(resolved.colorBrand).toBe('#ffffff');
  });

  it('expands shorthand in every theme-backed slot', () => {
    const resolved = resolvePaletteColors(
      TEMPLATE_ID,
      {},
      { accentColor: '#abc', accent2Color: '#0F0', surfaceColor: '#123', primaryColor: '#DEF' }
    );
    expect(resolved.colorBrand).toBe('#aabbcc');
    expect(resolved.colorAccent).toBe('#00ff00');
    expect(resolved.colorSurface).toBe('#112233');
    expect(resolved.colorText).toBe('#ddeeff');
  });

  it('ignores a shorthand VALUE, which templateColorStyle would drop too', () => {
    const resolved = resolvePaletteColors(TEMPLATE_ID, { colorBrand: '#fff' }, {});
    expect(resolved.colorBrand).toBe(template.defaultValues.colorBrand);
  });

  it('falls back for a theme colour no colour input can show', () => {
    const resolved = resolvePaletteColors(TEMPLATE_ID, {}, { accentColor: 'rebeccapurple' });
    expect(resolved.colorBrand).toBe(template.defaultValues.colorBrand);
  });

  it('a six-digit value still wins over the theme', () => {
    const resolved = resolvePaletteColors(TEMPLATE_ID, { colorBrand: '#123456' }, { accentColor: '#fff' });
    expect(resolved.colorBrand).toBe('#123456');
  });
});
