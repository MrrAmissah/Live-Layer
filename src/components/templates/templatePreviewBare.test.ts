import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  STAGE_WIDTH,
  STAGE_HEIGHT,
  SAFE_ACTION,
  LOWER_THIRD_ZONE,
  LOWER_THIRD_FOCUS,
  LOWER_THIRD_CROP
} from '../graphics/stage';

/**
 * The bare preview frame (dock operator redesign, DRAFT/EDITING cards).
 *
 * The dock used to render the studio's full reference-monitor chrome — tally
 * rail, 16:9 screen, spec plate — around a lower third that occupies only the
 * bottom band of the stage, so at 255–440px dock widths the actual design was
 * a small element inside a mostly-empty rectangle. `frame="bare"` renders the
 * graphic and nothing else, in a box shaped to the focus crop itself.
 *
 * Three families of guarantee, asserted against source (node, no DOM) plus
 * the real exported constants:
 *
 *  1. BARE IS BARE. The bare path carries no monitor furniture and none of
 *     the monitor's cyan tint (retired from the dock in stage 1).
 *  2. THE STUDIO KEEPS ITS MONITOR. The default frame is unchanged, and the
 *     studio consumers never opt into bare.
 *  3. THE ASPECT IS DERIVED. The bare box's shape comes from LOWER_THIRD_CROP,
 *     which is itself computed from the focus zoom/pan against the stage
 *     constants — no magic number anywhere in the chain.
 */
const read = (path: string) => readFileSync(path, 'utf8');
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const preview = read('src/components/templates/TemplatePreview.tsx');
const stage = read('src/components/graphics/GraphicStage.tsx');
const stageConsts = read('src/components/graphics/stage.ts');
const css = read('src/styles.css');
const liveTab = read('src/components/control/DockLiveTab.tsx');
const editTab = read('src/components/control/DockQuickEditTab.tsx');
const previewPanel = read('src/components/control/PreviewPanel.tsx');
const editStep = read('src/components/control/steps/EditStep.tsx');

/** The BarePreview function body — the whole bare render path. */
const bare = /function BarePreview\([\s\S]*?\n\}/.exec(preview)?.[0] ?? '';
/** Everything the bare frame can emit: BarePreview + the frame === 'bare' return. */
const bareReturn = /if \(frame === 'bare'\) \{[\s\S]*?\n  \}/.exec(preview)?.[0] ?? '';

describe('bare is bare — the graphic and nothing else', () => {
  it('has a real bare path to assert against', () => {
    expect(bare).toContain('tpl-bare');
    expect(bareReturn).toContain('<GraphicStage');
    expect(liveTab).toContain('frame="bare"');
    expect(editTab).toContain('frame="bare"');
  });

  it('renders no monitor furniture on the bare path', () => {
    for (const chunk of [bare, bareReturn]) {
      const code = stripComments(chunk);
      // No bezel/rail/plate classes…
      expect(code).not.toContain('preview-monitor');
      expect(code).not.toContain('monitor-bezel');
      expect(code).not.toContain('monitor-screen');
      expect(code).not.toContain('monitor-spec');
      expect(code).not.toContain('monitor-tally');
      // …and none of the copy they carried.
      expect(code).not.toContain('PVW');
      expect(code).not.toContain('1920 ×');
    }
    // The bare frame also renders no toolbar and no footer strip.
    expect(stripComments(bareReturn)).not.toContain('showControls');
    expect(stripComments(bareReturn)).not.toContain('footer');
  });

  it('carries no cyan — the tint the dock retired lives on .preview-monitor::before only', () => {
    // The leak path was the monitor's ::before radial. Bare never mounts the
    // class (above); its own CSS must not reintroduce the colour either.
    const bareRules = [...css.matchAll(/^[^\n{}]*\.tpl-bare[^{}]*\{[^}]*\}/gm)].map((match) => match[0]);
    expect(bareRules.length).toBeGreaterThan(0);
    for (const rule of bareRules) {
      expect(rule).not.toContain('34, 211, 238');
      expect(rule).not.toContain('22d3ee');
    }
    expect(css).not.toContain('.tpl-bare::before');
    // The studio's copy of the tint is deliberately untouched.
    expect(css).toMatch(/\.preview-monitor::before\s*\{[^}]*rgba\(34, 211, 238/);
  });
});

