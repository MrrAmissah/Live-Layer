import type { VisualState } from './visualState';

/**
 * "Graphic overrides" — how the VISIBLE graphic differs from what its template
 * plus the active event pack would produce today.
 *
 * Deliberately restricted to an allowlist of *visual* fields. Speaker names,
 * scripture text, announcement copy and every other content field are what an
 * operator is expected to type on every graphic; counting them would report
 * "12 overrides" on a normal lower third and mean nothing.
 *
 * Boundary 3 of the visual-resolution model: this compares two already-resolved
 * `VisualState`s and knows nothing else. It cannot validate a colour, expand
 * shorthand, walk a theme fallback, pick a variant or ask whether an asset
 * resolved — every one of those lives in `visualState`, so the panel and the
 * controls cannot disagree about the same graphic.
 */

export interface VisualOverride {
  id: string;
  label: string;
  /** The target's effective value, ready to display. */
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
 * Compare like with like. Hex colours reach a resolved state from three sources
 * with different casing — registry/pack literals are mixed case (`#E8B93C`)
 * while `<input type="color">` always emits lowercase — so a case-sensitive
 * compare would report a phantom override for picking the very colour already
 * in use.
 */
function normalize(fieldId: string, value: string | undefined): string {
  const next = (value ?? '').trim();
  return fieldId.startsWith('color') ? next.toLowerCase() : next;
}

/**
 * The comparable form of a resolved state.
 *
 * The logo is flattened the way the renderers read it: an upload that cannot be
 * produced paints nothing, so it compares as absent and the URL beneath it is
 * what differs — the same judgement the Brand block makes when it declines to
 * call such a logo unavailable.
 */
function comparable(state: VisualState): Record<string, string> {
  return {
    ...state.palette,
    variantId: state.variantId,
    logoUrl: state.logo.url,
    logoAssetId: state.logo.missing ? '' : state.logo.assetId
  };
}

/** The allowlisted fields where the target renders differently from its seed. */
export function compareVisualStates(target: VisualState, seed: VisualState): VisualOverride[] {
  const left = comparable(target);
  const right = comparable(seed);
  return VISUAL_OVERRIDE_FIELDS.filter(
    (field) => normalize(field.id, left[field.id]) !== normalize(field.id, right[field.id])
  ).map((field) => ({ id: field.id, label: field.label, value: (left[field.id] ?? '').trim() }));
}

/** Summary line for the disclosure header. */
export function describeOverrideCount(count: number): string {
  if (count <= 0) return 'No visual overrides';
  return count === 1 ? '1 visual override' : `${count} visual overrides`;
}
