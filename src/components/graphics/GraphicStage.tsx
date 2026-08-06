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
  LOWER_THIRD_CROP
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
   * shows the SAME visible rect (LOWER_THIRD_CROP) fitted edge-to-edge into a
   * box of the crop's own aspect — for frameless previews with no dead space.
   */
  focus?: 'full' | 'lower-third' | 'lower-third-bare';
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
export default function GraphicStage({ theme, backdrop = 'transparent', focus = 'full', showSafeAreas = false, children }: GraphicStageProps) {
  const { viewportRef, scale, offsetX, offsetY, width, height } = useStageScale<HTMLDivElement>();
  let transform: string;
  if (focus === 'lower-third-bare') {
    // Fit LOWER_THIRD_CROP (the exact rect the monitor's zoom+pan shows) into
    // the viewport, centred. When the box's aspect-ratio matches the crop's —
    // TemplatePreview's bare frame sets exactly that — the crop fills it
    // edge-to-edge: no bezel band above, no dead sub-stage band below.
    const fit = Math.min(width / LOWER_THIRD_CROP.width, height / LOWER_THIRD_CROP.height) || 0;
    const translateX = (width - LOWER_THIRD_CROP.width * fit) / 2 - LOWER_THIRD_CROP.x * fit;
    const translateY = (height - LOWER_THIRD_CROP.height * fit) / 2 - LOWER_THIRD_CROP.y * fit;
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
