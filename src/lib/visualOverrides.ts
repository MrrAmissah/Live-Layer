import { resolvePaletteColors, resolveRenderedVariantId } from './variantPalette';
import type { TemplateTheme } from '../types/graphics';

/**
 * "Graphic overrides" — how the VISIBLE graphic differs from what its template
 * plus the active event pack would produce today.
 *
 * Deliberately restricted to an allowlist of *visual* fields. Speaker names,
 * scripture text, announcement copy and every other content field are what an
 * operator is expected to type on every graphic; counting them would report
 * "12 overrides" on a normal lower third and mean nothing.
 */

export interface VisualOverride {
  id: string;
  label: string;
  /** The target's current value (already a display string). */
  value: string;
}

export const VISUAL_OVERRIDE_FIELDS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'variantId', label: 'Design variant' },
  { id: 'colorBrand', label: 'Main colour' },
  { id: 'colorAccent', label: 'Accent colour' },
  { id: 'colorSurface', label: 'Surface colour' },
  { id: 'colorText', label: 'Text colour' },
  { id: 'colorSecondary', label: 'Secondary colour' },
  { id: 'logoUrl', label: 'Logo URL' },
  { id: 'logoAssetId', label: 'Uploaded logo' }
];

/**
 * Compare like with like. Hex colours reach `values` from three sources with
 * different casing — registry/pack literals are mixed case (`#E8B93C`) while
 * `<input type="color">` always emits lowercase — so a case-sensitive compare
 * would report a phantom override for picking the very colour already in use.
 * Absent and empty are the same thing for the logo fields.
 */
function normalize(fieldId: string, value: string | undefined): string {
  const next = (value ?? '').trim();
  return fieldId.startsWith('color') ? next.toLowerCase() : next;
}

/**
 * One graphic's side of the comparison: what it stores, plus the theme the
 * renderer falls back to for whatever it doesn't.
 */
export interface VisualSide {
  values: Record<string, string>;
  /** The graphic's OWN theme — the target's captured one, or the brand default
   *  a graphic seeded right now would carry. */
  theme?: Partial<TemplateTheme>;
}

/**
 * What this side actually paints, not what it happens to store.
 *
 * A legacy or imported graphic can omit palette and variant fields entirely;
 * the renderer resolves those through the theme and the template, so comparing
 * raw records reported "Main colour —" against a graphic that renders exactly
 * the seed colour. Both sides go through the SAME resolvers the chips and the
 * renderers use, so a reported override is always a visible one — and a
 * difference carried only by the theme is now visible to the comparison
 * instead of invisible to it.
 */
function resolveVisualValues(templateId: string, side: VisualSide): Record<string, string> {
  return {
    ...resolvePaletteColors(templateId, side.values, side.theme),
    variantId: resolveRenderedVariantId(templateId, side.values.variantId),
    // No fallback chain: the renderers read these two straight from `values`.
    logoUrl: side.values.logoUrl ?? '',
    logoAssetId: side.values.logoAssetId ?? ''
  };
}

/** The allowlisted fields where the target renders differently from its seed. */
export function findVisualOverrides(
  templateId: string,
  target: VisualSide,
  seed: VisualSide
): VisualOverride[] {
  const targetValues = resolveVisualValues(templateId, target);
  const seedValues = resolveVisualValues(templateId, seed);
  return VISUAL_OVERRIDE_FIELDS.filter(
    (field) => normalize(field.id, targetValues[field.id]) !== normalize(field.id, seedValues[field.id])
  ).map((field) => ({ id: field.id, label: field.label, value: targetValues[field.id].trim() }));
}

/** Summary line for the disclosure header. */
export function describeOverrideCount(count: number): string {
  if (count <= 0) return 'No visual overrides';
  return count === 1 ? '1 visual override' : `${count} visual overrides`;
}
