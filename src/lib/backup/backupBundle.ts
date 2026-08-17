import { unzipSync, zipSync } from 'fflate';
import { listAssets, getAssetBlob, saveAsset } from '../assets/assetStore';
import { listPeople, importPeople } from '../people/peopleStore';
import type { LocalAsset } from '../../types/assets';
import type { PersonProfile } from '../../types/people';

/**
 * A whole LiveLayer setup in one file — the OBS-profile idea, for this app.
 *
 * Asked for in those words: *"the way we are able to save a profile in OBS, and
 * if you lose setup you can quickly use that — can I have something like that,
 * that saves my queues and all that?"*
 *
 * The need is real and specific to how this app stores things. Everything an
 * operator builds — rundowns, the quick queue, saved graphics, People, uploaded
 * logos and headshots, brand colours, which look each screen wears — lives in
 * ONE browser on ONE origin. It survives a refresh and nothing else. A wiped
 * profile, a new laptop, or simply opening the app on the machine's LAN address
 * instead of `127.0.0.1` all present the same empty app, and there was no way
 * to carry the work across.
 *
 * ## Why a zip rather than a JSON file
 *
 * Because of the images. Logos and headshots are binary blobs in IndexedDB, and
 * base64 inside JSON inflates them by a third and has to be decoded a second
 * time on the way back in. A zip keeps them as bytes and compresses the JSON
 * beside them. `fflate` is already a dependency and already packs the release
 * archive, so this adds nothing to install.
 *
 * ## WHAT IS DELIBERATELY LEFT OUT, which matters more than what is in
 *
 * - **The relay address.** Machine-specific, and restoring it is actively
 *   harmful: a backup taken on the graphics machine carries `127.0.0.1:4174`,
 *   and restoring that on a laptop points it at a relay that will never answer
 *   — which makes every Take report FAILED while the overlay works. That exact
 *   failure has already cost this rig a service.
 * - **Program state.** What is on air right now is a property of the running
 *   show, not of a setup. Restoring "live" onto a machine with nothing on air
 *   would make the desk lie about the stream.
 * - **The last realtime message and the working draft.** Both transient — one
 *   is the mirror the output reads on refresh, the other is a half-typed
 *   graphic. Neither is setup.
 *
 * ## What it DOES carry, and the warning that goes with it
 *
 * Everything else, including the ESV and API.Bible keys. That is a deliberate
 * choice rather than an oversight: a restore that leaves the operator
 * re-registering with Crossway is not a restore. But it does mean the file is a
 * secret — it should be kept like one, and the surface that writes it says so.
 */

/** Bumped only when the shape changes in a way a reader must know about. */
export const BACKUP_FORMAT = 1;

/**
 * Keys copied verbatim. Listed rather than globbed, so a NEW key is a decision
 * someone makes here rather than something that silently starts travelling —
 * the relay address below is exactly why that matters.
 */
export const BACKED_UP_KEYS = [
  'livelayer.presets',
  'livelayer.rundowns',
  'livelayer.quickQueue',
  'livelayer.recent',
  'livelayer.brand',
  'livelayer.brandExplicit',
  'livelayer.activePack',
  'livelayer.scriptureOutputs',
  'livelayer.scriptureFavorites',
  'livelayer.scriptureRecents',
  'livelayer.serviceContext',
  'livelayer.dockPrefs',
  'livelayer.obsBridge',
  'livelayer.esvApiKey',
  'livelayer.apiBibleKey',
  'livelayer.apiBibleCatalogue'
] as const;

/**
 * Never copied, and each for its own reason. Named explicitly so the exclusion
 * is a documented decision rather than an omission somebody later "fixes".
 */
export const EXCLUDED_KEYS = {
  'livelayer.relayUrl':
    'Machine-specific. Restoring another machine’s relay address is what makes every Take report failed.',
  'livelayer.program': 'What is on air belongs to the running show, not to a saved setup.',
  'livelayer:lastMessage': 'The transient mirror the output reads on refresh.',
  'livelayer.workingDraft': 'A half-typed graphic, held in sessionStorage.',
  'livelayer.scriptureCache': 'Re-fetchable, and large. Nothing is lost by leaving it.',
  'livelayer.chapterVerseCache': 'Re-fetchable, and large. Nothing is lost by leaving it.'
} as const;

export interface BackupManifest {
  format: number;
  app: 'livelayer';
  createdAt: string;
  origin: string;
  counts: { keys: number; people: number; assets: number };
  /** Loud, because the file carries API keys. */
  notice: string;
}

