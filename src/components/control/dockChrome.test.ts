import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The dock's fixed-chrome budget (stage 2b).
 *
 * Measured problem: at 314×500 the pinned chrome (header + event block + tabs
 * + Program strip + footer) left the operator 24px of scroll area — 95% of the
 * dock was chrome. This suite turns the fix into a floor the build enforces:
 *
 *   scrollable ≥ 40% of dock height at 314×500.
 *
 * The suite runs in node with no DOM, so it cannot render and measure — but it
 * does not need to. Every fixed chrome row consumes a `--dock-*-h` variable
 * (asserted below, so the numbers cannot silently drift from the rules that
 * use them), the strip's internal rows are fixed heights (asserted below, so a
 * Program status change cannot re-derive the strip's size from its text), and
 * the budget is therefore computable from the stylesheet alone. The stage 2b
 * browser pass verifies the computed heights against rendered heights at 255,
 * 314, 440 and 618 wide across all four Program statuses.
 */
const css = readFileSync('src/styles.css', 'utf8');

const dockRoot = /\.control-root--dock\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const varPx = (name: string): number => {
  const match = new RegExp(`${name}: (\\d+)px`).exec(dockRoot);
  if (!match) throw new Error(`missing ${name} in .control-root--dock`);
  return Number(match[1]);
};

const header = varPx('--dock-header-h');
const tabbar = varPx('--dock-tabbar-h');
const strip = varPx('--dock-strip-h');
const stripCompact = varPx('--dock-strip-h-compact');
const stripMargin = varPx('--dock-strip-margin');
const footer = varPx('--dock-footer-h');

// Header and tab bar each carry a 1px bottom rule outside their border-box height.
const RULES = 2;
/** Fixed chrome above the scroll area, footer excluded (it hides on short docks). */
const chrome = header + tabbar + RULES + stripMargin + strip;

describe('the chrome variables are load-bearing', () => {
  it('every fixed row consumes its variable', () => {
    expect(css).toMatch(/\.dock-header\s*\{[^}]*height: var\(--dock-header-h\)/);
    expect(css).toMatch(/\.dock-tabbar\s*\{[^}]*height: var\(--dock-tabbar-h\)/);
    expect(css).toMatch(/\.dock-program\s*\{[^}]*min-height: var\(--dock-strip-h\)/);
    expect(css).toMatch(/\.dock-program--compact\s*\{[^}]*min-height: var\(--dock-strip-h-compact\)/);
    expect(css).toMatch(/\.dock-program\s*\{[^}]*margin: var\(--dock-strip-margin\) var\(--dock-strip-margin\) 0/);
    expect(css).toMatch(/\.dock-footer\s*\{[^}]*height: var\(--dock-footer-h\)/);
  });

  it('the strip cannot be resized by a status change — its text rows are fixed', () => {
    /**
     * The BOX is what holds the strip still: the head row and the identity block
     * carry hard heights, so no status sentence can grow the strip and move Take
     * out from under the hand reaching for it.
     */
    expect(css).toMatch(/\.dock-program__head\s*\{[^}]*[^-]height: 24px/);
    expect(css).toMatch(/\.dock-program__identity\s*\{[^}]*[^-]height: 74px/);

    /**
     * The TEXT ROWS reserve a ceiling, not a floor, and the column centres.
     *
     * They used to carry hard heights too, which held the strip still but left a
     * one-line title sitting at the top of a 38px box and a one-line subtitle at
     * the top of a 34px box — so the slack showed as gaps and "Ready / Rev.
     * Ishmael K. Awotwe / Preacher Lower Third" read as three separated lines.
     *
     * Asserted as `max-height` and paired with an absence check, because
     * `toMatch('height: 38px')` also matches `max-height: 38px` — the earlier
     * version of this test could not tell the two apart and passed either way.
     */
    expect(css).toMatch(/\.dock-program__title\s*\{[^}]*max-height: 38px/);
    expect(css).toMatch(/\.dock-program__sub\s*\{[^}]*max-height: 34px/);
    expect(css).not.toMatch(/\.dock-program__title\s*\{[^}]*[^-]height: 38px/);
    expect(css).not.toMatch(/\.dock-program__sub\s*\{[^}]*[^-]height: 34px/);
    expect(css).toMatch(/\.dock-program__text\s*\{[^}]*justify-content: center/);

    // The old grow-to-fit variant machinery is gone.
    expect(css).not.toContain('.dock-program--tall');
    expect(css).not.toContain('.dock-program__meta');
  });
});

describe('the 314×500 floor (the dock that had 24px of scroll)', () => {
  it('leaves the scroll area at least 40% of a 500px dock', () => {
    // Floor: 200px of scroll at 500px tall. Before stage 2b this dock offered
    // 24px. The footer is excluded because the next test proves it is hidden
    // at this height.
    expect(500 - chrome).toBeGreaterThanOrEqual(200);
  });

  it('hides the footer on short docks, and the header dot covers for it', () => {
    const hide = /@container dock \(max-height: (\d+)px\)\s*\{\s*\.control-root \.dock-footer \{ display: none; \}/.exec(css);
    expect(hide).not.toBeNull();
    const threshold = Number(hide![1]);
    // The footer must be out of the budget at 500 tall…
    expect(threshold).toBeGreaterThanOrEqual(500);
    // …and while visible it must never drag the scroll area below 40% either:
    // at every height above the threshold, h - (chrome + footer + rule) ≥ 0.4h.
    expect((threshold + 1) * 0.6).toBeGreaterThanOrEqual(chrome + footer + 1);
    // The header relay dot takes over at EXACTLY the complementary heights —
    // one transport readout visible at any height, never zero.
    const swap = /@container dock \(min-height: (\d+)px\)\s*\{\s*\.control-root \.dock-header__relay \{ display: none; \}/.exec(css);
    expect(swap).not.toBeNull();
    expect(Number(swap![1])).toBe(threshold + 1);
  });

  it('keeps the compact strip a saving, not a second full-size layout', () => {
    expect(stripCompact).toBeLessThan(strip);
  });

  it('reserves the third disclosure line below 290px instead of clipping it', () => {
    // The failed-send sentence needs a second line at 255px. The narrow band
    // grows the reserved sub row and the strip together — a disclosure is
    // never clipped to buy chrome back. (Stage 4B: three lines became two
    // because the sentences got shorter, not because the reservation was cut.)
    const narrow = /@container dock \(max-width: 290px\)\s*\{([\s\S]*?)\n\}/g;
    const bands = [...css.matchAll(narrow)].map((match) => match[1]).join('\n');
    // `max-height`, matching the fixed-box/ceiling-row split above: the strip's
    // 211px still holds, the row just stops adding slack when the text is short.
    expect(bands).toMatch(/\.dock-program__sub \{ max-height: 34px; -webkit-line-clamp: 2; \}/);
    expect(bands).toMatch(/\.dock-program \{ min-height: 193px; \}/);
    // The reserved third line costs this band 17px, taking a 255×500 dock to
    // 38.6% scroll — deliberately below the 40% floor rather than clipping a
    // disclosure to hit a ratio. 190px is the honest floor for this band.
    expect(500 - (header + tabbar + RULES + stripMargin + 211)).toBeGreaterThanOrEqual(190);
  });
});
