import type { TemplateDefinition } from '../types/graphics';
import { createDraftValues, NO_EXPLICIT_BRAND, THEME_SEEDED_FIELDS } from './draftSeed';
import { defaultBrandTheme } from './storage';

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
  /** Patch for the persisted global brand. Empty when the default must not move. */
  theme: Partial<BrandTheme>;
  /** Patch for the VISIBLE edit target's values (draft or rundown item). */
  values: Record<string, string>;
}

/**
 * Plan a swatch change. Never touches any field but its own.
 *
 * The target decides whether the global brand default moves with it. The draft
 * is the next new graphic, so its colour IS the new default. A selected rundown
 * item is a captured graphic — recolouring one item in a queue must not
 * silently redefine every graphic made afterwards, so the default is left
 * alone and only the item is written.
 */
export function planBrandColorWrite(
  swatch: BrandSwatch,
  value: string,
  isRundownItem = false
): BrandColorWrite {
  const { themeKey, field } = BRAND_SWATCHES[swatch];
  return {
    theme: isRundownItem ? {} : { [themeKey]: value },
    values: { [field]: value }
  };
}

/**
 * The visible target's side of "reset brand": put the brand-seeded colours back
 * to what this template under this pack seeds with the DEFAULT brand.
 *
 * Without this the reset is a lie — it would restore the global default while
 * leaving the graphic painted in the operator's last brand colour, because the
 * renderers read the per-graphic `values`, not `theme`. Returns only the two
 * fields Brand owns; the rest of the palette belongs to Design's "Reset
 * palette". An unknown template yields nothing rather than a guess.
 */
export function planBrandResetValues(templateId: string, packId: string): Record<string, string> {
  // Template + pack only: "reset" means the colours this template ships under
  // this pack, not whatever brand happens to be selected.
  const seed = createDraftValues(templateId, packId, defaultBrandTheme(), NO_EXPLICIT_BRAND);
  const values: Record<string, string> = {};
  for (const { field } of THEME_SEEDED_FIELDS) {
    if (typeof seed[field] === 'string') values[field] = seed[field];
  }
  return values;
}

/**
 * Writing a logo URL also clears any uploaded asset.
 *
 * `logoAssetId` and `logoUrl` are alternatives, and every renderer prefers a
 * ready asset (`asset.status === 'ready' ? asset.src : logoUrl`). Leaving both
 * set means a typed URL saves but changes nothing on screen — so the rule lives
 * on the write path, where it covers the studio Content tab, the dock Edit step
 * and anything else that edits the field generically.
 *
 * Clearing the URL is NOT a request to delete an upload, so an empty value
 * leaves `logoAssetId` alone.
 */
export function applyLogoUrl(values: Record<string, string>, url: string): Record<string, string> {
  return { ...values, logoUrl: url, ...(url.trim() ? { logoAssetId: '' } : {}) };
}

/**
 * How the Brand logo block should describe the graphic's logo reference.
 *
 * `hasRef` is deliberately presence-based: a graphic that NAMES an image has a
 * logo reference whether or not the image still resolves. Gating on a resolved
 * source made the UI offer "Choose image" over a live `logoAssetId` the
 * operator could neither see nor clear, while export still counted it.
 *
 * `missing` means the graphic really does fall back to the monogram: a named
 * upload the asset store could not produce AND no URL to fall back on. A
 * graphic carrying both — legacy or imported records can — still renders,
 * because `resolveLogoSrc` drops through the unresolved asset to `logoUrl`.
 * Calling that unavailable contradicted the URL preview shown right above the
 * message and invited "Remove image", which would clear the working URL too.
 *
 * `hasUrlFallback` is the same test `resolveLogoSrc` makes, so the two agree by
 * construction rather than by two expressions that have to be kept in step.
 */
export function describeLogoRef(
  logoAssetId: string | undefined,
  logoUrl: string | undefined,
  assetStatus: string
): { hasRef: boolean; missing: boolean } {
  const hasAsset = Boolean(logoAssetId?.trim());
  const hasUrlFallback = Boolean(logoUrl?.trim());
  return {
    hasRef: hasAsset || hasUrlFallback,
    missing: hasAsset && assetStatus === 'missing' && !hasUrlFallback
  };
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
 *
 * The URL case delegates the supersession rule to `applyLogoUrl`, so the Brand
 * tab's URL box and the generic schema field agree: a real URL replaces an
 * upload, and emptying the box is not a request to delete one. Deleting is what
 * `clear` (the Remove button) is for.
 */
export function planLogoWrite(action: LogoAction): Record<string, string> {
  switch (action.type) {
    case 'asset':
      return { logoAssetId: action.assetId, logoUrl: '' };
    case 'url':
      return { logoUrl: action.url, ...(action.url.trim() ? { logoAssetId: '' } : {}) };
    default:
      return { logoAssetId: '', logoUrl: '' };
  }
}
