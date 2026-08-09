import { describe, expect, it } from 'vitest';
import { cropFromContent, sameRect } from './contentCrop';
import { BARE_MARGIN, BARE_MIN_CROP, STAGE_WIDTH, STAGE_HEIGHT, LOWER_THIRD_BARE_FALLBACK } from './stage';

/**
 * Pure geometry of the bare content fit (node, no DOM — the DOM walk itself
 * is guarded by source anchors in templatePreviewBare.test.ts and verified
 * in the browser QA pass).
 *
 * The operator's complaint this exists to keep fixed: at 440px the old
 * monitor-calibrated crop left the graphic 9% of the box height. The fill a
 * box of the crop's own aspect achieves is width-independent:
 * fill = contentH / cropH. These tests pin that arithmetic.
 */

/** A realistic single-plate lower third: ~800x116 sitting above the ticker line. */
const PLATE = { x: 108, y: 788, width: 800, height: 116 };

describe('cropFromContent — margin floor', () => {
  it('keeps BARE_MARGIN of breathing room on every side', () => {
    const crop = cropFromContent(PLATE);
    expect(crop.x).toBe(PLATE.x - BARE_MARGIN.x);
    expect(crop.y).toBe(PLATE.y - BARE_MARGIN.y);
    expect(crop.x + crop.width).toBe(PLATE.x + PLATE.width + BARE_MARGIN.x);
    expect(crop.y + crop.height).toBe(PLATE.y + PLATE.height + BARE_MARGIN.y);
    // The margin is a floor, not zero: the design must never sit flush.
    expect(BARE_MARGIN.x).toBeGreaterThan(0);
    expect(BARE_MARGIN.y).toBeGreaterThan(0);
  });

  it('holds the fill target: even the shortest shipped plate (58px role bar) fills ≥60% of the box height', () => {
    // fill = contentH / cropH, independent of box width — so this single
    // assertion is the 255/314/440/618 guarantee in one line.
    const short = cropFromContent({ ...PLATE, height: 58 });
    expect(58 / short.height).toBeGreaterThanOrEqual(0.6);
    // And the taller the design, the better it fills.
    expect(PLATE.height / cropFromContent(PLATE).height).toBeGreaterThanOrEqual(0.75);
  });

  it('returns integer edges — repeated measurement of unchanged content is a fixed point', () => {
    const crop = cropFromContent({ x: 108.4, y: 788.6, width: 799.7, height: 115.9 });
    for (const value of [crop.x, crop.y, crop.width, crop.height]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(sameRect(cropFromContent(PLATE), cropFromContent(PLATE))).toBe(true);
  });
});

describe('cropFromContent — floors and clamps', () => {
  it('refuses a degenerate crop: a sliver measurement still frames BARE_MIN_CROP', () => {
    // The floor is pinned against the stage itself, not restated from the
    // constant — a gutted BARE_MIN_CROP cannot vouch for its own mutation.
    expect(BARE_MIN_CROP.width).toBeGreaterThanOrEqual(STAGE_WIDTH / 4);
    expect(BARE_MIN_CROP.height).toBeGreaterThanOrEqual(STAGE_HEIGHT / 12);
    const crop = cropFromContent({ x: 900, y: 900, width: 40, height: 8 });
    expect(crop.width).toBeGreaterThanOrEqual(BARE_MIN_CROP.width);
    expect(crop.height).toBeGreaterThanOrEqual(BARE_MIN_CROP.height);
    // Expanded about the content, not anchored to a corner.
    expect(crop.x).toBeLessThan(900);
    expect(crop.x + crop.width).toBeGreaterThan(940);
  });

  it('clamps to the stage by shifting before shrinking', () => {
    // Content overhanging the frame bottom (strap logo at bottom: -20px
    // territory): the crop ends at the frame edge and keeps its size.
    const crop = cropFromContent({ x: 100, y: 1000, width: 1000, height: 70 });
    expect(crop.y + crop.height).toBe(STAGE_HEIGHT);
    expect(crop.height).toBe(70 + BARE_MARGIN.y * 2);
    // A right-edge overhang exercises the right clamp on its own (the wild
    // case below reaches it via the left branch, which would mask its loss).
    const rightEdge = cropFromContent({ x: 1800, y: 800, width: 200, height: 100 });
    expect(rightEdge.x + rightEdge.width).toBe(STAGE_WIDTH);
    expect(rightEdge.width).toBeGreaterThanOrEqual(200 + BARE_MARGIN.x * 2);
    // Fully wild input still lands inside the stage.
    const wild = cropFromContent({ x: -500, y: -500, width: 4000, height: 4000 });
    expect(wild.x).toBeGreaterThanOrEqual(0);
    expect(wild.y).toBeGreaterThanOrEqual(0);
    expect(wild.x + wild.width).toBeLessThanOrEqual(STAGE_WIDTH);
    expect(wild.y + wild.height).toBeLessThanOrEqual(STAGE_HEIGHT);
  });
});

describe('sameRect — the state guard', () => {
  it('is exact equality on all four fields', () => {
    expect(sameRect(PLATE, { ...PLATE })).toBe(true);
    expect(sameRect(PLATE, { ...PLATE, width: PLATE.width + 1 })).toBe(false);
    expect(sameRect(PLATE, { ...PLATE, y: PLATE.y - 1 })).toBe(false);
  });
});

describe('the fallback stays honest', () => {
  it('is itself a valid, stage-clamped crop wider than 16:9', () => {
    const f = LOWER_THIRD_BARE_FALLBACK;
    expect(f.x).toBeGreaterThanOrEqual(0);
    expect(f.y).toBeGreaterThanOrEqual(0);
    expect(f.x + f.width).toBeLessThanOrEqual(STAGE_WIDTH);
    expect(f.y + f.height).toBeLessThanOrEqual(STAGE_HEIGHT);
    expect(f.width / f.height).toBeGreaterThan(16 / 9);
  });
});
