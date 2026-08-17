/**
 * The convention strap picks its own plate.
 *
 * ## Why the plate moved into the graphic
 *
 * It was an OBS image source sitting UNDER Live Layer's output, and the variant
 * painted type only. That is right for the split-screen background — that plate
 * is up for a whole segment — and wrong for a lower third, because a lower third
 * is a TAKE. It comes up for a speaker and goes away. A static PNG layer cannot
 * come and go with it: either it sits on screen permanently with an empty plate
 * under nothing, or the operator toggles a second source by hand on every take.
 * Prince runs the desk alone.
 *
 * So the plate travels with the graphic. It appears and clears as one thing,
 * because it IS one thing.
 *
 * ## Why the width is chosen here rather than by the operator
 *
 * The artwork ships at three widths because a PNG cannot resize to the name.
 * While the plate lived in OBS, Live Layer could not see which one was loaded —
 * so the type had to be conservative, and a whole class of problems followed
 * from that blindness:
 *
 *   - discrete size tiers (62/56/47/42), because a continuous fit needs a width
 *     to fit TO;
 *   - a non-monotonic hole where a 34-character name overran a plate that a
 *     37-character name fitted, because the tiers stepped by character count and
 *     the overflow is by pixels;
 *   - a rule for the operator to remember mid-service.
 *
 * Fitting the name first and choosing the plate SECOND deletes all three. The
 * name can no longer overflow, because the plate is selected to hold whatever
 * the name measured. There is nothing to remember and nothing to toggle.
 */

export type StrapPlateId = 'compact' | 'standard' | 'wide';

export interface StrapPlate {
  id: StrapPlateId;
  src: string;
  /** Text width the plate leaves, from x=150. `plate width - 110` in the scene. */
  zone: number;
}

/**
 * Narrowest first — `fitStrapName` takes the first that holds the name, so the
 * plate always hugs it. Byte-identical copies of the Nine3 originals live in
 * `public/plates/`; Vite serves that at the root, and same-origin matters
 * because the output also runs from the LAN address.
 */
export const STRAP_PLATES: StrapPlate[] = [
  { id: 'compact', src: '/plates/theme-strap-compact.png', zone: 850 },
  { id: 'standard', src: '/plates/theme-strap-standard.png', zone: 1190 },
  { id: 'wide', src: '/plates/theme-strap-wide.png', zone: 1618 }
];

/** The scene's ceiling: `Math.min(62, fitSize(...))`. Fit DOWN from here, never up. */
export const STRAP_NAME_MAX_PX = 62;

/** The widest text the artwork can hold at all — the wide plate's zone. */
export const STRAP_MAX_ZONE = STRAP_PLATES[STRAP_PLATES.length - 1].zone;

export interface StrapFit {
  /** Rendered name size in px, never above `STRAP_NAME_MAX_PX`. */
  size: number;
  /** Rendered name width in px at that size. */
  width: number;
  plate: StrapPlate;
}

/**
 * Fit the name, then choose the plate that holds it.
 *
 * `naturalWidth` is the name measured at `STRAP_NAME_MAX_PX` — taken off a
 * hidden node in the real stylesheet rather than estimated, because the answer
 * has to agree with what the browser draws to the pixel.
 *
 * The proportion `size = MAX * zone / natural` is only valid because every bit
 * of the name's tracking is em-based (`-0.015em` base, `0.005em` on this
 * variant), so width scales linearly with size. The ROLE's tracking is 3.4px,
 * which does NOT scale — this formula must not be reused for it.
 */
export function fitStrapName(naturalWidth: number): StrapFit {
  /* A measurement can arrive as 0 before fonts resolve or if the node is not
     laid out. Falling through would divide by zero and pick a plate from NaN,
     so an unusable measurement renders at full size on the widest plate — the
     one that cannot clip — until a real number arrives. */
  if (!Number.isFinite(naturalWidth) || naturalWidth <= 0) {
    return { size: STRAP_NAME_MAX_PX, width: 0, plate: STRAP_PLATES[STRAP_PLATES.length - 1] };
  }

  const width = Math.min(naturalWidth, STRAP_MAX_ZONE);
  const size = width === naturalWidth
    ? STRAP_NAME_MAX_PX
    : /* Rounded DOWN to a hundredth: rounding up can re-cross the zone
         boundary the fit was computed to clear. */
      Math.floor((STRAP_NAME_MAX_PX * STRAP_MAX_ZONE) / naturalWidth * 100) / 100;

  const plate = STRAP_PLATES.find((candidate) => width <= candidate.zone) ?? STRAP_PLATES[STRAP_PLATES.length - 1];
  return { size, width, plate };
}
