import { useEffect, useState, type ChangeEvent } from 'react';
import { saveUploadedAsset } from '../../lib/assets/assetStore';
import { validateImageFile } from '../../lib/assets/imageProcessing';
import { useAsset } from '../../hooks/useAsset';
import SavedImagePicker from './SavedImagePicker';
import type { AssetType } from '../../types/assets';

/** A logo slot accepts logos, not faces — the store's own taxonomy decides. */
const LOGO_ASSET_TYPES: readonly AssetType[] = ['logo', 'event-logo'];
import { useEditTarget } from '../../hooks/useEditTarget';
import { describeLogoRef, planLogoWrite } from '../../lib/brandWrites';

/**
 * The logo field block for the VISIBLE graphic: upload / URL / remove /
 * preview / missing-asset warning. Extracted verbatim from BrandControls so
 * the dock's Quick Edit Logo card and the studio Brand tab are provably the
 * same writes — every change goes through `planLogoWrite` as ONE `setFields`
 * patch on the edit target (draft or the selected rundown item), and Program
 * is never touched.
 */
export default function LogoControls() {
  const { values, setFields } = useEditTarget();

  const logoUrl = values.logoUrl ?? '';
  const logoAssetId = values.logoAssetId ?? '';

  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [pickingSaved, setPickingSaved] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  const assetResult = useAsset(logoAssetId);
  const assetSrc = assetResult.status === 'ready' ? assetResult.src : undefined;
  // Presence, not resolution, decides whether a logo reference exists — see
  // describeLogoRef. Same rule PersonForm already uses for headshots.
  const { hasRef: hasLogoRef, missing: logoMissing } = describeLogoRef(
    logoAssetId,
    logoUrl,
    assetResult.status
  );

  const previewSource = assetSrc ?? (logoUrl.trim() || undefined);
  const previewLabel = assetSrc ? 'Image saved locally' : 'URL preview';

  useEffect(() => {
    setPreviewFailed(false);
  }, [previewSource]);

  const errorMessage = (error: unknown) => {
    if (error instanceof Error) {
      if (error.message === 'unsupported-file-type') {
        return 'That file type is not supported. Use a PNG, JPG, or WebP.';
      }
      if (error.message === 'file-too-large') {
        return 'That image is too large. Please choose a file under 12 MB.';
      }
    }
    return 'Unable to import this image.';
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    if (!file) return;
    const validation = validateImageFile(file);
    if (validation) {
      setError(validation);
      return;
    }

    setIsUploading(true);
    try {
      const asset = await saveUploadedAsset(file, 'logo');
      // One atomic write: an upload and a URL are alternatives, so they must
      // never both be live between two sequential field updates.
      setFields(planLogoWrite({ type: 'asset', assetId: asset.id }));
      setShowUrlInput(false);
      /**
       * Close the saved list rather than leaving it stale: it was loaded before
       * this upload, so it does not contain the asset that is now selected, and
       * a list that omits the current choice invites picking something else.
       */
      setPickingSaved(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  /**
   * Reuse, through the SAME atomic helper an upload uses. `planLogoWrite`
   * defines what a logo change means — asset and URL are alternatives and must
   * never both be live — so choosing a saved image cannot drift from uploading
   * one. The ID is written; no blob is copied and no second upload happens.
   */
  const handlePickSaved = (assetId: string) => {
    setFields(planLogoWrite({ type: 'asset', assetId }));
    setShowUrlInput(false);
    setPickingSaved(false);
    setError(null);
  };

  const handleRemove = () => {
    setFields(planLogoWrite({ type: 'clear' }));
    setShowUrlInput(false);
    setError(null);
  };

  return (
    <div className="field">
      <span className="field__label">
        <span>Logo</span>
        <span className="field__opt">Optional</span>
      </span>
      <div className="brand-upload-group">
        <label className="btn btn--secondary btn--sm" htmlFor="brand-logo-upload">
          {hasLogoRef ? 'Replace image' : 'Upload image'}
        </label>
        {/* The image is probably already on this machine. */}
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => setPickingSaved((open) => !open)}
        >
          Use saved image
        </button>
        <input
          id="brand-logo-upload"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="field__file-input"
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setShowUrlInput((value) => !value)}
        >
          {showUrlInput ? 'Hide URL' : 'Use URL instead'}
        </button>
        {hasLogoRef ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={handleRemove}>
            Remove image
          </button>
        ) : null}
      </div>

      {pickingSaved ? (
        <SavedImagePicker
          accept={LOGO_ASSET_TYPES}
          selectedAssetId={logoAssetId}
          onSelect={handlePickSaved}
          onCancel={() => setPickingSaved(false)}
          emptyHint="No saved logos yet. Upload one and it becomes reusable from every graphic."
        />
      ) : null}

      {showUrlInput ? (
        <input
          className="field__input"
          type="url"
          value={logoUrl}
          placeholder="https://…/logo.png"
          onChange={(event) => setFields(planLogoWrite({ type: 'url', url: event.target.value }))}
        />
      ) : null}

      {previewSource && !previewFailed ? (
        <div className="brand-preview">
          <img src={previewSource} alt="Logo preview" className="brand-preview__img" onError={() => setPreviewFailed(true)} />
          <div className="brand-preview__meta">{previewLabel}</div>
        </div>
      ) : null}

      {logoMissing ? (
        <div className="field__hint field__hint--error" role="status">
          This graphic references a saved image that isn’t available — it may have been removed, or
          not included when the pack was imported. Remove it or choose a new one; the graphic falls
          back to the monogram until you do.
        </div>
      ) : null}

      {error ? <div className="field__hint field__hint--error" role="alert">{error}</div> : null}
      {previewFailed ? <div className="field__hint field__hint--error" role="alert">Logo preview could not load; the live graphic will fall back to the monogram.</div> : null}
      {isUploading ? <div className="field__hint" role="status" aria-live="polite">Saving image…</div> : null}
      <div className="field__hint">
        For OBS, use the same host and port for Control and Output so local images can load.
      </div>
    </div>
  );
}
