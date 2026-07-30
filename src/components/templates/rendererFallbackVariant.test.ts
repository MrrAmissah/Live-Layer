import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { templateFallbackVariant, templateRegistry, templateRendererMap } from './registry';
import { resolveRenderedVariantId } from '../../lib/variantPalette';

/**
 * The Graphic overrides comparison describes what a graphic renders, so its
 * "no variant stored" answer has to be the variant the renderer really paints.
 * These render each template with NO values at all and read `data-variant` off
 * the markup — the one check that cannot drift from the renderers, because it
 * asks them.
 */
const paintedVariant = (templateId: string): string | undefined => {
  const Renderer = templateRendererMap[templateId];
  const template = templateRegistry.find((entry) => entry.id === templateId)!;
  const html = renderToStaticMarkup(createElement(Renderer, { values: {}, theme: template.theme }));
  return /data-variant="([^"]*)"/.exec(html)?.[1];
};

describe('resolveRenderedVariantId mirrors what each renderer paints', () => {
  for (const template of templateRegistry) {
    it(`${template.id}`, () => {
      expect(resolveRenderedVariantId(template.id, undefined)).toBe(paintedVariant(template.id));
    });
  }

  it('is not the registry default where the two disagree', () => {
    // performer-lower-third shares the lower-third renderer, so a graphic that
    // stores no variant paints the preacher fallback — this is the case the
    // registry default gets wrong, and the reason the map exists.
    expect(templateRegistry.find((t) => t.id === 'performer-lower-third')!.defaultValues.variantId).toBe(
      'performer-pill'
    );
    expect(resolveRenderedVariantId('performer-lower-third', undefined)).toBe('signature-medallion');
  });

  it('every template with a renderer has a fallback entry', () => {
    for (const templateId of Object.keys(templateRendererMap)) {
      expect(templateFallbackVariant[templateId], templateId).toBeTruthy();
    }
  });

  it('templates that share a renderer share its fallback', () => {
    expect(templateFallbackVariant['performer-lower-third']).toBe(templateFallbackVariant['preacher-lower-third']);
  });

  it('a stored id is rendered as itself, even one no longer in the registry', () => {
    expect(resolveRenderedVariantId('preacher-lower-third', 'split-bar')).toBe('split-bar');
    expect(resolveRenderedVariantId('preacher-lower-third', 'variant-that-was-removed')).toBe(
      'variant-that-was-removed'
    );
  });

  it('treats whitespace as storing nothing', () => {
    expect(resolveRenderedVariantId('preacher-lower-third', '   ')).toBe('signature-medallion');
  });
});
