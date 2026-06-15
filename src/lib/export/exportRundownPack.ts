import { zipSync, strToU8 } from 'fflate';
import type { Rundown } from '../../types/rundown';
import type { LiveLayerAssetManifestEntry, LiveLayerPackWarning } from '../../types/exportPack';
import { getAsset, getAssetBlob } from '../assets/assetStore';
import { listPeople } from '../people/peopleStore';
import { collectRundownAssetIds, collectRundownPersonIds, collectPeopleAssetIds } from '../rundown/rundownReferences';
import {
  buildPackFilename,
  createSelectedRundownManifest,
  encodeManifestJson,
  getPackAssetPath
} from './exportPackManifest';

export interface ExportResult {
  ok: boolean;
  filename?: string;
  assetCount: number;
  missingAssetCount: number;
  warnings: LiveLayerPackWarning[];
  error?: string;
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export one rundown as a `.livelayerpack` ZIP (IE2). Self-contained: the rundown
 * snapshot + referenced People + referenced asset blobs, ids only (no scripture
 * cache, no API keys, no local paths). Missing asset blobs warn and skip — export
 * never fails wholesale. Reads localStorage + IndexedDB only; touches neither
 * `/output` nor the realtime path.
 */
export async function exportSelectedRundownPack(rundown: Rundown): Promise<ExportResult> {
  try {
    // Snapshot: deep clone, drop the machine-specific live cursor.
    const snapshot: Rundown = { ...clone(rundown), activeItemId: undefined };

    const personIds = collectRundownPersonIds(snapshot);
    const people = personIds.length ? (await listPeople()).filter((person) => personIds.includes(person.id)) : [];

    const assetIds = [...new Set([...collectRundownAssetIds(snapshot), ...collectPeopleAssetIds(people)])];

    const warnings: LiveLayerPackWarning[] = [];
    const assetEntries: LiveLayerAssetManifestEntry[] = [];
    const files: Record<string, Uint8Array> = {};

    for (const id of assetIds) {
      const asset = await getAsset(id);
      if (!asset) {
        warnings.push({ code: 'asset-missing', message: `Asset ${id} was not found; it is not in the pack.`, refId: id });
        continue;
      }
      const entry: LiveLayerAssetManifestEntry = {
        id: asset.id,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        label: asset.name,
        kind: asset.type
      };
      // URL-source assets carry the url; there is no blob to bundle.
      if (asset.source === 'url' && asset.url) {
        assetEntries.push({ ...entry, url: asset.url });
        continue;
      }
      const blob = await getAssetBlob(asset.blobKey ?? asset.id);
      if (!blob) {
        warnings.push({ code: 'asset-blob-missing', message: `Image for “${asset.name}” is missing; it will fall back on import.`, refId: id });
        assetEntries.push(entry); // keep metadata, no file
        continue;
      }
      const filename = getPackAssetPath(asset.id, asset.mimeType);
      files[filename] = new Uint8Array(await blob.arrayBuffer());
      assetEntries.push({ ...entry, filename });
    }

    const missingAssetCount = warnings.length;
    const manifest = createSelectedRundownManifest({ rundown: snapshot, people, assetEntries, missingAssetCount, warnings });
    files['livelayer-pack.json'] = strToU8(encodeManifestJson(manifest));

    const zipped = zipSync(files);
    const filename = buildPackFilename(snapshot.name);
    downloadBlob(new Blob([zipped], { type: 'application/zip' }), filename);

    return { ok: true, filename, assetCount: assetEntries.length, missingAssetCount, warnings };
  } catch (error) {
    return {
      ok: false,
      assetCount: 0,
      missingAssetCount: 0,
      warnings: [],
      error: error instanceof Error ? error.message : 'Export failed'
    };
  }
}

/** Operator-facing message for an export result (shared by the Library + studio panel). */
export function exportResultMessage(result: ExportResult): string {
  if (!result.ok) return `Export failed: ${result.error ?? 'unknown error'}`;
  if (result.missingAssetCount > 0) {
    const n = result.missingAssetCount;
    return `Exported “${result.filename}” with ${n} missing asset${n === 1 ? '' : 's'}. Next: import this pack and confirm those graphics fall back safely.`;
  }
  return `Exported “${result.filename}”. Next: use Library → Import to preview and import it as a new rundown.`;
}
