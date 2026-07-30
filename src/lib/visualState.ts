import { templateRegistry } from '../components/templates/registry';
import { createDraftValues } from './draftSeed';
import { PALETTE_FIELDS, resolveRenderedVariantId } from './variantPalette';
import { PREMIUM_FALLBACKS, STAGE_FALLBACKS, paletteFamilyFor } from './rendererFallbacks';
import type { ExplicitBrandKey } from './storage';
import type { TemplateTheme } from '../types/graphics';

/**
 * The one place that answers "what does this graphic actually look like?".
 *
 * Every editor surface used to answer it for itself — the Brand swatches, the
 * Design chips, the thumbnails, the overrides panel — and each copy drifted from
 * the renderers in a different way: one gated shorthand hex the renderer accepts,
 * one fell back to the registry default where the stylesheet supplies its own
 * constant, one counted an unresolvable upload as a visible difference. So the
 * resolution lives here, once, and the surfaces read it.
 *
 * Three boundaries, deliberately separate:
 *
 *  1. `resolveGraphicVisualState` — an EXISTING graphic (the ad-hoc draft or a
 *     selected rundown item), described as Preview and Take render it.
 *  2. `resolveSeedVisualState` — what a graphic seeded RIGHT NOW would look
 *     like. Never mixed with (1): a loaded snapshot's captured state and the
 *     next new graphic's state are different questions, and conflating them is
 *     what made brand edits leak between them earlier in this branch.
 *  3. `compareVisualStates` (in `visualOverrides`) — reads two resolved states
 *     and nothing else, so it cannot reimplement any rule above.
 *
 * Pure: no store reads, no hooks, no I/O. Asset resolution is an input.
 */

export type PaletteFieldId = (typeof PALETTE_FIELDS)[number]['id'];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;

const templateById = new Map(templateRegistry.map((template) => [template.id, template]));

/**
 * A per-graphic VALUE colour, gated exactly as `templateColorStyle` gates it:
 * six-digit hex or nothing. A three-digit value never reaches `--gfx-*`, so no
 * surface may display one.
 */
function valueColor(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next && HEX_COLOR.test(next) ? next : undefined;
}

/**
 * A THEME colour, gated as `themeToVars` gates it — which is to say hardly at
 * all: it copies the string into `--gfx-*` and CSS resolves `#fff`. Expanded to
 * six digits (lowercase, as `<input type="color">` emits) because that is all a
 * colour input accepts. A theme colour that is neither three- nor six-digit hex
 * — a named CSS colour — cannot be shown in a picker at all, so it yields
 * nothing and the chain continues.
 */
function themeColor(value: string | undefined): string | undefined {
  const next = value?.trim();
  if (!next) return undefined;
  const short = SHORT_HEX.exec(next);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return HEX_COLOR.test(next) ? next : undefined;
}

export interface LogoState {
  assetId: string;
  url: string;
  /** Which source `resolveLogoSrc` will actually use. */
  source: 'asset' | 'url' | 'none';
  /** A named upload the asset store could not produce. */
  missing: boolean;
  /** The graphic NAMES a logo — true even when it cannot be produced. */
  hasRef: boolean;
}

export interface VisualState {
  templateId: string;
  /** Picker-ready hex per palette field: what this graphic's template paints. */
  palette: Record<PaletteFieldId, string>;
  /** The variant the renderer paints, not the one the carousel would select. */
  variantId: string;
  logo: LogoState;
}

export interface GraphicVisualInput {
  templateId: string;
  values: Record<string, string>;
  /** The graphic's OWN theme. The template's is merged underneath here, exactly
   *  as `TemplatePreview` and `OutputPage` both do before `themeToVars`. */
  theme?: Partial<TemplateTheme>;
  /** `useAsset` status for `values.logoAssetId`. Omit while unknown: a row must
   *  not blink out and back while IndexedDB is read. */
  logoAssetStatus?: string;
}

/**
 * The palette chain, per family — see `rendererFallbacks` for why there are two.
 *
 * Premium templates resolve their plates through `--gfx-template-brand` /
 * `--gfx-template-accent`, which only per-graphic VALUES set, so a graphic with
 * no `colorBrand` paints the stylesheet's constant and its theme's brand is
 * simply not consulted for those slots. Stage templates read `--gfx-brand` /
 * `--gfx-accent-2`, which the theme does set.
 *
 * Surface and text follow the theme in both families, because `themeToVars` and
 * `templateColorStyle` both write `--gfx-template-surface` / `--gfx-template-text`.
 */
