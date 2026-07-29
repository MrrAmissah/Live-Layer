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

/** The allowlisted fields where the target differs from its seed. */
export function findVisualOverrides(
  values: Record<string, string>,
  seed: Record<string, string>
): VisualOverride[] {
  return VISUAL_OVERRIDE_FIELDS.filter(
    (field) => normalize(field.id, values[field.id]) !== normalize(field.id, seed[field.id])
  ).map((field) => ({ id: field.id, label: field.label, value: (values[field.id] ?? '').trim() }));
}

/** Summary line for the disclosure header. */
export function describeOverrideCount(count: number): string {
  if (count <= 0) return 'No visual overrides';
  return count === 1 ? '1 visual override' : `${count} visual overrides`;
}
