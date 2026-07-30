import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PREMIUM_FALLBACKS,
  PREMIUM_SELECTORS,
  STAGE_FALLBACKS,
  TEMPLATE_PALETTE_FAMILY,
  paletteFamilyFor
} from './rendererFallbacks';
import { templateRegistry } from '../components/templates/registry';

/**
 * The table in `rendererFallbacks` is a copy of values CSS cannot export, so it
 * is only trustworthy with a test that reads the stylesheet. Everything here
 * parses `src/styles.css`; nothing restates the table.
 */
const css = readFileSync('src/styles.css', 'utf8');

/** Resolve `var(--gfx-token)` one level, so `var(--gfx-house-blue)` becomes a hex. */
const resolveToken = (value: string): string => {
  const token = /^var\(\s*(--gfx-[a-z0-9-]+)\s*\)$/i.exec(value.trim());
  if (!token) return value.trim();
  const declared = new RegExp(`${token[1]}:\\s*([^;]+);`).exec(css);
  return (declared?.[1] ?? '').trim();
};

const premiumFallbackInCss = (slot: string): string => {
  const declaration = new RegExp(`--gfx-premium-${slot}:\\s*var\\(--gfx-template-${slot},\\s*([^)]*\\)?[^;]*)\\);`).exec(
    css
  );
  return resolveToken((declaration?.[1] ?? '').trim());
};

describe('premium fallbacks match the stylesheet', () => {
  const slots: Array<[keyof typeof PREMIUM_FALLBACKS, string]> = [
    ['colorBrand', 'brand'],
    ['colorAccent', 'accent'],
    ['colorSurface', 'surface'],
    ['colorText', 'text'],
    ['colorSecondary', 'secondary']
  ];

  for (const [field, slot] of slots) {
    it(`${field} falls back to what --gfx-premium-${slot} declares`, () => {
      expect(premiumFallbackInCss(slot).toLowerCase()).toBe(PREMIUM_FALLBACKS[field].toLowerCase());
    });
  }

  it('the premium block still covers exactly the selectors the table names', () => {
    // The rule that declares --gfx-premium-brand; its selector list is what
    // decides which templates are in this family.
    const block = /((?:\.[a-z0-9-]+,\s*)+\.[a-z0-9-]+)\s*\{[^}]*--gfx-premium-brand:/m.exec(css);
    const selectors = (block?.[1] ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .sort();
    expect(selectors).toEqual([...PREMIUM_SELECTORS].sort());
  });

  it('the stage family really is theme-driven — themeToVars sets those vars', () => {
    const themeVars = readFileSync('src/components/graphics/themeVars.ts', 'utf8');
    // The premise for treating sermon/fullmsg as theme-following.
    expect(themeVars).toContain("'--gfx-brand': brand");
    expect(themeVars).toContain("'--gfx-accent-2': accent2");
    // ...and the premise for premium brand/accent NOT following the theme.
    expect(themeVars).not.toContain('--gfx-template-brand');
    expect(themeVars).not.toContain('--gfx-template-accent');
    // Surface and text are shared by both families.
    expect(themeVars).toContain('--gfx-template-surface');
    expect(themeVars).toContain('--gfx-template-text');
  });

  it('stage brand fallbacks are the stage defaults the CSS root declares', () => {
    const rootBrand = /--gfx-brand:\s*([^;]+);/.exec(css)?.[1]?.trim().toLowerCase();
    const rootAccent = /--gfx-accent-2:\s*([^;]+);/.exec(css)?.[1]?.trim().toLowerCase();
    expect(rootBrand).toBe(STAGE_FALLBACKS.colorBrand.toLowerCase());
    expect(rootAccent).toBe(STAGE_FALLBACKS.colorAccent.toLowerCase());
  });
});

describe('every registered template is placed in a family', () => {
  it('has an explicit entry, so a new template cannot inherit a guess silently', () => {
    for (const template of templateRegistry) {
      expect(TEMPLATE_PALETTE_FAMILY[template.id], template.id).toBeDefined();
    }
  });

  it('places each template in the family its renderer root class belongs to', () => {
    // The root class each renderer emits, read from the component source.
    const rootClassFor: Record<string, string> = {
      'preacher-lower-third': 'gfx-l3',
      'performer-lower-third': 'gfx-l3',
      'scripture-card': 'gfx-scripture',
      'announcement-banner': 'gfx-announce',
      'quote-card': 'gfx-quote',
      'event-banner': 'gfx-event',
      'sermon-title': 'gfx-sermon',
      'fullscreen-message': 'gfx-fullmsg'
    };
    for (const template of templateRegistry) {
      const inPremiumBlock = PREMIUM_SELECTORS.includes(
        `.${rootClassFor[template.id]}` as (typeof PREMIUM_SELECTORS)[number]
      );
      expect(paletteFamilyFor(template.id), template.id).toBe(inPremiumBlock ? 'premium' : 'stage');
    }
  });

  it('an unknown template takes the conservative theme-following chain', () => {
    expect(paletteFamilyFor('template-from-a-newer-build')).toBe('stage');
  });
});
