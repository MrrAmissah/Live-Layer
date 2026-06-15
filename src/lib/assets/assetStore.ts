import type { AssetType, LocalAsset } from '../../types/assets';
import { processUploadedImage } from './imageProcessing';

const DB_NAME = 'livelayer';
const DB_VERSION = 2;
const ASSET_META_STORE = 'assetMeta';
const ASSET_BLOBS_STORE = 'assetBlobs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ASSET_META_STORE)) {
        db.createObjectStore(ASSET_META_STORE, { keyPath: 'id' });
      }
      if (event.oldVersion < 2 && db.objectStoreNames.contains(ASSET_BLOBS_STORE)) {
        db.deleteObjectStore(ASSET_BLOBS_STORE);
      }
      if (!db.objectStoreNames.contains(ASSET_BLOBS_STORE)) {
        db.createObjectStore(ASSET_BLOBS_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDb();
  }
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAsset(asset: LocalAsset, blob?: Blob): Promise<LocalAsset> {
  const db = await getDb();
  const tx = db.transaction([ASSET_META_STORE, ASSET_BLOBS_STORE], 'readwrite');
  const metaStore = tx.objectStore(ASSET_META_STORE);
  const blobStore = tx.objectStore(ASSET_BLOBS_STORE);

  const next: LocalAsset = {
    ...asset,
    updatedAt: new Date().toISOString()
  };

  metaStore.put(next);
  if (blob) {
    const blobKey = next.blobKey ?? next.id;
    blobStore.put(blob, blobKey);
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  return next;
}

export async function saveUploadedAsset(file: File, type: AssetType, name?: string): Promise<LocalAsset> {
  const result = await processUploadedImage(file);
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `asset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const asset: LocalAsset = {
    id,
    type,
    name: name?.trim() || file.name,
    mimeType: result.mimeType,
    sizeBytes: result.blob.size,
    width: result.width,
    height: result.height,
    createdAt: now,
    updatedAt: now,
    source: 'uploaded',
    blobKey: id,
    dataUrl: result.thumbDataUrl
  };
  await saveAsset(asset, result.blob);
  return asset;
}

export async function saveUrlAsset(url: string, type: AssetType, name?: string): Promise<LocalAsset> {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `asset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const asset: LocalAsset = {
    id,
    type,
    name: name?.trim() || url,
    createdAt: now,
    updatedAt: now,
    source: 'url',
    url,
    dataUrl: undefined
  };
  await saveAsset(asset);
  return asset;
}

export async function getAsset(id: string): Promise<LocalAsset | null> {
  const db = await getDb();
  const tx = db.transaction(ASSET_META_STORE, 'readonly');
  const store = tx.objectStore(ASSET_META_STORE);
  const result = await requestToPromise<LocalAsset | undefined>(store.get(id));
  return result ?? null;
}

export async function listAssets(): Promise<LocalAsset[]> {
  const db = await getDb();
  const tx = db.transaction(ASSET_META_STORE, 'readonly');
  const store = tx.objectStore(ASSET_META_STORE);
  const request = store.getAll();
  return requestToPromise<LocalAsset[]>(request);
}

export async function getAssetBlob(id: string): Promise<Blob | null> {
  const db = await getDb();
  const tx = db.transaction(ASSET_BLOBS_STORE, 'readonly');
  const store = tx.objectStore(ASSET_BLOBS_STORE);
  const result = await requestToPromise<Blob | undefined>(store.get(id));
  return result ?? null;
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([ASSET_META_STORE, ASSET_BLOBS_STORE], 'readwrite');
  const metaStore = tx.objectStore(ASSET_META_STORE);
  const blobStore = tx.objectStore(ASSET_BLOBS_STORE);
  const existing = await requestToPromise<LocalAsset | undefined>(metaStore.get(id));
  metaStore.delete(id);
  blobStore.delete(existing?.blobKey ?? id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function clearAllAssets(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([ASSET_META_STORE, ASSET_BLOBS_STORE], 'readwrite');
  tx.objectStore(ASSET_META_STORE).clear();
  tx.objectStore(ASSET_BLOBS_STORE).clear();
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function isLikelyHttpUrl(value?: string): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

export async function resolveAssetSource(source?: string): Promise<string | undefined> {
  if (!source || source.trim() === '') return undefined;
  if (isLikelyHttpUrl(source)) return source.trim();

  let asset: LocalAsset | null;
  try {
    asset = await getAsset(source);
  } catch {
    console.warn(`[LiveLayer] Asset "${source}" could not be read from IndexedDB. Rendering fallback.`);
    return undefined;
  }
  if (!asset) {
    console.warn(`[LiveLayer] Asset "${source}" was not found. Rendering fallback.`);
    return undefined;
  }
  if (asset.source === 'url' && asset.url) return asset.url;

  let blob: Blob | null;
  try {
    blob = await getAssetBlob(asset.blobKey ?? asset.id);
  } catch {
    console.warn(`[LiveLayer] Asset "${asset.id}" original could not be read from IndexedDB. Rendering fallback.`);
    return asset.dataUrl ?? asset.url;
  }
  if (!blob) {
    if (asset.dataUrl) {
      console.warn(`[LiveLayer] Asset "${asset.id}" is missing its original image. Using saved thumbnail fallback.`);
      return asset.dataUrl;
    }
    console.warn(`[LiveLayer] Asset "${asset.id}" is missing its original image. Rendering fallback.`);
    return asset.url;
  }
  return URL.createObjectURL(blob);
}

export function decodeImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      if ('decode' in image) {
        image.decode().then(() => resolve()).catch(() => resolve());
        return;
      }
      resolve();
    };
    image.onerror = () => resolve();
    image.src = src;
  });
}