export interface RestoreSummary {
  keys: number;
  people: number;
  assets: number;
  skipped: string[];
}

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder('utf-8').decode(bytes));

/** Everything this browser holds, as a zip. */
export async function createBackup(now: string): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};

  const stored: Record<string, string> = {};
  for (const key of BACKED_UP_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) stored[key] = value;
    } catch {
      // Storage denied — that key simply does not travel.
    }
  }
  files['local-storage.json'] = encode(stored);

  const people = await listPeople().catch(() => [] as PersonProfile[]);
  files['people.json'] = encode(people);

  const assets = await listAssets().catch(() => [] as LocalAsset[]);
  const carried: LocalAsset[] = [];
  for (const asset of assets) {
    const blob = await getAssetBlob(asset.id).catch(() => null);
    /**
     * Metadata WITHOUT its bytes is worse than nothing: it restores an entry
     * the library lists and no renderer can draw. An asset whose blob cannot be
     * read is left out of both files together.
     */
    if (!blob) continue;
    files[`assets/${asset.id}.bin`] = new Uint8Array(await blob.arrayBuffer());
    carried.push(asset);
  }
  files['assets.json'] = encode(carried);

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    app: 'livelayer',
    createdAt: now,
    origin: typeof window === 'undefined' ? '' : window.location.origin,
    counts: { keys: Object.keys(stored).length, people: people.length, assets: carried.length },
    notice:
      'Contains this browser’s API keys. Keep it as you would a password. It does NOT contain the relay address or what was on air.'
  };
  files['manifest.json'] = encode(manifest);

  return zipSync(files, { level: 9 });
}

/** Read a backup's manifest without restoring anything. */
export function readBackupManifest(bytes: Uint8Array): BackupManifest {
  const files = unzipSync(bytes);
  const raw = files['manifest.json'];
  if (!raw) throw new Error('not-a-livelayer-backup');
  const manifest = decode(raw) as BackupManifest;
  if (manifest.app !== 'livelayer') throw new Error('not-a-livelayer-backup');
  if (typeof manifest.format !== 'number' || manifest.format > BACKUP_FORMAT) {
    // Refusing a newer file is kinder than half-reading it: a partial restore
    // over a working setup is the one outcome nobody can undo.
    throw new Error('backup-too-new');
  }
  return manifest;
}

/**
 * Write a backup back into this browser.
 *
 * ADDITIVE for people and assets, REPLACING for the keys. That asymmetry is
 * deliberate: `importPeople` and `saveAsset` merge by id, so restoring cannot
 * destroy a person added since the backup, while a key like `livelayer.presets`
 * IS the whole list and merging two lists of saved graphics would produce a
 * library nobody curated.
 */
export async function restoreBackup(bytes: Uint8Array): Promise<RestoreSummary> {
  readBackupManifest(bytes);
  const files = unzipSync(bytes);
  const skipped: string[] = [];

  let keys = 0;
  const stored = files['local-storage.json'] ? (decode(files['local-storage.json']) as Record<string, string>) : {};
  for (const [key, value] of Object.entries(stored)) {
    // Only keys this build agreed to carry. A file written by a newer version
    // cannot smuggle in a key — the relay address above being the reason.
    if (!(BACKED_UP_KEYS as readonly string[]).includes(key)) {
      skipped.push(key);
      continue;
    }
    try {
      localStorage.setItem(key, value);
      keys += 1;
    } catch {
      skipped.push(key);
    }
  }

  let people = 0;
  if (files['people.json']) {
    const profiles = decode(files['people.json']) as PersonProfile[];
    if (Array.isArray(profiles) && profiles.length) {
      await importPeople(profiles).catch(() => undefined);
      people = profiles.length;
    }
  }

  let assets = 0;
  if (files['assets.json']) {
    const list = decode(files['assets.json']) as LocalAsset[];
    for (const asset of Array.isArray(list) ? list : []) {
      const bytesForAsset = files[`assets/${asset.id}.bin`];
      if (!bytesForAsset) {
        skipped.push(`asset ${asset.name || asset.id}`);
        continue;
      }
      /* Same ArrayBufferLike narrowing as the writer: a Uint8Array view is not
         a BlobPart until its buffer is known to be a plain ArrayBuffer. */
      const part = bytesForAsset.buffer.slice(
        bytesForAsset.byteOffset,
        bytesForAsset.byteOffset + bytesForAsset.byteLength
      ) as ArrayBuffer;
      const blob = new Blob([part], { type: asset.mimeType || 'application/octet-stream' });
      await saveAsset(asset, blob).catch(() => undefined);
      assets += 1;
    }
  }

  return { keys, people, assets, skipped };
}
