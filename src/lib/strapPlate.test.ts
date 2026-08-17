import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  STRAP_NAME_MAX_PX,
  STRAP_PLATES,
  STRAP_MAX_ZONE,
  STRAP_TEXT_LEFT,
  STRAP_TEXT_RIGHT_INSET,
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
    expect(fitStrapName(400).plate.id).toBe('compact');
    expect(fitStrapName(800).plate.id).toBe('standard');
    expect(fitStrapName(1100).plate.id).toBe('wide');
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

  it('grows the plate to hold a long ROLE, not just a long name', () => {
    /**
     * Measured on the rig before this existed: "Rev. Mensah" is 492px, picked
     * the compact plate, and an ordinary role row — "General Overseer ◆
     * Mathapoly Church International", 1009px — was cut to
     * "MATHAPOLY CHURCH INTE…" against an 850px zone.
     *
     * A SHORT name is exactly where a long title bites, because the plate got
     * small for a reason that has nothing to do with the title.
     */
    expect(fitStrapName(400).plate.id).toBe('compact');
    expect(fitStrapName(400, 860).plate.id).toBe('standard');
    expect(fitStrapName(400, 1200).plate.id).toBe('wide');
  });

  it('lets the role widen the plate but never resize the name', () => {
    // The name is the primary field and the thing that shrinks; the role only
    // ever gets a vote on WIDTH. A long role must not shrink the name.
    const alone = fitStrapName(800);
    const withRole = fitStrapName(800, 1200);
    expect(withRole.size).toBe(alone.size);
    expect(withRole.width).toBe(alone.width);
    expect(withRole.plate.id).not.toBe(alone.plate.id);
  });

  it('cannot be pushed past the widest plate by a role', () => {
    // Past 1618 no plate exists, so the role ellipsises — there is nothing else
    // it could do, and inventing a fourth width would mean artwork we do not have.
    expect(fitStrapName(400, 9000).plate.id).toBe('wide');
    expect(fitStrapName(400, Number.NaN).plate.id).toBe('compact');
    expect(fitStrapName(400, -50).plate.id).toBe('compact');
  });

  it('still holds the no-overflow guarantee with a role in play', () => {
    for (let name = 50; name <= 2400; name += 37) {
      for (const role of [0, 400, 1009, 1350, 1618, 2500]) {
        const fit = fitStrapName(name, role);
        expect(fit.width, `${name}/${role}`).toBeLessThanOrEqual(fit.plate.zone);
        expect(Math.min(role, STRAP_MAX_ZONE), `${name}/${role}`).toBeLessThanOrEqual(fit.plate.zone);
      }
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

  it('keeps zones inside the artwork that was actually exported', () => {
    /**
     * DECODED FROM THE PNGs, not derived from the scene source — and the two
     * disagree badly. The scene's numbers imply the plates end at x 1056 /
     * 1396 / 1824; the painted artwork ends at 862 / 1128 / 1461. Building to
     * the source put a full-width name 212px past the end of the standard
     * plate, onto open video.
     *
     * `scan.py`-style alpha scans of `public/plates/*.png` at the name row
     * produce these edges, and anyone can re-run them.
     */
    const artworkRight = { compact: 862, standard: 1128, wide: 1461 } as const;
    for (const plate of STRAP_PLATES) {
      const right = artworkRight[plate.id];
      expect(STRAP_TEXT_LEFT + plate.zone, plate.id).toBeLessThanOrEqual(right);
      // And not needlessly conservative: within the inset of the real edge.
      expect(STRAP_TEXT_LEFT + plate.zone + STRAP_TEXT_RIGHT_INSET, plate.id).toBe(right);
    }
  });

  it('fits down from the size the DESIGN uses, not the one the source names', () => {
    // The demo's own name renders 36px of cap height; 62px of Archivo gives
    // about 45, which is why our name sat a size too large inside artwork it is
    // supposed to live in.
    expect(STRAP_NAME_MAX_PX).toBe(50);
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
