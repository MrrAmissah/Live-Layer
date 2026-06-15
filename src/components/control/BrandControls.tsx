import { useEffect, useState, type ChangeEvent } from 'react';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { saveUploadedAsset } from '../../lib/assets/assetStore';
import { validateImageFile } from '../../lib/assets/imageProcessing';
import { useAsset } from '../../hooks/useAsset';
import { useEditTarget } from '../../hooks/useEditTarget';
import { GFX_DEFAULT_ACCENT_2 } from '../graphics/stage';

function Swatch({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="swatch">
      <input
        type="color"
        className="swatch__chip"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      />
      <span className="swatch__meta">
        <span className="swatch__label">{label}</span>
        <span className="swatch__hex">{value.toUpperCase()}</span>
      </span>
    </label>
  );
}

/**
 * Brand colour chips + shared logo URL. Compact swatches with a hex readout
 * instead of stretched colour bars. Shared by the studio BrandPanel and the
 * dock BrandStep; owns its own store subscription.
 */
export default function BrandControls() {
  const theme = useLiveLayerStore((state) => state.theme);
  const setTheme = useLiveLayerStore((state) => state.setTheme);
  const logoUrl = useLiveLayerStore((state) => state.draftValues.logoUrl ?? '');
  const logoAssetId = useLiveLayerStore((state) => state.draftValues.logoAssetId ?? '');
  const setField = useLiveLayerStore((state) => state.setField);

  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  const assetResult = useAsset(logoAssetId);
  const assetSrc = assetResult.status === 'ready' ? assetResult.src : undefined;

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
      setField('logoAssetId', asset.id);
      setField('logoUrl', '');
      setShowUrlInput(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleRemove = () => {
    setField('logoAssetId', '');
    setField('logoUrl', '');
    setShowUrlInput(false);
    setError(null);
  };

  const { isRundownItem } = useEditTarget();

  return (
    <div className="brand-grid">
      {isRundownItem ? (
        <p className="field__hint">Brand changes apply to new graphics, not the selected rundown item (its colours/logo were captured when it was added).</p>
      ) : null}
      <div className="brand-grid__swatches">
        <Swatch label="Main colour" value={theme.accentColor} onChange={(value) => setTheme({ accentColor: value })} />
        <Swatch label="Accent" value={theme.accent2Color ?? GFX_DEFAULT_ACCENT_2} onChange={(value) => setTheme({ accent2Color: value })} />
      </div>
      <div className="field">
        <span className="field__label">
          <span>Logo</span>
          <span className="field__opt">Optional</span>
        </span>
        <div className="brand-upload-group">
          <label className="btn btn--secondary btn--sm" htmlFor="brand-logo-upload">
            {assetSrc || logoUrl ? 'Replace image' : 'Choose image'}
          </label>
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
          {assetSrc || logoUrl ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleRemove}>
              Remove image
            </button>
          ) : null}
        </div>

        {showUrlInput ? (
          <input
            className="field__input"
            type="url"
            value={logoUrl}
            placeholder="https://…/logo.png"
            onChange={(event) => {
              setField('logoUrl', event.target.value);
              setField('logoAssetId', '');
            }}
          />
        ) : null}

        {previewSource && !previewFailed ? (
          <div className="brand-preview">
            <img src={previewSource} alt="Logo preview" className="brand-preview__img" onError={() => setPreviewFailed(true)} />
            <div className="brand-preview__meta">{previewLabel}</div>
          </div>
        ) : null}

        {error ? <div className="field__hint field__hint--error" role="alert">{error}</div> : null}
        {previewFailed ? <div className="field__hint field__hint--error" role="alert">Logo preview could not load; the live graphic will fall back to the monogram.</div> : null}
        {isUploading ? <div className="field__hint">Saving image…</div> : null}
        <div className="field__hint">
          For OBS, use the same host and port for Control and Output so local images can load.
        </div>
      </div>
    </div>
  );
}
