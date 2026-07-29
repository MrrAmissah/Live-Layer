import { templateFallbackVariant, templateRegistry } from '../components/templates/registry';
import type { TemplateTheme } from '../types/graphics';

const templateById = new Map(templateRegistry.map((t) => [t.id, t]));

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * The five per-graphic colour fields the Design palette edits, each paired with
 * the theme slot the RENDERER falls back to when a graphic carries no value for
 * it (`templateColorStyle` → `themeToVars`). They live in `values` (not
 * `theme`) so a preset or rundown item keeps its own palette.
 *
 * `colorSecondary` has no theme slot; the template default is its only fallback.
 */
export const PALETTE_FIELDS = [
  { id: 'colorBrand', themeKey: 'accentColor' },
  { id: 'colorAccent', themeKey: 'accent2Color' },
  { id: 'colorSurface', themeKey: 'surfaceColor' },
  { id: 'colorText', themeKey: 'primaryColor' },
  { id: 'colorSecondary', themeKey: undefined }
] as const;

/** Derived, not re-typed: one list of palette fields, in one order. */
export const PALETTE_FIELD_IDS: ReadonlyArray<(typeof PALETTE_FIELDS)[number]['id']> = PALETTE_FIELDS.map(
  (field) => field.id
);

/** Any theme record: a template's, a graphic's captured one, or the brand default. */
type ThemeLike = Partial<TemplateTheme>;

/**
 * A per-graphic VALUE colour, gated exactly as `templateColorStyle` gates it:
 * six-digit hex or nothing. A three-digit value never reaches `--gfx-*`, so a
 * chip must not display one either.
 */
function colorValue(value: string | undefined, fallback: string): string {
  const next = value?.trim();
  return next && HEX_COLOR.test(next) ? next : fallback;
}

const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;

/**
 * A THEME slot, gated as `themeToVars` gates it — which is to say hardly at all:
 * it copies the string into `--gfx-*`, and CSS resolves `#fff` happily, so a
 * legacy or imported theme carrying shorthand really is what Program paints.
 * Expanded to six digits because that is all `<input type="color">` accepts.
 *
 * A theme colour that is neither three- nor six-digit hex (a named CSS colour,
 * say) still cannot be shown in a colour input, so the chip falls back — the
 * honest limit of a picker, and unreachable through the UI's own writes.
 */
function themeColorValue(value: string | undefined, fallback: string): string {
  const next = value?.trim();
  if (!next) return fallback;
  const short = SHORT_HEX.exec(next);
  // Lowercase, which is what `<input type="color">` emits — so a chip that
  // started at an expanded shorthand doesn't change case the moment it is
  // re-picked. Six-digit values pass through as authored.
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return HEX_COLOR.test(next) ? next : fallback;
}

/**
 * What each palette field currently RESOLVES to for a graphic — the renderer's
 * own chain: the graphic's own value, then the theme slot it falls back to,
 * then the template default.
 *
 * One home on purpose. The Design chips, "Reset palette" and the Graphic
 * overrides panel all read this, so a sparse legacy or imported graphic cannot
 * be described one way by the chip beside it and another by the panel above it
 * — the drift that made both report colours the preview never painted.
 *
 * `theme` is the graphic's OWN theme; the template's is merged underneath here,
 * the same merge `TemplatePreview` performs.
 */
export function resolvePaletteColors(
  templateId: string,
  values: Record<string, string>,
  theme: ThemeLike | undefined
): Record<string, string> {
  const template = templateById.get(templateId);
  const defaults: Record<string, string> = template?.defaultValues ?? {};
  const effectiveTheme: ThemeLike = { ...(template?.theme ?? {}), ...(theme ?? {}) };
  const resolved: Record<string, string> = {};
  for (const { id, themeKey } of PALETTE_FIELDS) {
    resolved[id] = colorValue(
      values[id],
      themeColorValue(themeKey ? effectiveTheme[themeKey] : undefined, defaults[id] ?? '')
    );
  }
  return resolved;
}

/**
 * The variant id that should actually be treated as selected: the requested one
 * when it exists, else the first available variant, else '' when there are
 * none. A persisted graphic can carry a `variantId` that no longer exists in
 * the registry (legacy/imported presets), and graphic validation accepts
 * arbitrary strings — so every selection concern (index, active card,
 * aria-checked, tabindex, paging, browser) must key off this normalized value,
 * not the raw request, or no card ends up selected or tabbable.
 */
export function resolveEffectiveVariantId(
  variants: ReadonlyArray<{ id: string }>,
  requestedId: string
): string {
  if (variants.some((variant) => variant.id === requestedId)) return requestedId;
  return variants[0]?.id ?? '';
}

/**
 * The variant a graphic RENDERS: its own id when it names one, else the fallback
 * its renderer paints. A different question from the carousel's — an unknown
 * legacy id is rendered (and so reported) as itself rather than silently reading
 * as the first card.
 *
 * The fallback comes from `templateFallbackVariant`, which the renderers export,
 * NOT from `defaultValues.variantId`: `performer-lower-third` shares the
 * lower-third renderer, so a performer graphic that stores no variant paints
 * `signature-medallion` while its registry default says `performer-pill`. The
 * registry default is the last resort, for a template with no renderer entry.
 */
export function resolveRenderedVariantId(templateId: string, requestedId: string | undefined): string {
  const stored = requestedId?.trim();
  if (stored) return stored;
  return templateFallbackVariant[templateId] ?? templateById.get(templateId)?.defaultValues.variantId ?? '';
}

function findVariant(templateId: string, variantId: string | undefined) {
  if (!variantId) return undefined;
  return templateById.get(templateId)?.variants?.find((v) => v.id === variantId);
}

/**
 * Apply a design-variant selection to a values object: set `variantId` and
 * merge the variant's signature palette so the colour controls always match the
 * look on screen. A variant with no palette changes only `variantId`, leaving
 * the operator's current colours intact. Pure — returns a new object, mutating
 * nothing — so the store draft path and the rundown-item path share one rule.
 */
export function applyVariantSelection(
  values: Record<string, string>,
  templateId: string,
  variantId: string
): Record<string, string> {
  const variant = findVariant(templateId, variantId);
  return { ...values, variantId, ...(variant?.palette ?? {}) };
}

/**
 * The palette "Reset palette" restores: the selected variant's signature
 * palette when it has one, else the template's own palette defaults. Returns
 * only the palette fields, so callers merge it over current values without
 * disturbing content.
 */
export function resolveResetPalette(templateId: string, variantId: string | undefined): Record<string, string> {
  const template = templateById.get(templateId);
  const variant = findVariant(templateId, variantId);
  if (variant?.palette && Object.keys(variant.palette).length > 0) {
    return { ...variant.palette };
  }
  const defaults = template?.defaultValues ?? {};
  const out: Record<string, string> = {};
  for (const field of PALETTE_FIELD_IDS) {
    if (typeof defaults[field] === 'string') out[field] = defaults[field];
  }
  return out;
}
