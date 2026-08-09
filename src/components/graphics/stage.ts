import type { TemplateAnimation } from '../../types/graphics';

/**
 * Broadcast stage constants.
 *
 * All output graphics are authored in a fixed 1920x1080 coordinate space and
 * scaled uniformly to the viewport (letterboxed) by `GraphicStage`. Authoring
 * in absolute 1080p pixels means composition is identical at any OBS Browser
 * Source size and in the control-surface preview.
 */
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/**
 * Safe areas (in 1080p px, measured from the frame edge).
 *
 * Bottom margins are deliberately larger than classic SMPTE overscan values
 * because streaming platforms (YouTube/Facebook player chrome, captions)
 * occupy the bottom of the frame more aggressively than TV overscan does.
 *
 * - Action safe: nothing important is cropped/covered inside this region.
 *   Decorative geometry (bands, medallions) may extend up to this line.
 * - Title safe: all text and critical content stays inside this region.
 */
export const SAFE_ACTION = { x: 96, top: 54, bottom: 72 } as const;
export const SAFE_TITLE = { x: 160, top: 96, bottom: 120 } as const;

/**
 * Lower-third anchor zone (1080p px). The horizontal region where bottom-
 * anchored graphics (lower thirds, scripture bands, announcement banners)
 * are expected to sit. Drawn by the preview safe-area guides so an operator
 * can judge whether a graphic is landing in the right band. Left/right use
 * the title-safe inset; top is where the tallest band realistically begins.
 */
export const LOWER_THIRD_ZONE = { x: SAFE_TITLE.x, top: 720, bottom: SAFE_TITLE.bottom } as const;

/**
 * Preview-only lower-third focus (GraphicStage `focus="lower-third"`): the
 * preview zooms the stage and pans it left/up so the LOWER_THIRD_ZONE band
 * fills a 16:9 monitor screen. /output never applies this — it is a judging
 * aid, not part of the broadcast composition.
 */
export const LOWER_THIRD_FOCUS = { zoom: 1.38, panX: 40, panY: 520 } as const;

/** An axis-aligned rect in stage (1080p px) coordinates. */
export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Breathing margin (stage px) the bare preview keeps around the measured
 * graphic. The floor that stops the design sitting flush against the card
 * edge; it also absorbs what layout measurement cannot see (pseudo-element
 * caps, a few px of drop shadow). Deliberately small — the whole point of
 * the bare frame is that the design, not empty stage, fills the box.
 */
export const BARE_MARGIN = { x: 32, y: 16 } as const;

/**
 * Floor on the bare crop's size, derived from the stage. Guards against a
 * degenerate measurement (a sliver of underbar, a lone stripe) producing a
 * comically zoomed crop: the crop never frames less than a quarter of the
 * stage width or a twelfth of its height.
 */
export const BARE_MIN_CROP = {
  width: STAGE_WIDTH / 4,
  height: STAGE_HEIGHT / 12
} as const;

/**
 * The bare preview's starting/fallback crop for bottom-anchored graphics,
 * derived from LOWER_THIRD_ZONE — NOT from the monitor calibration above.
 * The monitor focus exists to give a 16:9 screen context and therefore shows
 * 343 stage-px of empty sky above the band; a frameless preview wants the
 * opposite, so its fallback frames the zone itself (margin allowance on the
 * sides, decorative allowance down to the frame edge). In practice the bare
 * preview measures the rendered graphic and fits THAT (contentCrop.ts); this
 * rect is what it shows before the first measurement and if measurement
 * ever fails.
 */
const bareFallbackInsetX = LOWER_THIRD_ZONE.x - BARE_MARGIN.x;
const bareFallbackTop = LOWER_THIRD_ZONE.top - BARE_MARGIN.y;
export const LOWER_THIRD_BARE_FALLBACK: StageRect = {
  x: bareFallbackInsetX,
  y: bareFallbackTop,
  width: STAGE_WIDTH - bareFallbackInsetX - bareFallbackInsetX,
  height: STAGE_HEIGHT - bareFallbackTop
} as const;

/**
 * Outro duration for graphics leaving the stage, in ms.
 * The CSS exit transition under `.gfx-layer[data-state='out']` uses the same
 * value (300ms); OutputPage unmounts after GFX_OUT_MS + a small buffer.
 * Keep these in sync if you change one.
 */
export const GFX_OUT_MS = 300;

/** Fallbacks when a graphic instance carries no theme colors. */
export const GFX_DEFAULT_BRAND = '#0E7C86';
export const GFX_DEFAULT_ACCENT_2 = '#E8B93C';

/**
 * Shipped motion behaviors. The schema's `TemplateAnimation` union is richer
 * (`in: fade|slide|grow`, `out: fade|slide|shrink`) but `/output` ships exactly
 * two: `slide` is the per-element build choreography (the production default),
 * `fade` is a flat whole-layer crossfade for conservative operators.
 */
export type AnimationVariant = 'slide' | 'fade';

/**
 * Collapse a template's animation definition + per-instance override into the
 * single token that drives the `data-anim` attribute. The `in` mode governs:
 * anything but `fade` resolves to the build. Default (no animation defined) is
 * the build, matching "slide = default" — and the CSS treats a missing
 * `data-anim` as slide too, so a graphic always animates.
 */
export function resolveAnimationVariant(
  animation?: TemplateAnimation,
  override?: Partial<TemplateAnimation>
): AnimationVariant {
  const inMode = override?.in ?? animation?.in;
  return inMode === 'fade' ? 'fade' : 'slide';
}
