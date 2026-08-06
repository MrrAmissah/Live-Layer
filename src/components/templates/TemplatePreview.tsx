import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { templateRegistry, templateRendererMap } from './registry';
import GraphicStage, { type StageBackdrop } from '../graphics/GraphicStage';
import {
  resolveAnimationVariant,
  LOWER_THIRD_BARE_FALLBACK,
  STAGE_WIDTH,
  STAGE_HEIGHT,
  type StageRect
} from '../graphics/stage';
import { measureStageContent, cropFromContent, sameRect } from '../graphics/contentCrop';
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
  /**
   * Optional note rendered in the integrated bottom strip, left of the format
   * spec (e.g. the "editing updates preview only" reassurance). Presentation
   * only — never affects the GraphicStage render. Ignored by the bare frame,
   * which renders no strip.
   */
  footer?: React.ReactNode;
  /**
   * `monitor` (default) wraps the stage in the studio's reference-monitor
   * chrome — tally rail, 16:9 screen, spec plate. `bare` renders ONLY the
   * graphic on a plain dark field, in a box shaped to the focus crop itself —
   * the dock's cards use it so the design, not the monitor furniture, fills
   * the narrow width. Both frames render the same GraphicStage, so the
   * composition stays pixel-true to /output either way.
   */
  frame?: 'monitor' | 'bare';
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
 * Frameless preview: the graphic and nothing else. Lower thirds get a box of
 * their MEASURED content crop's aspect (contentCrop.ts — the rendered
 * graphic's own laid-out bounds plus BARE_MARGIN, never a hand-picked
 * rectangle) so the design itself fills the card; full-frame graphics
 * (cards, banners, fullscreen) keep the stage's 16:9 because they genuinely
 * use the frame. The backdrop is the plain dark field only — no bezel, no
 * tally, no spec plate, no tint.
 */
interface BarePreviewProps {
  /** Measured content crop for bottom-anchored graphics; null keeps 16:9. */
  crop: StageRect | null;
  hostRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}

function BarePreview({ crop, hostRef, children }: BarePreviewProps) {
  const aspect = crop ? `${crop.width} / ${crop.height}` : `${STAGE_WIDTH} / ${STAGE_HEIGHT}`;
  return (
    <div ref={hostRef} className="tpl-bare" style={{ aspectRatio: aspect }}>
      {children}
    </div>
  );
}

/**
 * How long content edits settle before the bare frame re-measures. The stage
 * itself re-renders live on every keystroke; only the FRAMING waits for the
 * operator to pause, so the box never twitches mid-word. Discrete changes
 * (template, variant, layout) bypass this and re-frame before paint.
 */
const BARE_REFIT_SETTLE_MS = 250;

/**
 * Content-fit crop for the bare frame. Measures the rendered graphic's
 * laid-out bounds inside the stage (contentCrop.ts — offset geometry, immune
 * to entrance transforms) and frames exactly that.
 *
 * Stability: state only changes when the integer crop rect actually differs
 * (sameRect guard), content edits are debounced behind BARE_REFIT_SETTLE_MS,
 * and the crop is expressed in stage coordinates — it cannot depend on the
 * box size it produces, so there is nothing to oscillate with.
 */
function useMeasuredBareCrop(enabled: boolean, discreteKey: string, contentKey: string) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [crop, setCrop] = useState<StageRect>(LOWER_THIRD_BARE_FALLBACK);

  const measure = useCallback(() => {
    const stage = hostRef.current?.querySelector<HTMLElement>('.gfx-stage');
    if (!stage) return;
    const content = measureStageContent(stage);
    const next = content ? cropFromContent(content) : LOWER_THIRD_BARE_FALLBACK;
    setCrop((prev) => (sameRect(prev, next) ? prev : next));
  }, []);

  // Template/variant/layout changes re-frame immediately — layout effects run
  // after the renderer's DOM commits but before paint, so the operator never
  // sees the fallback framing flash by.
  useLayoutEffect(() => {
    if (enabled) measure();
  }, [enabled, discreteKey, measure]);

  // Content edits settle first: one re-frame after the operator pauses.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(measure, BARE_REFIT_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, discreteKey, contentKey, measure]);

  // Late layout arrivals: web fonts change text width, images (strap logo)
  // have intrinsic height. Both re-measure once when they land.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    const host = hostRef.current;
    const onAssetLoad = () => measure();
    host?.addEventListener('load', onAssetLoad, true);
    return () => {
      cancelled = true;
      host?.removeEventListener('load', onAssetLoad, true);
    };
  }, [enabled, measure]);

  return { hostRef, crop };
}

