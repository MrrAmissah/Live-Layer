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
