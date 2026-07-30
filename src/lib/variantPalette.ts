import { templateFallbackVariant, templateRegistry } from '../components/templates/registry';

const templateById = new Map(templateRegistry.map((t) => [t.id, t]));

/**
 * The five per-graphic colour fields the Design palette edits, each paired with
 * the theme slot that CAN back it. They live in `values` (not `theme`) so a
 * preset or rundown item keeps its own palette.
 *
 * Which of those theme slots a given template actually consults is a renderer
 * question, and it differs per template family — `visualState` owns that chain,
 * and every surface resolves through it.
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
