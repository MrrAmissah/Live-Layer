import { comparableColor } from './cssColor';
import { paletteFieldsFor, rendersLogo } from './templateCapabilities';
import type { PaletteFieldId, VisualState } from './visualState';

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
 * Compare like with like. Colours reach a resolved state from several sources in
 * several notations — mixed-case registry literals (`#E8B93C`), the lowercase a
 * picker emits, and whatever a legacy theme stores (`red`, `rgb(255 0 0)`) — so
 * they compare through `comparableColor`, which normalizes what it can and keeps
 * the rest as itself. A case-sensitive compare reported a phantom override for
 * picking the very colour already in use.
 */
function normalize(fieldId: string, value: string | undefined): string {
  return fieldId.startsWith('color') ? comparableColor(value) : (value ?? '').trim();
}

/**
 * The comparable form of a resolved state.
 *
 * Colours come from `painted`, not from the picker-ready palette: those differ
 * only where a stored colour cannot be expressed as hex, and there the painted
 * string is the truth.
 *
 * The logo is flattened the way the renderers read it: an upload that cannot be
 * produced paints nothing, so it compares as absent and the URL beneath it is
 * what differs — the same judgement the Brand block makes when it declines to
 * call such a logo unavailable.
 */
function comparable(state: VisualState): Record<string, string> {
  return {
    ...state.painted,
    variantId: state.variantId,
    logoUrl: state.logo.url,
    logoAssetId: state.logo.missing ? '' : state.logo.assetId
  };
}

/**
 * Which fields can be a VISIBLE difference on this template.
 *
 * A graphic carries fields its template never renders — `setTemplate` carries
 * the logo across a switch, and all five palette values are seeded whether or
 * not the design reads them — so an unfiltered comparison reported a "Logo URL"
 * override on a scripture card that has no logo in any of its designs, and a
 * secondary-colour override on templates that never consume it. Capability comes
 * from `templateCapabilities`, which is pinned to the stylesheet and the
 * rendered markup.
 */
function comparedFields(templateId: string): ReadonlyArray<{ id: string; label: string }> {
  const palette = new Set<string>(paletteFieldsFor(templateId) as ReadonlyArray<PaletteFieldId>);
  const logoShown = rendersLogo(templateId);
  return VISUAL_OVERRIDE_FIELDS.filter((field) => {
    if (field.id === 'variantId') return true;
    if (field.id === 'logoUrl' || field.id === 'logoAssetId') return logoShown;
    return palette.has(field.id);
  });
}

/** The allowlisted fields where the target renders differently from its seed. */
export function compareVisualStates(target: VisualState, seed: VisualState): VisualOverride[] {
  const left = comparable(target);
  const right = comparable(seed);
  return comparedFields(target.templateId)
    .filter((field) => normalize(field.id, left[field.id]) !== normalize(field.id, right[field.id]))
    .map((field) => ({ id: field.id, label: field.label, value: (left[field.id] ?? '').trim() }));
}

/** Summary line for the disclosure header. */
export function describeOverrideCount(count: number): string {
  if (count <= 0) return 'No visual overrides';
  return count === 1 ? '1 visual override' : `${count} visual overrides`;
}
