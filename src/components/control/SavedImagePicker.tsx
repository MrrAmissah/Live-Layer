import { useEffect, useState } from 'react';
import { listAssets } from '../../lib/assets/assetStore';
import { Icon } from '../../lib/icons';
import type { AssetType, LocalAsset } from '../../types/assets';

/**
 * Reuse an image already on this machine, instead of uploading it again.
 *
 * The asset store has held saved images since assets existed — metadata, blobs,
 * `listAssets()` — but only the Library browser and `/setup` diagnostics ever
 * called it. Every authoring surface that actually needs an image was
 * upload-first, so the church logo got re-uploaded for each new graphic and
 * each new Person, producing duplicate blobs of the same picture and a slow
 * step in the middle of a service.
 *
 * This is the shared selector for those surfaces. It is deliberately small: a
 * list, a thumbnail, a name, a choice. Not a gallery, not a manager.
 *
 * WHAT IT WILL NOT DO. It hands back an asset ID and nothing else — no blob, no
 * data URL, no object URL — because a graphic stores references and the
 * renderer resolves them. It has no delete: removing an image from the graphic
 * you are editing and deleting it from the machine are different operations
 * with different consequences (other graphics and People may hold the same
 * reference), and only the Library owns the second one.
 *
 * Thumbnails come from `dataUrl`, the compact downscaled preview the store
 * already keeps. Listing does not open a single blob.
 */
interface SavedImagePickerProps {
  /** Which kinds of image make sense here — a headshot is not a church logo. */
  accept: readonly AssetType[];
  /** The asset currently referenced by the target, so it can be marked. */
  selectedAssetId?: string;
  /** Called with the chosen asset's ID. Never with bytes. */
  onSelect: (assetId: string) => void;
  onCancel: () => void;
  emptyHint?: string;
}

export default function SavedImagePicker({
  accept,
  selectedAssetId,
  onSelect,
  onCancel,
  emptyHint
}: SavedImagePickerProps) {
  const [assets, setAssets] = useState<LocalAsset[] | null>(null);

  useEffect(() => {
    let alive = true;
    listAssets()
      .then((all) => {
        if (!alive) return;
        /**
         * Filtered by the store's OWN taxonomy rather than by "it is an image".
         * Offering a speaker's headshot as a church logo because both are
         * pictures is how the wrong face ends up in the corner of a lower third.
         */
        const usable = all.filter((asset) => accept.includes(asset.type));
        // Newest first. The store records createdAt/updatedAt, not use time, so
        // this is deliberately not called "recently used" anywhere in the UI.
        usable.sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
        setAssets(usable);
      })
      .catch(() => {
        if (alive) setAssets([]);
      });
    return () => {
      alive = false;
    };
  }, [accept]);

  return (
    <div className="saved-img" role="group" aria-label="Saved images">
      <div className="saved-img__head">
        <span className="ll-kicker">Saved images</span>
        <button type="button" className="btn btn--ghost btn--xs" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {assets === null ? (
        <p className="field__hint">Loading saved images…</p>
      ) : assets.length === 0 ? (
        <p className="field__hint">
          {emptyHint ?? 'No saved images of this kind yet. Upload one and it will be reusable here.'}
        </p>
      ) : (
        <ul className="saved-img__list">
          {assets.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                className={`saved-img__item${asset.id === selectedAssetId ? ' is-current' : ''}`}
                onClick={() => onSelect(asset.id)}
                title={asset.name}
              >
                <span className="saved-img__thumb" aria-hidden>
                  {asset.dataUrl ? (
                    <img src={asset.dataUrl} alt="" />
                  ) : (
                    <Icon name="image" size={16} />
                  )}
                </span>
                <span className="saved-img__name">{asset.name}</span>
                {asset.id === selectedAssetId ? <span className="saved-img__current">In use</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