function resolvePalette(
  templateId: string,
  values: Record<string, string>,
  theme: Partial<TemplateTheme> | undefined
): Record<PaletteFieldId, string> {
  const template = templateById.get(templateId);
  const registryDefaults: Record<string, string> = template?.defaultValues ?? {};
  // The theme themeToVars actually receives.
  const merged: Partial<TemplateTheme> = { ...(template?.theme ?? {}), ...(theme ?? {}) };
  const premium = paletteFamilyFor(templateId) === 'premium';

  const chain = (field: PaletteFieldId): string => {
    const own = valueColor(values[field]);
    if (own) return own;

    switch (field) {
      case 'colorBrand':
        return (
          (premium ? undefined : themeColor(merged.accentColor)) ??
          (premium ? PREMIUM_FALLBACKS.colorBrand : STAGE_FALLBACKS.colorBrand)
        );
      case 'colorAccent':
        return (
          (premium ? undefined : themeColor(merged.accent2Color)) ??
          (premium ? PREMIUM_FALLBACKS.colorAccent : STAGE_FALLBACKS.colorAccent)
        );
      case 'colorSurface':
        return (
          themeColor(merged.surfaceColor) ??
          themeColor(merged.primaryColor) ??
          (premium ? PREMIUM_FALLBACKS.colorSurface : registryDefaults.colorSurface) ??
          PREMIUM_FALLBACKS.colorSurface
        );
      case 'colorText':
        return (
          themeColor(merged.primaryColor) ??
          (premium ? PREMIUM_FALLBACKS.colorText : registryDefaults.colorText) ??
          PREMIUM_FALLBACKS.colorText
        );
      default:
        // No theme slot exists for the secondary colour in either family.
        return (
          (premium ? PREMIUM_FALLBACKS.colorSecondary : registryDefaults.colorSecondary) ??
          PREMIUM_FALLBACKS.colorSecondary
        );
    }
  };

  const palette = {} as Record<PaletteFieldId, string>;
  for (const { id } of PALETTE_FIELDS) palette[id] = chain(id);
  return palette;
}

/**
 * The logo as the renderers see it: `resolveLogoSrc` prefers a resolved asset,
 * then `logoUrl`. An upload that cannot be produced therefore paints nothing and
 * the URL beneath it takes over — while the graphic still NAMES a logo, which is
 * what the Brand block reports and what export bundles.
 */
function resolveLogo(values: Record<string, string>, assetStatus: string | undefined): LogoState {
  const assetId = values.logoAssetId?.trim() ?? '';
  const url = values.logoUrl?.trim() ?? '';
  const missing = Boolean(assetId) && assetStatus === 'missing';
  const source: LogoState['source'] = assetId && !missing ? 'asset' : url ? 'url' : 'none';
  return { assetId, url, source, missing, hasRef: Boolean(assetId || url) };
}

/** Boundary 1 — an existing graphic, described as Preview and Take render it. */
export function resolveGraphicVisualState(input: GraphicVisualInput): VisualState {
  return {
    templateId: input.templateId,
    palette: resolvePalette(input.templateId, input.values, input.theme),
    variantId: resolveRenderedVariantId(input.templateId, input.values.variantId),
    logo: resolveLogo(input.values, input.logoAssetStatus)
  };
}

export interface SeedVisualInput {
  templateId: string;
  packId: string;
  /** The persisted brand default — the theme a new graphic is given. */
  brandTheme: Partial<TemplateTheme>;
  explicitBrandKeys: Iterable<ExplicitBrandKey>;
}

/**
 * Boundary 2 — what a graphic seeded right now would look like.
 *
 * Built from the same `createDraftValues` the store seeds with, and given the
 * brand default as its theme, because that is exactly what the store hands a
 * newly selected template (`theme: { ...state.brandTheme }`). A seed never has a
 * logo asset: uploads belong to graphics, not to templates.
 */
export function resolveSeedVisualState(input: SeedVisualInput): VisualState {
  const values = createDraftValues(input.templateId, input.packId, input.brandTheme as TemplateTheme, input.explicitBrandKeys);
  return resolveGraphicVisualState({ templateId: input.templateId, values, theme: input.brandTheme });
}

/** Convenience for the surfaces that only need the palette (chips, swatches). */
export function resolvePaletteColors(
  templateId: string,
  values: Record<string, string>,
  theme: Partial<TemplateTheme> | undefined
): Record<PaletteFieldId, string> {
  return resolvePalette(templateId, values, theme);
}
