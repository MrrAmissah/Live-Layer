/**
 * How tall the dock's Program strip is allowed to be, and who decides.
 *
 * The strip is pinned on every tab, so its height is subtracted from every
 * other tab's usable area. On a short OBS dock that arithmetic is brutal: at
 * 420px the full strip plus header, tabs and margins leaves Quick Edit almost
 * nothing, and the first editable field lands below the fold — the tab that
 * exists for last-second corrections cannot make one without scrolling.
 *
 * PRECEDENCE. A preference must not be able to make a dock unusable:
 *
 *   short dock  → compact, whatever the preference says
 *   normal dock → the operator's preference decides
 *
 * HYSTERESIS. One threshold oscillates. The strip is inside the container being
 * measured, so switching to compact frees height, which can push the container
 * back over a single boundary, which restores the full strip, which takes the
 * height away again. Entering compact and leaving it therefore use different
 * numbers, and the gap between them is wider than the height the swap itself
 * recovers (194 − 167 = 27px).
 *
 * The numbers come from the measured layout rather than taste. Below the enter
 * threshold there is not enough room left for a tab to show a control after the
 * header (~56px), tab bar (~40px), strip and margins are taken; above the exit
 * threshold the full strip costs the operator nothing they notice.
 */
export type StripDensity = 'full' | 'compact';

export interface StripDensityState {
  density: StripDensity;
  /**
   * Why it is what it is. `short-dock` means the preference is being overridden
   * for usability and the operator should be told rather than left to wonder
   * why their toggle appears to do nothing.
   */
  reason: 'short-dock' | 'preference';
}

/** Below this the dock is too short to spend the full strip's height. */
export const COMPACT_ENTER_HEIGHT = 470;
/** Above this the full strip is affordable again. The gap is the hysteresis. */
export const COMPACT_EXIT_HEIGHT = 530;

export function resolveStripDensity(input: {
  /** Measured height of the dock container, or `null` before it is known. */
  dockHeight: number | null;
  /** The operator's persisted choice. */
  preferCompact: boolean;
  /** The density currently applied, so the band between the thresholds holds. */
  current?: StripDensity;
}): StripDensityState {
  const { dockHeight, preferCompact, current } = input;

  // Nothing measured yet (first paint, or no container): the preference is the
  // only information available, and it is honoured.
  if (dockHeight === null || !Number.isFinite(dockHeight)) {
    return { density: preferCompact ? 'compact' : 'full', reason: 'preference' };
  }

  if (dockHeight < COMPACT_ENTER_HEIGHT) {
    return { density: 'compact', reason: preferCompact ? 'preference' : 'short-dock' };
  }

  if (dockHeight >= COMPACT_EXIT_HEIGHT) {
    return { density: preferCompact ? 'compact' : 'full', reason: 'preference' };
  }

  /**
   * Inside the band. Whatever is on screen stays on screen — that is the whole
   * point of the hysteresis — unless the operator prefers compact, in which case
   * their choice already agrees with the smaller of the two and nothing moves.
   */
  if (preferCompact) return { density: 'compact', reason: 'preference' };
  if (current === 'compact') return { density: 'compact', reason: 'short-dock' };
  return { density: 'full', reason: 'preference' };
}

/** True when the dock is short enough that the preference is being overridden. */
export function isAutoCompact(state: StripDensityState): boolean {
  return state.density === 'compact' && state.reason === 'short-dock';
}