describe('the studio keeps its monitor', () => {
  it('defaults frame to monitor, so existing call sites are unchanged', () => {
    expect(preview).toContain("frame = 'monitor'");
    // The monitor chrome is all still present for the default path.
    expect(preview).toContain('preview-monitor');
    expect(preview).toContain('Preview / PVW');
    expect(preview).toContain('1920 × 1080');
    expect(preview).toContain('monitor-spec--accent');
  });

  it('is never opted out of by the studio consumers', () => {
    expect(stripComments(previewPanel)).not.toContain('frame=');
    expect(stripComments(editStep)).not.toContain('frame=');
  });

  it('leaves the monitor focus transform on the same constants-backed math', () => {
    // The 16:9 monitor branch consumes LOWER_THIRD_FOCUS — the literals moved
    // to stage.ts, they did not change (guarded numerically below).
    expect(stage).toContain('LOWER_THIRD_FOCUS.zoom');
    expect(stage).toContain('LOWER_THIRD_FOCUS.panX');
    expect(stage).toContain('LOWER_THIRD_FOCUS.panY');
    expect(LOWER_THIRD_FOCUS).toEqual({ zoom: 1.38, panX: 40, panY: 520 });
    // No stray duplicate of the calibration numbers survives in the component.
    const stageCode = stripComments(stage);
    expect(stageCode).not.toContain('1.38');
    expect(stageCode).not.toMatch(/[^\w.]520[^\w]/);
  });
});

describe('the aspect is derived, not picked', () => {
  it('computes LOWER_THIRD_CROP from the zoom/pan and stage constants only', () => {
    // Source form: the crop object restates NO numeric literal.
    const cropSource = /export const LOWER_THIRD_CROP = \{[\s\S]*?\} as const;/.exec(stageConsts)?.[0] ?? '';
    expect(cropSource).toContain('LOWER_THIRD_FOCUS.zoom');
    expect(cropSource).toContain('STAGE_WIDTH');
    expect(cropSource).toContain('STAGE_HEIGHT');
    expect(stripComments(cropSource)).not.toMatch(/[0-9]/);
    // Value form: exactly the rect the monitor focus shows, clipped to the
    // stage bottom (the pan runs past y=1080; the stage overflow-hides there).
    expect(LOWER_THIRD_CROP.x).toBeCloseTo(LOWER_THIRD_FOCUS.panX / LOWER_THIRD_FOCUS.zoom, 10);
    expect(LOWER_THIRD_CROP.y).toBeCloseTo(LOWER_THIRD_FOCUS.panY / LOWER_THIRD_FOCUS.zoom, 10);
    expect(LOWER_THIRD_CROP.width).toBeCloseTo(STAGE_WIDTH / LOWER_THIRD_FOCUS.zoom, 10);
    expect(LOWER_THIRD_CROP.y + LOWER_THIRD_CROP.height).toBeCloseTo(STAGE_HEIGHT, 10);
    // ≈1.98:1 — meaningfully shorter than the 16:9 box it replaces.
    expect(LOWER_THIRD_CROP.width / LOWER_THIRD_CROP.height).toBeGreaterThan(16 / 9);
  });

  it('keeps the whole lower-third band, decorative allowance included, inside the crop', () => {
    // Text band: LOWER_THIRD_ZONE.top down to the title-safe bottom margin.
    expect(LOWER_THIRD_CROP.y).toBeLessThan(LOWER_THIRD_ZONE.top);
    expect(LOWER_THIRD_CROP.y + LOWER_THIRD_CROP.height).toBeGreaterThanOrEqual(STAGE_HEIGHT - LOWER_THIRD_ZONE.bottom);
    // Decorative geometry may extend to action safe — still inside.
    expect(LOWER_THIRD_CROP.y + LOWER_THIRD_CROP.height).toBeGreaterThanOrEqual(STAGE_HEIGHT - SAFE_ACTION.bottom);
  });

  it('shapes the bare box from the constants, with no aspect literal', () => {
    // Lower thirds take the crop's own shape; full-frame graphics keep the
    // stage's 16:9 because cards/banners/fullscreen genuinely use the frame.
    expect(bare).toContain('LOWER_THIRD_CROP.width');
    expect(bare).toContain('LOWER_THIRD_CROP.height');
    expect(bare).toContain('STAGE_WIDTH');
    expect(bare).toContain('STAGE_HEIGHT');
    expect(stripComments(bare)).not.toMatch(/aspectRatio[^;]*[0-9]/);
    expect(stripComments(bare)).not.toContain('16 / 9');
    // And GraphicStage's bare branch fits exactly that rect.
    expect(stage).toContain("focus === 'lower-third-bare'");
    expect(stage).toContain('LOWER_THIRD_CROP.width * fit');
    expect(stage).toContain('LOWER_THIRD_CROP.x * fit');
  });
});
