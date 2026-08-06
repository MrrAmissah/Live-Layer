import type { ReactNode } from 'react';
import type { TemplateTheme } from '../../types/graphics';
import { useStageScale } from './useStageScale';
import { themeToVars } from './themeVars';
import {
  STAGE_WIDTH,
  STAGE_HEIGHT,
  SAFE_ACTION,
  SAFE_TITLE,
  LOWER_THIRD_ZONE,
  LOWER_THIRD_FOCUS,
  LOWER_THIRD_BARE_FALLBACK,
  type StageRect
} from './stage';

/**
 * Backdrop the stage paints behind the graphic.
 * - `transparent`: nothing painted — required for /output (OBS Browser Source).
 * - the rest are preview-only camera/stage simulations so an operator can judge
 *   legibility; they never reach /output.
 */
export type StageBackdrop = 'transparent' | 'dark' | 'bright' | 'neutral' | 'checker';

interface GraphicStageProps {
  /** Theme of the active graphic; mapped to --gfx-* vars on the stage root. */
  theme?: Partial<TemplateTheme>;
  /** 'transparent' for /output (OBS); other modes paint a preview backdrop. */
  backdrop?: StageBackdrop;
  /**
   * Preview-only focus crop. /output leaves this unset to preserve full-frame
   * rendering. `lower-third` is the monitor's 16:9 zoom+pan; `lower-third-bare`
   * fits a stage rect edge-to-edge into a box of the rect's own aspect — for
   * frameless previews with no dead space.
   */
  focus?: 'full' | 'lower-third' | 'lower-third-bare';
  /**
   * The stage rect the `lower-third-bare` focus frames — normally the
   * measured content crop from TemplatePreview (contentCrop.ts), falling back
   * to the zone-derived LOWER_THIRD_BARE_FALLBACK. Ignored by other focus
   * modes; /output never sets it. Crop/scale/centre only — the stage's
   * internal 1920x1080 geometry is untouched, so composition stays pixel-true.
   */
  bareCrop?: StageRect;
  /** Draw action-safe / title-safe / lower-third guide rectangles (debug + preview). */
  showSafeAreas?: boolean;
  children?: ReactNode;
}

function SafeAreaGuides() {
  return (
    <div className="gfx-safe-guides" aria-hidden>
      <div
        className="gfx-safe-rect gfx-safe-action"
        style={{ left: SAFE_ACTION.x, right: SAFE_ACTION.x, top: SAFE_ACTION.top, bottom: SAFE_ACTION.bottom }}
      >
        <span>ACTION SAFE</span>
      </div>
      <div
        className="gfx-safe-rect gfx-safe-title"
        style={{ left: SAFE_TITLE.x, right: SAFE_TITLE.x, top: SAFE_TITLE.top, bottom: SAFE_TITLE.bottom }}
      >
        <span>TITLE SAFE</span>
      </div>
      <div
        className="gfx-safe-rect gfx-safe-lower3"
        style={{ left: LOWER_THIRD_ZONE.x, right: LOWER_THIRD_ZONE.x, top: LOWER_THIRD_ZONE.top, bottom: LOWER_THIRD_ZONE.bottom }}
      >
        <span>LOWER THIRD</span>
      </div>
      <div className="gfx-safe-cross-v" />
      <div className="gfx-safe-cross-h" />
    </div>
  );
}

/**
 * Fixed 1920x1080 broadcast stage, scaled uniformly into its parent.
 * Shared by /output (transparent) and the control-surface preview
 * (simulated backdrop), so composition is pixel-true in both.
 */
export default function GraphicStage({ theme, backdrop = 'transparent', focus = 'full', bareCrop, showSafeAreas = false, children }: GraphicStageProps) {
  const { viewportRef, scale, offsetX, offsetY, width, height } = useStageScale<HTMLDivElement>();
  let transform: string;
  if (focus === 'lower-third-bare') {
    // Fit the crop rect into the viewport, centred. When the box's
    // aspect-ratio matches the crop's — TemplatePreview's bare frame sets
    // exactly that — the crop fills it edge-to-edge: no empty stage above the
    // graphic, no dead band below.
    const crop = bareCrop ?? LOWER_THIRD_BARE_FALLBACK;
    const fit = Math.min(width / crop.width, height / crop.height) || 0;
    const translateX = (width - crop.width * fit) / 2 - crop.x * fit;
    const translateY = (height - crop.height * fit) / 2 - crop.y * fit;
    transform = `translate(${translateX}px, ${translateY}px) scale(${fit})`;
  } else {
    const zoom = focus === 'lower-third' ? LOWER_THIRD_FOCUS.zoom : 1;
    const translateX = focus === 'lower-third' ? offsetX - LOWER_THIRD_FOCUS.panX * scale : offsetX;
    const translateY = focus === 'lower-third' ? offsetY - LOWER_THIRD_FOCUS.panY * scale : offsetY;
    transform = `translate(${translateX}px, ${translateY}px) scale(${scale * zoom})`;
  }

  return (
    <div ref={viewportRef} className={`gfx-viewport gfx-viewport--${focus}`}>
      {backdrop !== 'transparent' ? <div className={`gfx-backdrop gfx-backdrop-${backdrop}`} /> : null}
      <div
        className="gfx-stage"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform,
          ...themeToVars(theme)
        }}
      >
        {children}
        {showSafeAreas ? <SafeAreaGuides /> : null}
      </div>
    </div>
  );
}
