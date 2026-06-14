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
  { id: 'bright', label: 'Bright' },
  { id: 'checker', label: 'Checker' }
];

/**
 * Production preview monitor. Renders the template through the exact same
 * scaled 1920x1080 GraphicStage + renderer + theme used by /output, so the
 * preview composition is pixel-true to the broadcast output. The background
 * and safe-area guides are preview-only judging aids — they never change what
 * /output renders, which stays transparent.
 */
export default function TemplatePreview({ templateId, values, theme, layout, showControls = true }: Props) {
  const [backdrop, setBackdrop] = useState<Exclude<StageBackdrop, 'transparent'>>('neutral');
  const [showGuides, setShowGuides] = useState(false);
  const resolvedValues = useDynamicValues(values);

  const template = templateRegistry.find((item) => item.id === templateId);
  if (!template) return null;

  const Renderer = templateRendererMap[templateId];
  const mergedTheme = { ...template.theme, ...theme };
  const anim = resolveAnimationVariant(template.animation);

  return (
    <div className="grid gap-3 animate-broadcast-enter">
      {showControls ? (
        <div className="preview-toolbar">
          <div className="preview-toolbar-group" role="group" aria-label="Preview background">
            <span className="preview-toolbar-label">Background</span>
            {BACKDROPS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setBackdrop(option.id)}
                className={`preview-chip ${backdrop === option.id ? 'preview-chip-active' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowGuides((value) => !value)}
            className={`preview-chip ${showGuides ? 'preview-chip-active' : ''}`}
            aria-pressed={showGuides}
          >
            Safe areas
          </button>
        </div>
      ) : null}

      <div className="preview-monitor panel-strong overflow-hidden">
        <div className="monitor-header">Draft preview · changes on Take</div>
        <div className="monitor-screen">
          <GraphicStage theme={mergedTheme} backdrop={backdrop} showSafeAreas={showGuides}>
            {Renderer ? (
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
            ) : null}
          </GraphicStage>
        </div>
      </div>
    </div>
  );
}
