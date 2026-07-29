import type { TemplateDefinition } from '../types/graphics';

/**
 * What a Brand control has to write, expressed as data so the branching is
 * unit-tested without rendering — and so both the studio Brand tab and the dock
 * Brand step provably write the same thing.
 */

type BrandTheme = TemplateDefinition['theme'];

export type BrandSwatch = 'main' | 'accent';

/**
 * A brand swatch drives two things that must stay in step:
 *  - the global brand default (`theme`), which seeds future graphics, and
 *  - the visible graphic's own colour field (`values`), which is what the
 *    renderers actually paint (`templateColorStyle` re-declares `--gfx-*` on
 *    the renderer root, so a theme-only write is invisible).
 */
export const BRAND_SWATCHES: Record<BrandSwatch, { themeKey: keyof BrandTheme; field: string; label: string }> = {
  main: { themeKey: 'accentColor', field: 'colorBrand', label: 'Main colour' },
  accent: { themeKey: 'accent2Color', field: 'colorAccent', label: 'Accent' }
};

export interface BrandColorWrite {
  /** Patch for the persisted global brand. */
  theme: Partial<BrandTheme>;
  /** Patch for the VISIBLE edit target's values (draft or rundown item). */
  values: Record<string, string>;
}

/** Plan a swatch change. Never touches any field but its own. */
export function planBrandColorWrite(swatch: BrandSwatch, value: string): BrandColorWrite {
  const { themeKey, field } = BRAND_SWATCHES[swatch];
  return { theme: { [themeKey]: value }, values: { [field]: value } };
}

export type LogoAction =
  | { type: 'asset'; assetId: string }
  | { type: 'url'; url: string }
  | { type: 'clear' };

/**
 * Plan a logo change as ONE patch. `logoAssetId` and `logoUrl` are alternatives
 * — an upload must clear any URL and vice versa — so writing them as two
 * sequential field updates leaves an intermediate state where both are live.
 * Callers pass this straight to a single `setFields`.
 */
export function planLogoWrite(action: LogoAction): Record<string, string> {
  switch (action.type) {
    case 'asset':
      return { logoAssetId: action.assetId, logoUrl: '' };
    case 'url':
      return { logoUrl: action.url, logoAssetId: '' };
    default:
      return { logoAssetId: '', logoUrl: '' };
  }
}
