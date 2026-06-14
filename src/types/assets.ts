export type AssetType =
  | 'logo'
  | 'speaker-headshot'
  | 'event-logo'
  | 'background'
  | 'generic';

export type AssetSource = 'uploaded' | 'url';

/**
 * A locally stored production image. Bytes for uploaded assets live in
 * IndexedDB (keyed by `blobKey`); this metadata record is small and JSON-safe.
 * `dataUrl` is a compact downscaled preview (used for control-side thumbnails
 * and as the message-portable copy that lets `/output` render without relying on
 * IndexedDB being shared across OBS contexts — see docs/LOCAL_ASSET_SYSTEM.md).
 */
export interface LocalAsset {
  id: string;
  type: AssetType;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
  source: AssetSource;
  blobKey?: string;
  dataUrl?: string;
  url?: string;
  notes?: string;
}

/** Logical image slots a template can fill, resolved to a usable `src`. */
export type AssetSlot = 'logo' | 'headshot';

/** Resolution state for a single asset reference. */
export type AssetStatus = 'idle' | 'loading' | 'ready' | 'missing';
