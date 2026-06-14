import type { AssetType } from '../../types/assets';

export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type SupportedImageMimeType = (typeof SUPPORTED_IMAGE_TYPES)[number];
export const MAX_ASSET_SIZE_BYTES = 12 * 1024 * 1024;
export const MAX_ASSET_EDGE = 1600;
export const THUMB_EDGE = 240;
export const THUMB_QUALITY = 0.85;

export function isSupportedImageType(type: string): type is SupportedImageMimeType {
  return SUPPORTED_IMAGE_TYPES.includes(type as SupportedImageMimeType);
}

function getSafeMimeType(type: string): SupportedImageMimeType {
  if (isSupportedImageType(type)) return type;
  return 'image/png';
}

async function toImageBitmap(file: File): Promise<ImageBitmap> {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode image')); 
      img.src = url;
    });
    const bitmap = await createImageBitmap(image);
    return bitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: SupportedImageMimeType, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode image'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

async function createThumbnail(bitmap: ImageBitmap): Promise<string> {
  const ratio = Math.min(1, THUMB_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create image context');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

async function resizeBitmap(bitmap: ImageBitmap, maxEdge: number, mimeType: SupportedImageMimeType): Promise<Blob> {
  const scale = maxEdge / Math.max(bitmap.width, bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create image context');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvasToBlob(canvas, mimeType, THUMB_QUALITY);
}

export interface ProcessedAssetResult {
  blob: Blob;
  width: number;
  height: number;
  mimeType: SupportedImageMimeType;
  thumbDataUrl: string;
}

export async function processUploadedImage(file: File): Promise<ProcessedAssetResult> {
  if (!isSupportedImageType(file.type)) {
    throw new Error('unsupported-file-type');
  }

  if (file.size > MAX_ASSET_SIZE_BYTES) {
    throw new Error('file-too-large');
  }

  const mimeType = getSafeMimeType(file.type);
  const bitmap = await toImageBitmap(file);
  try {
    const width = bitmap.width;
    const height = bitmap.height;
    const thumbDataUrl = await createThumbnail(bitmap);

    let blob: Blob = file;
    if (Math.max(width, height) > MAX_ASSET_EDGE) {
      blob = await resizeBitmap(bitmap, MAX_ASSET_EDGE, mimeType);
    }

    return {
      blob,
      width,
      height,
      mimeType,
      thumbDataUrl
    };
  } finally {
    if ('close' in bitmap) {
      bitmap.close();
    }
  }
}

export function validateImageFile(file: File): string | null {
  if (!isSupportedImageType(file.type)) {
    return 'That file type is not supported. Use a PNG, JPG, or WebP.';
  }
  if (file.size > MAX_ASSET_SIZE_BYTES) {
    return 'That image is too large. Please choose a file under 12 MB.';
  }
  return null;
}
