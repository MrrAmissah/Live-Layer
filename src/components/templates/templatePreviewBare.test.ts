import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  STAGE_WIDTH,
  STAGE_HEIGHT,
  BARE_MARGIN,
  LOWER_THIRD_ZONE,
  LOWER_THIRD_FOCUS,
  LOWER_THIRD_BARE_FALLBACK
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
 *  3. THE CROP IS MEASURED OR DERIVED, NEVER PICKED. Lower thirds frame their
 *     own measured content (contentCrop.ts, layout geometry only); the
 *     fallback rect is computed from LOWER_THIRD_ZONE — NOT from the monitor
 *     calibration, whose 16:9 framing bakes ~340px of empty sky into the
 *     crop. No magic number anywhere in the chain, and /output never touches
 *     any of it.
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

describe('the crop is measured or derived, never picked', () => {
  const contentCrop = read('src/components/graphics/contentCrop.ts');
  const output = read('src/app/OutputPage.tsx');

  it('derives the fallback crop from LOWER_THIRD_ZONE, not the monitor calibration', () => {
    // Source form: the fallback restates NO numeric literal, and it never
    // consults LOWER_THIRD_FOCUS — the monitor's zoom/pan exists to fill a
    // 16:9 screen, which is exactly the framing the bare preview must escape.
    const fallbackSource =
      /const bareFallbackInsetX[\s\S]*?LOWER_THIRD_BARE_FALLBACK[\s\S]*?\} as const;/.exec(stageConsts)?.[0] ?? '';
    expect(fallbackSource).toContain('LOWER_THIRD_ZONE');
    expect(fallbackSource).toContain('BARE_MARGIN');
    expect(fallbackSource).toContain('STAGE_WIDTH');
    expect(fallbackSource).toContain('STAGE_HEIGHT');
    expect(fallbackSource).not.toContain('LOWER_THIRD_FOCUS');
    expect(stripComments(fallbackSource)).not.toMatch(/[0-9]/);
    // Value form: the zone band plus the breathing margin, down to the frame
    // edge (bottom overhangs are part of these designs), centred horizontally.
    expect(LOWER_THIRD_BARE_FALLBACK.x).toBe(LOWER_THIRD_ZONE.x - BARE_MARGIN.x);
    expect(LOWER_THIRD_BARE_FALLBACK.y).toBe(LOWER_THIRD_ZONE.top - BARE_MARGIN.y);
    expect(LOWER_THIRD_BARE_FALLBACK.x + LOWER_THIRD_BARE_FALLBACK.width).toBe(STAGE_WIDTH - LOWER_THIRD_BARE_FALLBACK.x);
    expect(LOWER_THIRD_BARE_FALLBACK.y + LOWER_THIRD_BARE_FALLBACK.height).toBe(STAGE_HEIGHT);
    // The monitor calibration's empty sky (stage y ≈ 377 → 720) is OUT: the
    // fallback starts no higher than the zone band minus its margin.
    expect(LOWER_THIRD_BARE_FALLBACK.y).toBeGreaterThanOrEqual(LOWER_THIRD_ZONE.top - BARE_MARGIN.y);
    expect(LOWER_THIRD_BARE_FALLBACK.width / LOWER_THIRD_BARE_FALLBACK.height).toBeGreaterThan(16 / 9);
  });

  it('measures layout geometry, never transformed boxes', () => {
    // Entrance animations are transform-driven; getBoundingClientRect read
    // mid-animation measures wherever the slide/mask happens to be. Offsets
    // describe the laid-out box and cannot lie during an entrance.
    for (const anchor of ['offsetLeft', 'offsetTop', 'offsetWidth', 'offsetHeight']) {
      expect(contentCrop).toContain(anchor);
    }
    expect(stripComments(contentCrop)).not.toContain('getBoundingClientRect');
    expect(stripComments(preview)).not.toContain('getBoundingClientRect');
    // Masked reveal helpers are intersected with their clipping wrapper, so a
    // pre-reveal negative offset can never stretch the union.
    expect(contentCrop).toContain('overflowX');
    expect(stripComments(contentCrop)).toContain('intersectionOf(rect, own)');
  });

  it('shapes the bare box from the measured crop, with no aspect literal', () => {
    // Lower thirds take the measured crop's own shape; full-frame graphics
    // keep the stage's 16:9 because cards/banners/fullscreen use the frame.
    expect(bare).toContain('crop.width');
    expect(bare).toContain('crop.height');
    expect(bare).toContain('STAGE_WIDTH');
    expect(bare).toContain('STAGE_HEIGHT');
    expect(stripComments(bare)).not.toMatch(/aspectRatio[^;]*[0-9]/);
    expect(stripComments(bare)).not.toContain('16 / 9');
    // Only the Lower Third family opts into the tight treatment.
    expect(preview).toContain("frame === 'bare' && isLowerThird");
    // GraphicStage's bare branch fits the measured rect, falling back to the
    // zone-derived constant — the monitor calibration cannot leak back in.
    const bareBranch = /if \(focus === 'lower-third-bare'\) \{[\s\S]*?\} else \{/.exec(stage)?.[0] ?? '';
    expect(bareBranch).toContain('bareCrop ?? LOWER_THIRD_BARE_FALLBACK');
    expect(bareBranch).toContain('crop.width * fit');
    expect(bareBranch).toContain('crop.x * fit');
    expect(bareBranch).not.toContain('LOWER_THIRD_FOCUS');
  });

  it('settles instead of twitching: debounced content re-fit behind an equality guard', () => {
    // The stage re-renders live per keystroke; only the FRAMING waits.
    expect(preview).toContain('BARE_REFIT_SETTLE_MS');
    expect(preview).toMatch(/setTimeout\(measure, BARE_REFIT_SETTLE_MS\)/);
    expect(preview).toContain('clearTimeout');
    // State can only change when the integer rect actually differs.
    expect(preview).toMatch(/sameRect\(prev, next\) \? prev : next/);
  });

  it('never reaches /output — the render path stays full-frame and unmeasured', () => {
    const outputCode = stripComments(output);
    expect(outputCode).toContain('<GraphicStage');
    expect(outputCode).not.toContain('focus');
    expect(outputCode).not.toContain('bareCrop');
    expect(outputCode).not.toContain('contentCrop');
    expect(outputCode).not.toContain('frame=');
  });
});
