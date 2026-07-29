import type { Rundown } from '../../types/rundown';
import type { GraphicInstance } from '../../types/graphics';
import type { PersonProfile } from '../../types/people';

/**
 * Pure reference-collection helpers for Rundown.
 *
 * Selected-rundown export uses these to bundle referenced people/assets by id.
 * Import preview uses the template ids for compatibility warnings; future
 * diagnostics can also use them to warn about missing assets before a service.
 *
 * All pure: no I/O, no mutation.
 */

function addAssetId(ids: Set<string>, value: string | undefined): void {
  const id = value?.trim();
  if (id) ids.add(id);
}

/**
 * Every asset id referenced by a single graphic.
 *
 * Known image fields still flow through `assetRefs`, but import already remaps
 * any value key ending in `AssetId`. Export mirrors that generic rule so future
 * template slots (for example `backgroundAssetId`) are bundled automatically.
 */
export function collectGraphicAssetIds(graphic: GraphicInstance): string[] {
  const ids = new Set<string>();
  const values = graphic.values ?? {};
  for (const [key, value] of Object.entries(values)) {
    if (key.endsWith('AssetId')) addAssetId(ids, value);
  }
  addAssetId(ids, graphic.theme?.logoAssetId);
  for (const id of Object.values(graphic.assetRefs ?? {})) {
    addAssetId(ids, id);
  }
  return [...ids];
}

/** The value fields that own an `assetRefs` entry on a stored graphic. */
const ASSET_REF_FIELDS = [
  { valueKey: 'logoAssetId', refKey: 'logo' },
  { valueKey: 'headshotAssetId', refKey: 'headshot' }
] as const;

function isSet(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/** The snapshot metadata a rundown write has to update alongside `values`. */
export type ReconciledGraphicMeta = Pick<GraphicInstance, 'values' | 'assetRefs' | 'theme'>;

/**
 * Keep a stored graphic's asset bookkeeping consistent with its values.
 *
 * `collectGraphicAssetIds` unions `values.*AssetId`, `assetRefs` AND the legacy
 * `theme.logoAssetId`, so a write that only edits `values` leaves the other two
 * pointing at an image the operator believes they removed — and a later export
 * still bundles it into a shared pack. This runs at the rundown write boundary
 * so every editor inherits the invariant, not just the button it was noticed on.
 *
 * `patchKeys` is what the caller INTENDED to write. It distinguishes "remove the
 * logo" from an unrelated edit that merely happens to leave no upload, so a
 * legacy reference is never dropped as a side effect of typing a name.
 *
 * Refs are reconciled per field and only where the value key is present, so
 * unrelated and unknown `assetRefs` entries survive — this patches the object,
 * it never rebuilds it.
 */
export function reconcileGraphicAssets(
  graphic: GraphicInstance,
  nextValues: Record<string, string>,
  patchKeys: readonly string[]
): ReconciledGraphicMeta {
  const refs = { ...(graphic.assetRefs ?? {}) };
  for (const { valueKey, refKey } of ASSET_REF_FIELDS) {
    if (!(valueKey in nextValues)) continue; // absent: not this write's business
    const id = nextValues[valueKey]?.trim();
    if (id) refs[refKey] = id;
    else delete refs[refKey];
  }

  // A logo is superseded when the write explicitly empties the upload, or when
  // it sets a real URL. Clearing an empty URL box is neither, so an existing
  // upload survives it.
  const supersedesLogo =
    (patchKeys.includes('logoAssetId') && !isSet(nextValues.logoAssetId)) ||
    (patchKeys.includes('logoUrl') && isSet(nextValues.logoUrl));

  let theme = graphic.theme;
  if (supersedesLogo && isSet(graphic.theme?.logoAssetId)) {
    // Drop only the legacy pointer; every other theme field is untouched.
    const { logoAssetId: _removed, ...rest } = graphic.theme;
    theme = rest;
  }

  const hadRefs = graphic.assetRefs !== undefined;
  return {
    values: nextValues,
    ...(hadRefs || Object.keys(refs).length > 0 ? { assetRefs: refs } : {}),
    theme
  };
}

/** Every asset id referenced by a rundown's items. */
export function collectRundownAssetIds(rundown: Rundown): string[] {
  const ids = new Set<string>();
  for (const item of rundown.items) {
    for (const id of collectGraphicAssetIds(item.graphic)) ids.add(id);
  }
  return [...ids];
}

/** Every asset id referenced by a set of People (headshots + logos). */
export function collectPeopleAssetIds(people: PersonProfile[]): string[] {
  const ids = new Set<string>();
  for (const person of people) {
    if (person.headshotAssetId) ids.add(person.headshotAssetId);
    if (person.logoAssetId) ids.add(person.logoAssetId);
  }
  return [...ids];
}

/** Every Person id referenced by a rundown (graphic.personId or item source). */
export function collectRundownPersonIds(rundown: Rundown): string[] {
  const ids = new Set<string>();
  for (const item of rundown.items) {
    if (item.graphic.personId) ids.add(item.graphic.personId);
    if (item.source?.type === 'person') ids.add(item.source.personId);
  }
  return [...ids];
}

/** Distinct template ids used by a rundown (for import compatibility checks). */
export function collectRundownTemplateIds(rundown: Rundown): string[] {
  return [...new Set(rundown.items.map((item) => item.graphic.templateId))];
}

/** Approximate localStorage footprint of a rundown, in bytes (JSON length). */
export function estimateRundownStorageSize(rundown: Rundown): number {
  try {
    return JSON.stringify(rundown).length;
  } catch {
    return 0;
  }
}
