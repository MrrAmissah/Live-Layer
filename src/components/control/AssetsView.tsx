import { useEffect, useState } from 'react';
import { listAssets } from '../../lib/assets/assetStore';
import type { LocalAsset } from '../../types/assets';
import Panel from './Panel';
import { Icon } from '../../lib/icons';

const TYPE_LABEL: Record<string, string> = {
  logo: 'Logo',
  'event-logo': 'Event logo',
  'speaker-headshot': 'Headshot',
  background: 'Background',
  generic: 'Image'
};

/**
 * Assets destination — the locally stored production images (logos, headshots)
 * that templates draw from. Read-only browse here; uploads stay where they are
 * used (brand logo, people headshots), so this view never duplicates those
 * flows or embeds the full uploader.
 */
export default function AssetsView() {
  const [assets, setAssets] = useState<LocalAsset[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAssets()
      .then((list) => {
        if (!cancelled) setAssets(list);
      })
      .catch(() => {
        if (!cancelled) setAssets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel className="ll-fill">
      <div className="editor-head">
        <span className="ll-kicker">Library</span>
        <span className="ll-count">{assets?.length ?? 0} assets</span>
      </div>
      <div className="ll-panel__body">
        {assets === null ? (
          <p className="field__hint">Loading assets…</p>
        ) : assets.length === 0 ? (
          <p className="field__hint">
            No stored assets yet. Logos are added from the Brand tab; headshots from a People record.
          </p>
        ) : (
          <div className="asset-grid">
            {assets.map((asset) => (
              <div key={asset.id} className="asset-tile">
                <span className="asset-tile__thumb">
                  {asset.dataUrl ? <img src={asset.dataUrl} alt="" /> : <Icon name="image" size={22} />}
                </span>
                <span className="asset-tile__name" title={asset.name}>{asset.name}</span>
                <span className="asset-tile__type">{TYPE_LABEL[asset.type] ?? asset.type}</span>
              </div>
            ))}
          </div>
        )}
        <p className="field__hint">
          Manage uploads where each asset is used — the Brand tab for logos, a People record for headshots.
        </p>
      </div>
    </Panel>
  );
}
