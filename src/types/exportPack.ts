import type { Rundown } from './rundown';
import type { PersonProfile } from './people';
import type { GraphicInstance } from './graphics';

/** Bump when the pack format changes incompatibly. */
export const LIVELAYER_PACK_VERSION = 1 as const;
/** App data-schema version stamped into packs (for import migration). */
export const LIVELAYER_SCHEMA_VERSION = 1 as const;

export type LiveLayerPackType = 'selected-rundown' | 'full-backup';

export interface LiveLayerPackManifest {
  format: 'livelayer-pack';
  version: typeof LIVELAYER_PACK_VERSION;
  createdAt: string;
  packType: LiveLayerPackType;
  app: {
    name: 'LiveLayer';
    schemaVersion: number;
  };
  summary: LiveLayerPackSummary;
  contents: LiveLayerPackContents;
  warnings?: LiveLayerPackWarning[];
}

export interface LiveLayerPackSummary {
  rundownCount: number;
  itemCount: number;
  peopleCount: number;
  assetCount: number;
  missingAssetCount: number;
  templateIds: string[];
}

export interface LiveLayerPackContents {
  rundowns: Rundown[];
  people: PersonProfile[];
  /** Not exported as standalone library entries (rundown items are snapshots). */
  savedGraphics?: GraphicInstance[];
  assets: LiveLayerAssetManifestEntry[];
}

/**
 * Asset metadata only — the blob (for uploaded assets) lives in the zip at
 * `filename`. URL-source assets carry `url` and have no zip file. No inline image
 * data (no dataUrl) is written to the manifest.
 */
export interface LiveLayerAssetManifestEntry {
  id: string;
  /** Zip path `assets/<id>.<ext>` for uploaded assets; absent for URL assets. */
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  /** User-facing name (the original filename). */
  label?: string;
  /** Asset kind (LocalAsset.type). */
  kind?: string;
  /** For URL-source assets only. */
  url?: string;
}

export interface LiveLayerPackWarning {
  code: 'asset-missing' | 'asset-blob-missing';
  message: string;
  refId?: string;
}
