import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  STRAP_NAME_MAX_PX,
  STRAP_PLATES,
  STRAP_MAX_ZONE,
  fitStrapName
} from './strapPlate';

/**
 * FIT THE NAME, THEN CHOOSE THE PLATE — in that order, which is the whole idea.
 *
 * The strap artwork ships at three widths because a PNG cannot resize. While it
 * lived in an OBS source under the output, Live Layer could not see which one
 * was loaded and had to be conservative about it; choosing the plate here
 * removes the blindness and everything that was built to work around it.
 */
describe('fitting the name', () => {
  it('leaves a name that fits at full size alone', () => {
    const fit = fitStrapName(492);
    expect(fit.size).toBe(STRAP_NAME_MAX_PX);
    expect(fit.width).toBe(492);
  });

  it('fits DOWN, never up', () => {
    // 62 is a ceiling in the scene (`Math.min(62, fitSize(...))`), not a target.
    // A short name scaled UP to fill the plate would be a different design.
    for (const natural of [40, 120, 492, 933, 1617]) {
      expect(fitStrapName(natural).size, String(natural)).toBeLessThanOrEqual(STRAP_NAME_MAX_PX);
    }
  });

  it('shrinks a name too wide for even the widest plate, to exactly that plate', () => {
    const fit = fitStrapName(2400);
    expect(fit.size).toBeLessThan(STRAP_NAME_MAX_PX);
    expect(fit.width).toBe(STRAP_MAX_ZONE);
    expect(fit.plate.id).toBe('wide');
    // The proportion is only valid because the name's tracking is em-based, so
    // width scales linearly with size: 62 * 1618/2400.
    expect(fit.size).toBeCloseTo((STRAP_NAME_MAX_PX * STRAP_MAX_ZONE) / 2400, 1);
  });

  it('never rounds the fitted size UP past the zone it was computed to clear', () => {
    /**
     * Rounding up can re-cross the boundary the fit just cleared: at 1618.4px
     * of zone the name would render one hundredth larger than measured and end
     * outside the artwork. Down is the only safe direction.
     */
    for (const natural of [1619, 1700, 1823, 2000, 2400, 3111]) {
      const fit = fitStrapName(natural);
      const rendered = natural * (fit.size / STRAP_NAME_MAX_PX);
      expect(rendered, String(natural)).toBeLessThanOrEqual(STRAP_MAX_ZONE);
    }
  });
});

describe('choosing the plate', () => {
  it('takes the narrowest plate that holds the name, so it hugs', () => {
    // The three widths exist so the plate fits the speaker. Always picking the
    // widest would leave a long empty stretch after "Rev. Mensah", which is the
    // reason the artwork is not one plate.
    expect(fitStrapName(492).plate.id).toBe('compact');
    expect(fitStrapName(933).plate.id).toBe('standard');
    expect(fitStrapName(1400).plate.id).toBe('wide');
  });

  it('holds exactly at each boundary', () => {
    for (const plate of STRAP_PLATES) {
      expect(fitStrapName(plate.zone).plate.id, `${plate.id} at ${plate.zone}`).toBe(plate.id);
      expect(fitStrapName(plate.zone + 1).plate.zone, `${plate.id} + 1px`).toBeGreaterThanOrEqual(plate.zone);
    }
  });

  it('makes the non-monotonic hole IMPOSSIBLE, not merely tested for', () => {
    /**
     * THE DEFECT THIS DESIGN DELETES.
     *
     * With character-count tiers, a 34-character name sat at the top of one
     * tier and overran the standard plate by 49px while a LONGER 37-character
     * name, one tier down, fitted. Overflow is by pixels; the tiers stepped by
     * characters; the two disagreed.
     *
     * Now the plate is chosen AFTER the fit, so the rendered name is never
     * wider than the plate it is on — for any width, in any order.
     */
    for (let natural = 50; natural <= 3000; natural += 7) {
      const fit = fitStrapName(natural);
      expect(fit.width, `natural ${natural}`).toBeLessThanOrEqual(fit.plate.zone);
    }
  });

  it('survives a measurement that has not arrived', () => {
    // Zero before fonts resolve, or if the node is not laid out. Dividing by it
    // would pick a plate from NaN; the widest cannot clip, so it is the answer
    // until a real number lands.
    for (const bad of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const fit = fitStrapName(bad);
      expect(fit.plate.id, String(bad)).toBe('wide');
      expect(fit.size).toBe(STRAP_NAME_MAX_PX);
    }
  });
});

describe('the plates it points at', () => {
  const css = readFileSync('src/styles.css', 'utf8');

  it('ships every plate it can select, at the path Vite serves', () => {
    /**
     * A missing plate is a lower third with no background at all, and it would
     * only show at the moment a particular name selected it. Checked as files
     * on disk rather than as strings.
     */
    for (const plate of STRAP_PLATES) {
      expect(plate.src.startsWith('/plates/'), plate.id).toBe(true);
      expect(() => readFileSync(`public${plate.src}`), plate.id).not.toThrow();
    }
  });

  it('keeps zones matching the artwork’s own arithmetic', () => {
    // The scene fits to `plate width - 110`, and the three plates are rendered
    // at nw 960 / 1300 / 1728.
    expect(STRAP_PLATES.map((plate) => plate.zone)).toEqual([960 - 110, 1300 - 110, 1728 - 110]);
  });

  it('has no size tiers left to disagree with the fit', () => {
    /**
     * Asserting their ABSENCE, not their values. Tiers plus an inline
     * `font-size` are two mechanisms at different specificities, which is how a
     * name got hard-cut mid-word twice. The fit is continuous now; there is
     * nothing for a tier to add.
     */
    for (const tier of ['l3-name-md', 'l3-name-sm', 'l3-name-xs', 'l3-name-lg']) {
      expect(css, tier).not.toContain(`.gfx-l3[data-variant='strap-type'] .l3-name.${tier}`);
    }
  });
});
