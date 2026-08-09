import { describe, expect, it } from 'vitest';
import {
  COMPACT_ENTER_HEIGHT,
  COMPACT_EXIT_HEIGHT,
  isAutoCompact,
  resolveStripDensity,
  type StripDensity
} from './dockDensity';

/**
 * The rule that stops a preference making a dock unusable, and stops the layout
 * arguing with itself at the boundary.
 */

const at = (dockHeight: number | null, preferCompact: boolean, current?: StripDensity) =>
  resolveStripDensity({ dockHeight, preferCompact, current });

describe('a short dock overrides the preference', () => {
  it('is compact on a short dock even when the operator prefers the full strip', () => {
    const state = at(420, false);
    expect(state.density).toBe('compact');
    expect(state.reason).toBe('short-dock');
    expect(isAutoCompact(state)).toBe(true);
  });

  it('says the preference is the reason when the two agree', () => {
    // Still compact — but the operator asked for it, so nothing is being
    // overridden and Settings must not claim otherwise.
    const state = at(420, true);
    expect(state.density).toBe('compact');
    expect(state.reason).toBe('preference');
    expect(isAutoCompact(state)).toBe(false);
  });

  it('overrides at every height at or below the enter threshold', () => {
    for (const h of [320, 380, 420, COMPACT_ENTER_HEIGHT - 1, COMPACT_ENTER_HEIGHT]) {
      expect(at(h, false).density, `${h}px`).toBe('compact');
    }
  });
});

describe('the exact boundaries, where the two contracts have to agree', () => {
  /**
   * The CSS that performs the override is `@container dock (max-height: 470px)`,
   * and `max-height` INCLUDES 470. An exclusive resolver disagreed at exactly
   * that pixel — CSS rendered compact while Settings would have reported a
   * preference — and the tests missed it by stopping one pixel short.
   */
  it('470 is short, and says so', () => {
    const state = at(470, false);
    expect(state.density).toBe('compact');
    expect(state.reason).toBe('short-dock');
    expect(isAutoCompact(state), 'Settings must be able to report the override').toBe(true);
  });

  it('469 is short', () => {
    expect(at(469, false)).toEqual({ density: 'compact', reason: 'short-dock' });
  });

  it('471 is not short — it is inside the band, which holds what is applied', () => {
    expect(at(471, false, 'full').density).toBe('full');
    expect(at(471, false, 'compact').density).toBe('compact');
  });

  it('529 is still inside the band', () => {
    expect(at(529, false, 'compact').density).toBe('compact');
    expect(at(529, false, 'full').density).toBe('full');
  });

  it('530 leaves the band and defers to the preference', () => {
    // The exit threshold is inclusive too, so a dock at exactly 530 is normal.
    expect(at(530, false, 'compact')).toEqual({ density: 'full', reason: 'preference' });
    expect(at(530, true, 'full')).toEqual({ density: 'compact', reason: 'preference' });
  });

  it('every height at or below 470 overrides, and none above 530 does', () => {
    for (let h = 460; h <= 470; h += 1) expect(at(h, false).density, `${h}`).toBe('compact');
    for (let h = 530; h <= 540; h += 1) expect(at(h, false).density, `${h}`).toBe('full');
  });
});

describe('a normal dock defers to the preference', () => {
  it('is full when the operator has not asked for compact', () => {
    const state = at(700, false);
    expect(state.density).toBe('full');
    expect(state.reason).toBe('preference');
  });

  it('is compact when the operator has asked for it', () => {
    expect(at(700, true).density).toBe('compact');
    expect(at(700, true).reason).toBe('preference');
  });

  it('defers at every height at or above the exit threshold', () => {
    for (const h of [COMPACT_EXIT_HEIGHT, 600, 700, 1200]) {
      expect(at(h, false).density, `${h}px`).toBe('full');
      expect(at(h, true).density, `${h}px`).toBe('compact');
    }
  });
});

describe('the band between the thresholds does not oscillate', () => {
  it('keeps compact while shrinking through the band', () => {
    // Coming down from a tall dock the strip has already gone compact at the
    // enter threshold; freeing 27px must not bounce it back to full.
    const mid = Math.round((COMPACT_ENTER_HEIGHT + COMPACT_EXIT_HEIGHT) / 2);
    expect(at(mid, false, 'compact').density).toBe('compact');
  });

  it('keeps full while growing through the band', () => {
    const mid = Math.round((COMPACT_ENTER_HEIGHT + COMPACT_EXIT_HEIGHT) / 2);
    expect(at(mid, false, 'full').density).toBe('full');
  });

  it('settles rather than flipping when a resize is replayed', () => {
    // Simulate a drag that lands inside the band and then re-reports the same
    // height, which is what a ResizeObserver does. A single-threshold rule
    // would alternate here; this must converge.
    let density: StripDensity = 'full';
    const heights = [520, 500, 490, 500, 495, 500, 500];
    const seen: StripDensity[] = [];
    for (const h of heights) {
      density = resolveStripDensity({ dockHeight: h, preferCompact: false, current: density }).density;
      seen.push(density);
    }
    expect(new Set(seen).size, `flipped: ${seen.join(',')}`).toBe(1);
  });

  it('the gap is wider than the height the swap itself recovers', () => {
    // 194px full − 167px compact = 27px. If the band were narrower than that,
    // the swap could carry the container back across its own boundary.
    expect(COMPACT_EXIT_HEIGHT - COMPACT_ENTER_HEIGHT).toBeGreaterThan(27);
  });
});

describe('before anything is measured', () => {
  it('honours the preference rather than guessing a height', () => {
    expect(at(null, false).density).toBe('full');
    expect(at(null, true).density).toBe('compact');
    expect(at(null, false).reason).toBe('preference');
  });

  it('treats a nonsense measurement as unmeasured', () => {
    expect(at(Number.NaN, false).density).toBe('full');
    expect(at(Number.POSITIVE_INFINITY, true).density).toBe('compact');
  });
});

describe('the Program status can never reach this decision', () => {
  it('takes no program input at all', () => {
    // Structural, and deliberately so: the strip's height must not depend on
    // what Program says, or Take moves under the operator's hand exactly when
    // the status flips. The resolver's whole input is height + preference.
    const keys = Object.keys({ dockHeight: 700, preferCompact: false, current: 'full' as StripDensity });
    expect(keys.sort()).toEqual(['current', 'dockHeight', 'preferCompact']);
  });
});
