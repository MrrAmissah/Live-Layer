import { useEffect, useState, type ChangeEvent } from 'react';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { saveUploadedAsset } from '../../lib/assets/assetStore';
import { validateImageFile } from '../../lib/assets/imageProcessing';
import { useAsset } from '../../hooks/useAsset';
import { useEditTarget } from '../../hooks/useEditTarget';
import { usePackSwitchGuard } from '../../hooks/usePackSwitchGuard';
import { GFX_DEFAULT_ACCENT_2, GFX_DEFAULT_BRAND } from '../graphics/stage';
import { templateRegistry } from '../templates/registry';
import { BRAND_SWATCHES, planBrandColorWrite, planLogoWrite, type BrandSwatch } from '../../lib/brandWrites';
import { getPack, graphicPacks } from '../../lib/packs';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

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

export interface BrandControlsProps {
  /**
   * Render the event-pack switcher. The dock's Brand step keeps it (default);
   * the studio Brand tab turns it off because its own section B owns the pack,
   * including the read-only treatment for a selected rundown item.
   */
  showEventPack?: boolean;
}

/**
 * Brand colour chips + logo for the VISIBLE graphic.
 *
 * Both controls write through `useEditTarget`, so with a rundown item selected
 * they edit that item and never the hidden ad-hoc draft. A colour additionally
 * persists as the global brand default (which seeds future graphics) — the two
 * writes are planned together in `brandWrites` so the studio tab and the dock
 * step provably do the same thing.
 *
 * Shared by the studio BrandTab and the dock BrandStep; owns its own store
 * subscription.
 */
export default function BrandControls({ showEventPack = true }: BrandControlsProps = {}) {
  const setTheme = useLiveLayerStore((state) => state.setTheme);
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const { requestPackChange } = usePackSwitchGuard();
  // The VISIBLE target's theme. A selected rundown item falls back to its own
  // captured theme — the hidden draft's would report a colour the preview and
  // Take never use.
  const { isRundownItem, values, theme: targetTheme, templateId, setFields } = useEditTarget();

  const logoUrl = values.logoUrl ?? '';
  const logoAssetId = values.logoAssetId ?? '';

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
      // One atomic write: an upload and a URL are alternatives, so they must
      // never both be live between two sequential field updates.
      setFields(planLogoWrite({ type: 'asset', assetId: asset.id }));
      setShowUrlInput(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleRemove = () => {
    setFields(planLogoWrite({ type: 'clear' }));
    setShowUrlInput(false);
    setError(null);
  };

  /**
   * The chip must report the colour the graphic is actually painted with.
   *
   * Same resolution order the preview uses: the target's own `values` colour
   * first (renderers redeclare `--gfx-*` from those), then the TARGET's theme
   * over its template's declared theme — the merge TemplatePreview performs —
   * then the stage default. Reading the store theme here reported a colour
   * neither the preview nor Take used whenever a legacy or imported item
   * carried no colour values of its own.
   */
  const templateTheme = templateRegistry.find((entry) => entry.id === templateId)?.theme;
  const effectiveTheme = { ...(templateTheme ?? {}), ...targetTheme };

  const swatchValue = (swatch: BrandSwatch, fallback: string): string => {
    const { field, themeKey } = BRAND_SWATCHES[swatch];
    const own = values[field]?.trim();
    if (own && HEX_COLOR.test(own)) return own;
    const themed = effectiveTheme[themeKey]?.trim();
    return themed && HEX_COLOR.test(themed) ? themed : fallback;
  };

  /**
   * A swatch always writes the visible target's own colour field — that is what
   * the renderers read. Whether it ALSO redefines the global brand depends on
   * what is visible:
   *
   * - Draft mode: the draft is the next new graphic, so the brand default moves
   *   with it and seeds the ones after that.
   * - Selected rundown item: a captured graphic. Recolouring one item in a
   *   queue must not silently redefine what every future graphic looks like, so
   *   the brand default is left alone.
   *
   * Program is untouched either way — output only changes on the next Take.
   */
  const onSwatchChange = (swatch: BrandSwatch) => (value: string) => {
    const write = planBrandColorWrite(swatch, value, isRundownItem);
    if (Object.keys(write.theme).length > 0) setTheme(write.theme);
    setFields(write.values);
  };

  return (
    <div className="brand-grid">
      {isRundownItem ? (
        <p className="field__hint">
          Colours and logo apply to the selected rundown item only. Brand defaults are unchanged. Live
          output doesn’t change until Take.
        </p>
      ) : null}
      {showEventPack ? (
        <div className="field">
          <span className="field__label">
            <span>Event pack</span>
          </span>
          <div className="layout-seg pack-seg">
            {graphicPacks.map((pack) => (
              <button
                key={pack.id}
                type="button"
                className={`layout-seg__btn${pack.id === activePackId ? ' layout-seg__btn--active' : ''}`}
                onClick={() => requestPackChange(pack.id)}
              >
                {pack.name}
              </button>
            ))}
          </div>
          <div className="field__hint">
            {getPack(activePackId).description} Applies to new graphics; switching re-seeds the current draft.
          </div>
        </div>
      ) : null}
      <div className="brand-grid__swatches">
        <Swatch
          label={BRAND_SWATCHES.main.label}
          value={swatchValue('main', GFX_DEFAULT_BRAND)}
          onChange={onSwatchChange('main')}
        />
        <Swatch
          label={BRAND_SWATCHES.accent.label}
          value={swatchValue('accent', GFX_DEFAULT_ACCENT_2)}
          onChange={onSwatchChange('accent')}
        />
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
            onChange={(event) => setFields(planLogoWrite({ type: 'url', url: event.target.value }))}
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
        {isUploading ? <div className="field__hint" role="status" aria-live="polite">Saving image…</div> : null}
        <div className="field__hint">
          For OBS, use the same host and port for Control and Output so local images can load.
        </div>
      </div>
    </div>
  );
}
