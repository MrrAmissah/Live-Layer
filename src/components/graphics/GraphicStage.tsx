import type { ReactNode } from 'react';
import type { TemplateTheme } from '../../types/graphics';
import { useStageScale } from './useStageScale';
import { themeToVars } from './themeVars';
import { STAGE_WIDTH, STAGE_HEIGHT, SAFE_ACTION, SAFE_TITLE, LOWER_THIRD_ZONE } from './stage';

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
export default function GraphicStage({ theme, backdrop = 'transparent', showSafeAreas = false, children }: GraphicStageProps) {
  const { viewportRef, scale, offsetX, offsetY } = useStageScale<HTMLDivElement>();

  return (
    <div ref={viewportRef} className="gfx-viewport">
      {backdrop !== 'transparent' ? <div className={`gfx-backdrop gfx-backdrop-${backdrop}`} /> : null}
      <div
        className="gfx-stage"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
          ...themeToVars(theme)
        }}
      >
        {children}
        {showSafeAreas ? <SafeAreaGuides /> : null}
      </div>
    </div>
  );
}
