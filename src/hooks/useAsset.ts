import { useEffect, useState } from 'react';
import { getAsset, getAssetBlob, isLikelyHttpUrl } from '../lib/assets/assetStore';
import type { AssetStatus } from '../types/assets';

interface UseAssetResult {
  status: AssetStatus;
  src?: string;
}

export function useAsset(source?: string): UseAssetResult {
  const [status, setStatus] = useState<AssetStatus>('idle');
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    async function resolve() {
      if (!source || source.trim() === '') {
        setStatus('idle');
        setSrc(undefined);
        return;
      }

      if (isLikelyHttpUrl(source)) {
        setSrc(source.trim());
        setStatus('ready');
        return;
      }

      setStatus('loading');
      setSrc(undefined);

      try {
        const asset = await getAsset(source);
        if (!active) return;
        if (!asset) {
          if (isLikelyHttpUrl(source)) {
            setSrc(source.trim());
            setStatus('ready');
            return;
          }
          setStatus('missing');
          setSrc(undefined);
          return;
        }

        if (asset.dataUrl) {
          setSrc(asset.dataUrl);
        }

        if (asset.source === 'url' && asset.url) {
          setSrc(asset.url);
          setStatus('ready');
          return;
        }

        const blobKey = asset.blobKey ?? asset.id;
        const blob = await getAssetBlob(blobKey);
        if (!active) return;
        if (!blob) {
          if (asset.dataUrl) {
            console.warn(`[LiveLayer] Asset "${asset.id}" is missing its original image. Using saved thumbnail fallback.`);
            setSrc(asset.dataUrl);
            setStatus('ready');
            return;
          }
          if (asset.url) {
            setSrc(asset.url);
            setStatus('ready');
            return;
          }
          console.warn(`[LiveLayer] Asset "${asset.id}" is missing its original image. Rendering fallback.`);
          setStatus('missing');
          setSrc(undefined);
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setStatus('ready');
      } catch {
        if (!active) return;
        setStatus('missing');
        setSrc(undefined);
      }
    }

    resolve();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };
  }, [source]);

  return { status, src };
}
