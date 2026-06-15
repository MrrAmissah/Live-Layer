import type { Rundown } from '../../types/rundown';
import type { PersonProfile } from '../../types/people';
import {
  LIVELAYER_PACK_VERSION,
  LIVELAYER_SCHEMA_VERSION,
  type LiveLayerAssetManifestEntry,
  type LiveLayerPackManifest,
  type LiveLayerPackSummary,
  type LiveLayerPackWarning
} from '../../types/exportPack';
import { collectRundownTemplateIds } from '../rundown/rundownReferences';

/**
 * Pure manifest helpers for export packs (IE1). No I/O — the orchestration in
 * `exportRundownPack.ts` loads assets/people and zips; these only shape data.
 */

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

export function getPackAssetExtension(mimeType?: string): string {
  return (mimeType && EXT_BY_MIME[mimeType.toLowerCase()]) || 'bin';
}

/** Zip path for an uploaded asset blob: `assets/<id>.<ext>`. */
export function getPackAssetPath(assetId: string, mimeType?: string): string {
  return `assets/${assetId}.${getPackAssetExtension(mimeType)}`;
}

/** Filesystem-safe slug from a rundown name. */
export function safePackFilename(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'rundown';
}

/** `livelayer-rundown-<safe-name>-<YYYY-MM-DD>.livelayerpack`. */
export function buildPackFilename(rundownName: string, date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `livelayer-rundown-${safePackFilename(rundownName)}-${stamp}.livelayerpack`;
}

export function encodeManifestJson(manifest: LiveLayerPackManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function buildPackSummary(
  rundown: Rundown,
  people: PersonProfile[],
  assetEntries: LiveLayerAssetManifestEntry[],
  missingAssetCount: number
): LiveLayerPackSummary {
  return {
    rundownCount: 1,
    itemCount: rundown.items.length,
    peopleCount: people.length,
    assetCount: assetEntries.length,
    missingAssetCount,
    templateIds: collectRundownTemplateIds(rundown)
  };
}

export interface SelectedRundownManifestInput {
  rundown: Rundown;
  people: PersonProfile[];
  assetEntries: LiveLayerAssetManifestEntry[];
  missingAssetCount: number;
  warnings: LiveLayerPackWarning[];
}

export function createSelectedRundownManifest(input: SelectedRundownManifestInput): LiveLayerPackManifest {
  const { rundown, people, assetEntries, missingAssetCount, warnings } = input;
  return {
    format: 'livelayer-pack',
    version: LIVELAYER_PACK_VERSION,
    createdAt: new Date().toISOString(),
    packType: 'selected-rundown',
    app: { name: 'LiveLayer', schemaVersion: LIVELAYER_SCHEMA_VERSION },
    summary: buildPackSummary(rundown, people, assetEntries, missingAssetCount),
    contents: { rundowns: [rundown], people, assets: assetEntries },
    warnings: warnings.length ? warnings : undefined
  };
}
