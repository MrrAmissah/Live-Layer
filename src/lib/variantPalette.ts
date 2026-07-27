import { templateRegistry } from '../components/templates/registry';

const templateById = new Map(templateRegistry.map((t) => [t.id, t]));

/**
 * The five per-graphic colour fields the Design palette edits. They live in
 * `values` (not `theme`) so a preset or rundown item keeps its own palette;
 * `templateColorStyle` maps them to `--gfx-*` for the renderers.
 */
export const PALETTE_FIELD_IDS = ['colorBrand', 'colorAccent', 'colorSurface', 'colorText', 'colorSecondary'] as const;

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
