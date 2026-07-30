import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TEMPLATE_PALETTE_FIELDS, TEMPLATE_RENDERS_LOGO, paletteFieldsFor, rendersLogo } from './templateCapabilities';
import { PALETTE_FIELD_IDS } from './variantPalette';
import { templateRegistry, templateRendererMap } from '../components/templates/registry';

/**
 * Both capability tables are claims about the renderers and the stylesheet, so
 * both are derived here from those sources rather than restated.
 */
const css = readFileSync('src/styles.css', 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({ selector: match[1], body: match[2] }));

/** Every `--gfx-*` variable that carries a palette field's colour, derived ones included. */
const FIELD_VARS: Record<string, string[]> = {
  colorBrand: [
    '--gfx-template-brand',
    '--gfx-brand',
    '--gfx-brand-deep',
    '--gfx-on-brand',
    '--gfx-premium-brand',
    '--gfx-premium-brand-deep',
    '--gfx-premium-brand-mid',
    '--gfx-premium-brand-wash'
  ],
  colorAccent: ['--gfx-template-accent', '--gfx-accent-2', '--gfx-premium-accent', '--gfx-premium-blue-glow'],
  colorSurface: ['--gfx-template-surface', '--gfx-premium-surface'],
  colorText: ['--gfx-template-text', '--gfx-premium-text', '--gfx-premium-on-dark'],
  colorSecondary: ['--gfx-template-secondary', '--gfx-premium-secondary']
};

/** The root class each renderer emits — the scope its selectors are written against. */
const ROOT_CLASS: Record<string, string> = {
  'preacher-lower-third': 'gfx-l3',
  'performer-lower-third': 'gfx-l3',
  'scripture-card': 'gfx-scripture',
  'announcement-banner': 'gfx-announce',
  'quote-card': 'gfx-quote',
  'event-banner': 'gfx-event',
  'sermon-title': 'gfx-sermon',
  'fullscreen-message': 'gfx-fullmsg'
};

const paletteFieldsInCss = (templateId: string): string[] => {
  const root = `.${ROOT_CLASS[templateId]}`;
  const scoped = rules.filter((rule) => rule.selector.includes(root));
  return PALETTE_FIELD_IDS.filter((field) =>
    scoped.some((rule) => FIELD_VARS[field].some((name) => rule.body.includes(`var(${name}`)))
  );
};

const LOGO_URL = 'https://logo.test/mark.png';

/**
 * Whether ANY of a template's designs draws a logo. Deliberately not per-variant:
 * within a template it is variant-dependent (an announcement ribbon hides the
 * logo its event-style sibling shows), and the capability is used to decide
 * whether a stored logo can EVER be seen on this template. Erring towards
 * "reportable" is the safe direction — a row the operator can dismiss beats a
 * difference the panel hides.
 */
const rendersLogoInMarkup = (templateId: string): boolean => {
  const Renderer = templateRendererMap[templateId];
  const template = templateRegistry.find((entry) => entry.id === templateId)!;
  const variantIds = [template.defaultValues.variantId, ...(template.variants ?? []).map((variant) => variant.id)];
  return variantIds.some((variantId) => {
    const html = renderToStaticMarkup(
      createElement(Renderer, {
        values: { ...template.defaultValues, variantId, logoUrl: LOGO_URL },
        theme: template.theme
      })
    );
    return html.includes(LOGO_URL);
  });
};

describe('palette capability matches the stylesheet', () => {
  for (const template of templateRegistry) {
    it(`${template.id}`, () => {
      expect([...paletteFieldsFor(template.id)].sort()).toEqual(paletteFieldsInCss(template.id).sort());
    });
  }

  it('records the asymmetry the tables exist for', () => {
    // Premium templates paint all five; the two stage templates paint only the
    // brand pair, so their surface/text/secondary values are stored and unseen.
    expect(paletteFieldsFor('preacher-lower-third')).toHaveLength(5);
    expect(paletteFieldsFor('sermon-title')).toEqual(['colorBrand', 'colorAccent']);
    expect(paletteFieldsFor('fullscreen-message')).toEqual(['colorBrand', 'colorAccent']);
  });
});

describe('logo capability matches the rendered markup', () => {
  for (const template of templateRegistry) {
    it(`${template.id}`, () => {
      expect(rendersLogo(template.id)).toBe(rendersLogoInMarkup(template.id));
    });
  }

  it('records the templates a carried logo is invisible on', () => {
    // `setTemplate` carries the logo across a switch, so these three routinely
    // hold one they cannot show.
    expect(rendersLogo('scripture-card')).toBe(false);
    expect(rendersLogo('quote-card')).toBe(false);
    expect(rendersLogo('fullscreen-message')).toBe(false);
  });
});

describe('every registered template is covered', () => {
  it('has both capability entries, so a new template cannot inherit a guess', () => {
    for (const template of templateRegistry) {
      expect(TEMPLATE_PALETTE_FIELDS[template.id], template.id).toBeDefined();
      expect(TEMPLATE_RENDERS_LOGO[template.id], template.id).toBeDefined();
    }
  });

  it('assumes an unknown template renders everything', () => {
    expect(paletteFieldsFor('template-from-a-newer-build')).toEqual(PALETTE_FIELD_IDS);
    expect(rendersLogo('template-from-a-newer-build')).toBe(true);
  });
});
