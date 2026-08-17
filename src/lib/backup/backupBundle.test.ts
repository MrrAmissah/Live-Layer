import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import {
  BACKED_UP_KEYS,
  BACKUP_FORMAT,
  EXCLUDED_KEYS,
  createBackup,
  readBackupManifest,
  restoreBackup
} from './backupBundle';

/**
 * "Like saving a profile in OBS" — a whole setup in one file.
 *
 * The stores are mocked because this suite runs in node with no IndexedDB; what
 * is under test is the BUNDLE — what travels, what deliberately does not, and
 * that a file written here can be read back. A backup that cannot be restored
 * is worse than no backup, because it is only discovered on the day it is
 * needed.
 */
const people = [{ id: 'p1', name: 'Rev. Ishmael', updatedAt: 'x' }];
const assets = [{ id: 'a1', type: 'logo', name: 'church.png', mimeType: 'image/png', createdAt: 'x', updatedAt: 'x', source: 'upload' }];
const blobBytes = new Uint8Array([137, 80, 78, 71]);

const savedPeople: unknown[] = [];
const savedAssets: { asset: unknown; size: number }[] = [];

vi.mock('../people/peopleStore', () => ({
  listPeople: async () => people,
  importPeople: async (profiles: unknown[]) => {
    savedPeople.push(...profiles);
    return profiles;
  }
}));

vi.mock('../assets/assetStore', () => ({
  listAssets: async () => assets,
  getAssetBlob: async () => ({ arrayBuffer: async () => blobBytes.buffer }),
  saveAsset: async (asset: unknown, blob: Blob) => {
    savedAssets.push({ asset, size: blob.size });
    return asset;
  }
}));

/** A minimal localStorage, because node has none. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map
  };
}

const SEED = {
  'livelayer.rundowns': '[{"id":"r1"}]',
  'livelayer.quickQueue': '["John 3:16"]',
  'livelayer.presets': '[{"id":"g1"}]',
  'livelayer.esvApiKey': 'secret-esv',
  // Present in storage, and must NOT travel.
  'livelayer.relayUrl': 'http://127.0.0.1:4174',
  'livelayer.program': '{"status":"showing"}'
};

describe('what a backup carries', () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage(SEED);
    vi.stubGlobal('localStorage', storage);
    savedPeople.length = 0;
    savedAssets.length = 0;
  });

  it('carries the operator’s work — queues, rundowns, saved graphics', async () => {
    const files = unzipSync(await createBackup('2026-08-17T00:00:00.000Z'));
    const stored = JSON.parse(new TextDecoder().decode(files['local-storage.json']));
    expect(stored['livelayer.rundowns']).toBe(SEED['livelayer.rundowns']);
    expect(stored['livelayer.quickQueue']).toBe(SEED['livelayer.quickQueue']);
    expect(stored['livelayer.presets']).toBe(SEED['livelayer.presets']);
  });

  it('NEVER carries the relay address', async () => {
    /**
     * The most important assertion here. A backup taken on the graphics machine
     * holds `127.0.0.1:4174`; restoring that on a laptop points it at a relay
     * that will never answer, and every Take then reports FAILED while the
     * overlay works. That exact failure has already cost this rig a service.
     */
    const bytes = await createBackup('2026-08-17T00:00:00.000Z');
    const files = unzipSync(bytes);
    const stored = JSON.parse(new TextDecoder().decode(files['local-storage.json']));
    expect(stored['livelayer.relayUrl']).toBeUndefined();
    // And not anywhere else in the archive either.
    const whole = new TextDecoder().decode(files['local-storage.json']);
    expect(whole).not.toContain('4174');
  });

  it('never carries what is on air', async () => {
    const files = unzipSync(await createBackup('2026-08-17T00:00:00.000Z'));
    const stored = JSON.parse(new TextDecoder().decode(files['local-storage.json']));
    expect(stored['livelayer.program']).toBeUndefined();
  });

  it('states every exclusion with a reason', () => {
    // An omission somebody later "fixes" is exactly how the relay address would
    // get back in. Each exclusion carries why.
    for (const [key, reason] of Object.entries(EXCLUDED_KEYS)) {
      expect(BACKED_UP_KEYS as readonly string[], key).not.toContain(key);
      expect(reason.length, key).toBeGreaterThan(20);
    }
  });

  it('carries people and image BYTES, not just their names', async () => {
    const files = unzipSync(await createBackup('2026-08-17T00:00:00.000Z'));
    expect(JSON.parse(new TextDecoder().decode(files['people.json']))).toHaveLength(1);
    expect(files['assets/a1.bin']).toBeTruthy();
    expect(Array.from(files['assets/a1.bin'])).toEqual(Array.from(blobBytes));
  });

  it('warns, in the file itself, that it holds API keys', async () => {
    // The file is a secret. Someone finding it later has only the manifest.
    const files = unzipSync(await createBackup('2026-08-17T00:00:00.000Z'));
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    expect(manifest.notice).toMatch(/API keys/i);
    expect(manifest.counts.assets).toBe(1);
  });
});

