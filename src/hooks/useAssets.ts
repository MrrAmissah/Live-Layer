import { useEffect, useState } from 'react';
import { listAssets } from '../lib/assets/assetStore';
import type { LocalAsset } from '../types/assets';

interface UseAssetsResult {
  status: 'idle' | 'loading' | 'ready' | 'error';
  assets: LocalAsset[];
}

export function useAssets(): UseAssetsResult {
  const [assets, setAssets] = useState<LocalAsset[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    let active = true;
    setStatus('loading');

    listAssets()
      .then((items) => {
        if (!active) return;
        setAssets(items);
        setStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setAssets([]);
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, []);

  return { status, assets };
}