/**
 * Production preview monitor. Renders through the same 1920x1080 GraphicStage
 * + renderer + theme used by /output. Lower-thirds use a preview-only focus crop
 * so operators can inspect the graphic without changing the full-frame output.
 * Backgrounds and safe-area guides are also preview-only judging aids.
 */
export default function TemplatePreview({ templateId, values, theme, layout, showControls = true, footer, frame = 'monitor' }: Props) {
  const [backdrop, setBackdrop] = useState<Exclude<StageBackdrop, 'transparent'>>('neutral');
  const [showGuides, setShowGuides] = useState(false);
  const resolvedValues = useDynamicValues(values);

  const template = templateRegistry.find((item) => item.id === templateId);
  const Renderer = templateRendererMap[templateId];
  const mergedTheme = { ...(template?.theme ?? UNSUPPORTED_THEME), ...theme };
  const anim = resolveAnimationVariant(template?.animation);
  const isLowerThird = template?.category === 'Lower Third';

  // Bare content fit (lower thirds only). Discrete key: changes that swap the
  // graphic's whole geometry re-frame at once; content key: text edits settle
  // through the debounce. Theme is colour-only and deliberately excluded.
  const bareFit = frame === 'bare' && isLowerThird;
  const discreteKey = [templateId, resolvedValues.variantId ?? '', layout?.size, layout?.position, layout?.density, layout?.safeMargin].join('|');
  const { hostRef, crop } = useMeasuredBareCrop(bareFit, discreteKey, JSON.stringify(resolvedValues));

  const stageLayer =
    template && Renderer ? (
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
    );

  if (frame === 'bare') {
    return (
      <BarePreview crop={bareFit ? crop : null} hostRef={hostRef}>
        <GraphicStage
          theme={mergedTheme}
          backdrop="dark"
          focus={bareFit ? 'lower-third-bare' : 'full'}
          bareCrop={bareFit ? crop : undefined}
        >
          {stageLayer}
        </GraphicStage>
      </BarePreview>
    );
  }

  const previewFocus = isLowerThird ? 'lower-third' : 'full';

  return (
    <div className="template-preview-shell animate-broadcast-enter">
      <div className="preview-monitor panel-strong overflow-hidden">
        <div className="monitor-bezel monitor-bezel--top">
          <span className="monitor-bezel__title">
            <span className="monitor-tally" aria-hidden />
            <span>Preview / PVW</span>
          </span>
          {showControls ? (
            <div className="monitor-bezel__tools">
              <div className="preview-toolbar-group" role="group" aria-label="Preview background">
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
                Safe area
              </button>
            </div>
          ) : null}
        </div>
        <div className="monitor-screen">
          <GraphicStage theme={mergedTheme} backdrop={backdrop} focus={previewFocus} showSafeAreas={showGuides}>
            {stageLayer}
          </GraphicStage>
        </div>
        <div className="monitor-bezel monitor-bezel--bottom">
          <span className="monitor-bezel__note">{footer}</span>
          <span className="monitor-bezel__specs">
            <span className="monitor-spec">1920 × 1080</span>
            <span className="monitor-spec monitor-spec--accent">PVW</span>
          </span>
        </div>
      </div>
    </div>
  );
}