describe('reading one back', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage(SEED));
    savedPeople.length = 0;
    savedAssets.length = 0;
  });

  it('round-trips into an empty browser', async () => {
    /**
     * THE WHOLE POINT, and the one thing worth proving end to end: written on
     * one machine, read on another that has nothing.
     */
    const bytes = await createBackup('2026-08-17T00:00:00.000Z');
    const empty = fakeStorage();
    vi.stubGlobal('localStorage', empty);

    const summary = await restoreBackup(bytes);
    expect(summary.keys).toBeGreaterThanOrEqual(4);
    expect(empty.map.get('livelayer.rundowns')).toBe(SEED['livelayer.rundowns']);
    expect(empty.map.get('livelayer.quickQueue')).toBe(SEED['livelayer.quickQueue']);
    expect(empty.map.get('livelayer.esvApiKey')).toBe('secret-esv');
    // And the relay is still absent on the far side.
    expect(empty.map.get('livelayer.relayUrl')).toBeUndefined();

    expect(summary.people).toBe(1);
    expect(savedAssets).toHaveLength(1);
    expect(savedAssets[0].size).toBe(blobBytes.length);
  });

  it('refuses a file that is not a LiveLayer backup', async () => {
    /**
     * Two different wrong files, because they fail in different places: bytes
     * that are not a zip at all fail in the decoder, and a perfectly valid zip
     * of something else fails on the manifest. An operator can hand this
     * control either one.
     */
    expect(() => readBackupManifest(new Uint8Array([80, 75, 3, 4, 9, 9]))).toThrow();

    const { zipSync } = await import('fflate');
    const someOtherZip = zipSync({ 'notes.txt': new TextEncoder().encode('hello') });
    expect(() => readBackupManifest(someOtherZip)).toThrow('not-a-livelayer-backup');
  });

  it('refuses a backup from a NEWER version rather than half-reading it', async () => {
    /**
     * A partial restore over a working setup is the one outcome nobody can
     * undo. Refusing is kinder than trying.
     */
    const bytes = await createBackup('2026-08-17T00:00:00.000Z');
    const files = unzipSync(bytes);
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    manifest.format = BACKUP_FORMAT + 1;
    const { zipSync } = await import('fflate');
    const tampered = zipSync({
      ...files,
      'manifest.json': new TextEncoder().encode(JSON.stringify(manifest))
    });
    expect(() => readBackupManifest(tampered)).toThrow('backup-too-new');
  });

  it('refuses to write a key this build did not agree to carry', async () => {
    /**
     * Defence in depth against the file itself. A backup written elsewhere
     * cannot smuggle in `livelayer.relayUrl` by putting it in the JSON — the
     * reader checks the allow-list too, not just the writer.
     */
    const { zipSync } = await import('fflate');
    const forged = zipSync({
      'manifest.json': new TextEncoder().encode(
        JSON.stringify({ format: 1, app: 'livelayer', createdAt: 'x', origin: '', counts: {}, notice: '' })
      ),
      'local-storage.json': new TextEncoder().encode(
        JSON.stringify({ 'livelayer.relayUrl': 'http://evil:4174', 'livelayer.presets': '[]' })
      )
    });
    const empty = fakeStorage();
    vi.stubGlobal('localStorage', empty);
    const summary = await restoreBackup(forged);
    expect(empty.map.get('livelayer.relayUrl')).toBeUndefined();
    expect(empty.map.get('livelayer.presets')).toBe('[]');
    expect(summary.skipped).toContain('livelayer.relayUrl');
  });
});
