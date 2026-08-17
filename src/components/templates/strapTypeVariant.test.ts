import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { templateRegistry } from './registry';

/**
 * TYPE ONLY — the plate lives in OBS, not here.
 *
 * The convention's lower-third background is a Nine3 image source sitting UNDER
 * this output. Every other variant paints its own plate, so on top of that
 * strap they stack: an opaque card inside a card, the same fault the scripture
 * split screens had. This variant paints nothing and positions type inside the
 * strap's name zone.
 *
 * Asserted against source because the rules are CSS, and this repo's vitest has
 * no DOM. The look itself was judged from screenshots composited over the real
 * `theme-strap-standard.png` and `theme-strap-wide.png`.
 */
const css = readFileSync('src/styles.css', 'utf8');
// From the comment's OPENER, not from its text: slicing mid-comment leaves an
// unmatched `/*`, so the strip below pairs the wrong delimiters and the prose
// survives — which is how this test first read its own explanation as a usage.
const block = css.slice(css.indexOf('/* --- strap type-only'), css.indexOf('/* Quick take:'));
/** Rules only. The prose explains why `--gfx-safe-*` is NOT used, and a naive
 *  substring check on the whole block reads that explanation as a usage. */
const rules = block.replace(/\/\*[\s\S]*?\*\//g, '');

describe('the variant exists and is additive', () => {
  it('is offered on the preacher lower third', () => {
    const preacher = templateRegistry.find((t) => t.id === 'preacher-lower-third')!;
    expect(preacher.variants?.map((v) => v.id)).toContain('strap-type');
  });

  it('leaves all thirteen existing variants exactly as they were', () => {
    /**
     * The brief is explicit that this is additive. A variant list that LOST one
     * while gaining another would strand every saved graphic and rundown item
     * carrying the missing id.
     *
     * The ORIGINALS are named and the list is only required to have grown. This
     * asserted an exact length of 14 and failed the moment a fifteenth variant
     * was added — telling me a number had changed rather than whether anything
     * was lost, which is the only thing this test is for.
     */
    const preacher = templateRegistry.find((t) => t.id === 'preacher-lower-third')!;
    const ids = preacher.variants!.map((v) => v.id);
    const originals = [
      'modern-minimal', 'soft-broadcast', 'angled-accent', 'signature-medallion',
      'clean-broadcast', 'bold-plate', 'split-bar', 'event-style', 'subtle-elegance',
      'canva-host-bar', 'canva-celebration', 'canva-ministry', 'convention-strap'
    ];
    for (const existing of originals) {
      expect(ids, existing).toContain(existing);
    }
    expect(ids).toContain('strap-type');
    expect(ids.length).toBeGreaterThan(originals.length);
    // No duplicates: two entries with one id is a picker that shows a look twice.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is not offered on the performer lower third', () => {
    // The strap artwork is the preacher's. Offering it elsewhere would put type
    // on a background that is not there.
    const performer = templateRegistry.find((t) => t.id === 'performer-lower-third')!;
    expect(performer.variants?.map((v) => v.id)).not.toContain('strap-type');
  });

  it('says in its own description that it needs the strap underneath', () => {
    // It is only correct with that image source present, so the picker says so
    // rather than offering it as a general-purpose look.
    const preacher = templateRegistry.find((t) => t.id === 'preacher-lower-third')!;
    const variant = preacher.variants!.find((v) => v.id === 'strap-type')!;
    expect(variant.description).toMatch(/NO plate|no plate/);
    expect(variant.description).toMatch(/strap/i);
  });
});

describe('it paints nothing', () => {
  it('hides every piece of furniture the renderer can draw', () => {
    /**
     * Listed one per line in the CSS rather than as a wildcard, so a NEW piece
     * of furniture added to `PreacherLowerThird` shows up here as an omission
     * instead of being silently hidden — which would be the harder bug, because
     * it would only appear on one variant.
     */
    for (const furniture of [
      'l3-underbar', 'l3-symbol-block', 'l3-stripe', 'l3-cap',
      'l3-end-slab', 'l3-medallion', 'l3-role-divider', 'l3-strap-logo'
    ]) {
      expect(block, furniture).toContain(`.gfx-l3[data-variant='strap-type'] .${furniture}`);
    }
  });

  it('makes both plates transparent rather than merely small', () => {
    expect(block).toMatch(/background: transparent !important/);
    expect(block).toMatch(/clip-path: none !important/);
  });
});

describe('it is pinned to the artwork, not to the safe area', () => {
  it('positions absolutely from the stage origin', () => {
    /**
     * `x 150, y 726` is a position in the strap PNG. Using `--gfx-safe-*` would
     * move the type when the layout's safe-margin setting changed, sliding the
     * name off a background that cannot move with it.
     */
    expect(rules).toMatch(/left: 150px/);
    expect(rules).toMatch(/top: 726px/);
    expect(rules).not.toMatch(/--gfx-safe-/);
  });

  it('resists the center and full layout overrides', () => {
    expect(block).toContain("data-position='center'");
    expect(block).toContain("data-position='full'");
  });

  it('caps at the WIDEST strap’s zone, measured from the artwork', () => {
    /**
     * 1578, not the brief's 1674 — that number belongs to a single-width strap
     * that was never built. Three PNGs exist (compact, standard, wide) and the
     * operator swaps between them, so the cap has to be the widest of the three
     * or a long name runs off the end of the artwork onto the camera.
     */
    expect(block).toContain('max-width: 1578px');
  });

  it('keeps the content-fitted step-down working', () => {
    /**
     * A flat `font-size: 62px` at this specificity overrode `l3-name-md/sm/xs`
     * entirely, and the longest name rendered full size and ran past the end of
     * the strap. Caught by compositing over the real artwork rather than by
     * reading the CSS.
     */
    expect(block).toMatch(/l3-name-md \{ font-size/);
    expect(block).toMatch(/l3-name-sm \{ font-size/);
    expect(block).toMatch(/l3-name-xs \{ font-size/);
  });
});
