import { useState } from 'react';
import { templateRegistry, templateRendererMap } from './registry';
import GraphicStage, { type StageBackdrop } from '../graphics/GraphicStage';
import { resolveAnimationVariant } from '../graphics/stage';
import { TemplateDefinition } from '../../types/graphics';
import { useDynamicValues } from '../../hooks/useDynamicValues';
import type { LayoutSettings } from '../../types/layout';

interface Props {
  templateId: string;
  values: Record<string, string>;
  theme: TemplateDefinition['theme'];
  layout?: LayoutSettings;
  /**
   * Show the backdrop/safe-area toolbar. Studio mode keeps it (true); the dock
   * hides it (false) so a beginner sees only the monitor. Suppressing the
   * toolbar never touches the GraphicStage call below, so /output parity holds.
   */
  showControls?: boolean;
}

const BACKDROPS: { id: Exclude<StageBackdrop, 'transparent'>; label: string }[] = [
  { id: 'neutral', label: 'Camera' },
  { id: 'dark', label: 'Dark' },
  { id: 'bright', label: 'Light' },
  { id: 'checker', label: 'Checker' }
];

const UNSUPPORTED_THEME: TemplateDefinition['theme'] = {
  primaryColor: '#f8fafc',
  accentColor: '#E8B93C',
  backgroundColor: 'transparent'
};

function UnsupportedTemplateMessage({ templateId }: { templateId: string }) {
  return (
    <div className="template-fallback" role="status">
      <p className="template-fallback__kicker">Unsupported template</p>
      <p className="template-fallback__title">{templateId}</p>
      <p className="template-fallback__hint">This item can stay in the rundown, but this build cannot preview its graphic yet.</p>
    </div>
  );
}

/**
 * Production preview monitor. Renders through the same 1920x1080 GraphicStage
 * + renderer + theme used by /output. Lower-thirds use a preview-only focus crop
 * so operators can inspect the graphic without changing the full-frame output.
 * Backgrounds and safe-area guides are also preview-only judging aids.
 */
export default function TemplatePreview({ templateId, values, theme, layout, showControls = true }: Props) {
  const [backdrop, setBackdrop] = useState<Exclude<StageBackdrop, 'transparent'>>('neutral');
  const [showGuides, setShowGuides] = useState(false);
  const resolvedValues = useDynamicValues(values);

  const template = templateRegistry.find((item) => item.id === templateId);
  const Renderer = templateRendererMap[templateId];
  const mergedTheme = { ...(template?.theme ?? UNSUPPORTED_THEME), ...theme };
  const anim = resolveAnimationVariant(template?.animation);
  const previewFocus = template?.category === 'Lower Third' ? 'lower-third' : 'full';

  return (
    <div className="template-preview-shell animate-broadcast-enter">
      {showControls ? (
        <div className="preview-toolbar">
          <div className="preview-toolbar-title">
            <span className="monitor-tally" aria-hidden />
            <span>{template?.name ?? templateId}</span>
          </div>
          <div className="preview-toolbar-group" role="group" aria-label="Preview background">
            <span className="preview-toolbar-label">Background</span>
            {BACKDROPS.map((option) => {
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setBackdrop(option.id)}
                  className={`preview-chip ${backdrop === option.id ? 'preview-chip-active' : ''}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setShowGuides((value) => !value)}
            className={`preview-chip ${showGuides ? 'preview-chip-active' : ''}`}
            aria-pressed={showGuides}
          >
            Safe Area
          </button>
        </div>
      ) : null}

      <div className="preview-monitor panel-strong overflow-hidden">
        <div className="monitor-bezel monitor-bezel--top">
          <span className="monitor-tally" aria-hidden />
          <span className="monitor-bezel__label">Preview</span>
          <span className="monitor-bezel__hint">Updates on Take</span>
        </div>
        <div className="monitor-screen">
          <GraphicStage theme={mergedTheme} backdrop={backdrop} focus={previewFocus} showSafeAreas={showGuides}>
            {template && Renderer ? (
              <div
                key={templateId}
                className="gfx-layer"
                data-anim={anim}
                data-state="in"
                data-size={layout?.size}
                data-position={layout?.position}
                data-density={layout?.density}
                data-safe-margin={layout?.safeMargin}
              >
                <Renderer values={resolvedValues} theme={mergedTheme} />
              </div>
            ) : (
              <UnsupportedTemplateMessage templateId={templateId} />
            )}
          </GraphicStage>
        </div>
        <div className="monitor-bezel monitor-bezel--bottom">
          <span className="monitor-spec">1920 × 1080</span>
          <span className="monitor-spec monitor-spec--accent">PVW</span>
        </div>
      </div>
    </div>
  );
}
