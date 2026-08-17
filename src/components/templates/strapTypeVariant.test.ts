import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { templateRegistry } from './registry';
import { graphicPacks, packVariantIdsFor } from '../../lib/packs';

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

  it('is REACHABLE on the pack the convention actually runs on', () => {
    /**
     * THE FAULT THIS FILE MISSED, and the reason it is worth its own case.
     *
     * "Is offered on the preacher lower third" above passed the whole time,
     * because it asks the REGISTRY. The operator does not see the registry: a
     * pack's `variantChoices` REPLACES the picker's list rather than leading it,
     * and this variant was in no pack at all. So on PPC '26 — the pack this
     * convention runs on — the one look drawn for the convention's own strap
     * artwork was absent from the carousel AND from "Browse all variants",
     * which browses the same curated list. It read as never having been built.
     *
     * Asserted through `packVariantIdsFor`, the function the picker calls, so
     * this cannot pass while the picker disagrees.
     */
    expect(packVariantIdsFor('ppc-2026', 'preacher-lower-third')).toContain('strap-type');
  });

  it('leaves every pack’s curated list pointing at variants that exist', () => {
    /**
     * A curated id with no registry entry is dropped silently by the picker's
     * `.map().filter(Boolean)` — so a typo here removes a look from the pack and
     * nothing anywhere says so. General because the trap is general, not
     * specific to this variant.
     */
    const known = new Map(templateRegistry.map((template) => [template.id, new Set(template.variants?.map((v) => v.id) ?? [])]));
    const dangling: string[] = [];
    for (const pack of graphicPacks) {
      for (const [templateId, ids] of Object.entries(pack.variantChoices ?? {})) {
        for (const id of ids) {
          if (!known.get(templateId)?.has(id)) dangling.push(`${pack.id}/${templateId}/${id}`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  it('leaves no preacher variant off the convention pack by accident', () => {
    /**
     * THE GUARD THAT POINTS THE RIGHT WAY.
     *
     * The dangling-id test above checks curated → registry. The fault actually
     * shipped — twice — is the other direction: a variant added to the REGISTRY
     * and to no pack. It is invisible on the pack the convention runs on, and
     * every other test in this file passes while it is.
     *
     * So every preacher variant the PPC '26 picker does NOT offer has to be
     * named here with a reason. Adding a variant and forgetting the pack fails
     * this; adding one and deciding it does not belong takes one line. The
     * point is that it becomes a decision instead of an omission.
     */
    const withheld: Record<string, string> = {
      'angled-accent': 'House look. The pack leads with the four that get reached for.',
      'signature-medallion': 'House look.',
      'clean-broadcast': 'House look.',
      'bold-plate': 'House look.',
      'event-style': 'House look.',
      'subtle-elegance': 'House look.',
      'canva-host-bar': 'Sample set, kept for the House pack.',
      'canva-celebration': 'Sample set, kept for the House pack.',
      'canva-ministry': 'Sample set, kept for the House pack.',
      'headshot-band':
        'Built from a collected reference sheet, not from convention artwork, and its teal/yellow palette is not the royal PPC one. Offered on House Style until Prince says whether it stays at all.'
    };
    const preacher = templateRegistry.find((t) => t.id === 'preacher-lower-third')!;
    const offered = new Set(packVariantIdsFor('ppc-2026', 'preacher-lower-third'));
    const unexplained = preacher
      .variants!.map((v) => v.id)
      .filter((id) => !offered.has(id) && !withheld[id]);
    expect(unexplained).toEqual([]);
    // And no stale entries: a reason for a variant that IS offered, or for one
    // that no longer exists, is a note nobody will trust.
    const known = new Set(preacher.variants!.map((v) => v.id));
    for (const id of Object.keys(withheld)) {
      expect(known, id).toContain(id);
      expect(offered.has(id), `${id} is offered — drop its withheld note`).toBe(false);
    }
  });

  it('is told apart from the strap that paints its own plate', () => {
    /**
     * The two sit side by side in the convention pack and the choice between
     * them is the whole question — one expects the Nine3 image underneath, the
     * other draws a plate and would stack a card inside a card on top of it.
     * Two entries both reading "strap" with nothing separating them is how an
     * operator picks the wrong one under pressure.
     */
    const preacher = templateRegistry.find((t) => t.id === 'preacher-lower-third')!;
    const typeOnly = preacher.variants!.find((v) => v.id === 'strap-type')!;
    const painted = preacher.variants!.find((v) => v.id === 'convention-strap')!;
    expect(typeOnly.name).not.toBe(painted.name);
    // The operator searches for the ARTWORK's name, which is what Nine3 calls it.
    expect(`${typeOnly.name} ${typeOnly.description}`.toLowerCase()).toContain('theme strap');
    expect(painted.description.toLowerCase()).toContain('own plate');
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
      'l3-end-slab', 'l3-medallion', 'l3-strap-logo'
    ]) {
      expect(block, furniture).toContain(`.gfx-l3[data-variant='strap-type'] .${furniture}`);
    }
  });

  it('keeps the ◆ between role and church, because the artwork has one', () => {
    /**
     * It was hidden with the furniture, which was consistent and wrong: the
     * strap's own demo render reads "LEAD PASTOR ◆ ANNUAL PPC '26". A separator
     * drawn INTO the design is not a plate this variant would be duplicating,
     * and without it the two halves of the role row run together.
     */
    expect(block).toContain(".gfx-l3[data-variant='strap-type'] .l3-role-divider");
    expect(rules).not.toMatch(/l3-role-divider[^{]*\{[^}]*display: none/);
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

  it('caps the name at the WIDEST zone the artwork offers', () => {
    /**
     * 1618 = the wide plate's 1728 minus the 110 of padding the scene's own
     * `fitSize` call subtracts. Earlier this was 1578, which came from measuring
     * to the plate's right EDGE and ignoring that the artwork keeps 56px of
     * inset there — 40px adrift, in the safe direction, but not the contract.
     */
    expect(block).toContain('max-width: 1618px');
  });

  it('caps the role row at the NARROWEST zone, so it cannot leave any plate', () => {
    /**
     * The bug that put type on open video. Capped with the name at the wide
     * zone, the role row — role + church + event on one line — measured 1562px,
     * sat happily inside that cap, and ran clean past the end of the standard
     * plate.
     *
     * Two caps, because the two rows are chosen by different things: the
     * operator picks the plate to suit the NAME, so the name may use the widest
     * zone. Nothing about the role row enters that decision, so it gets the
     * narrowest and ellipsises instead.
     */
    expect(block).toMatch(/l3-role-line \{[^}]*max-width: 850px/);
    expect(block).toMatch(/l3-role-mask \{[^}]*max-width: 850px/);
  });

  it('centres both rows on the artwork’s y values rather than sitting them on it', () => {
    /**
     * The scene draws both lines with `baseline: 'middle'` at
     * `y + h*0.40` = 786 and `y + h*0.74` = 837. The brief calls those
     * "baselines"; building to that literally would drop both lines by about
     * half a cap-height inside a zone with 7px of air between them.
     *
     * 60 and 111 are those y values relative to the zone's own top of 726.
     * Measured back off the page at 786 and 836.
     */
    expect(block).toMatch(/l3-mask:not\(\.l3-role-mask\) \{[^}]*top: 60px/);
    expect(block).toMatch(/l3-role-mask \{[^}]*top: 111px/);
    expect(block).toMatch(/translateY\(-50%\)/);
  });

  it('sets the role in white at 80%, tracked in pixels', () => {
    /**
     * `rgba(hexToRgb(C.paper), 0.80)` in the scene, and `paper` is `#FFFFFF` in
     * `brand/theme.json`. It was gold here, which read as a convention accent
     * and is not what the plate's own demo draws.
     *
     * Tracking is 3.4 CANVAS PIXELS at 26px. It was `0.05em`, which lands at
     * 1.3px — a third of the design's.
     */
    expect(block).toMatch(/color: rgba\(255, 255, 255, 0\.8\)/);
    expect(block).toMatch(/letter-spacing: 3\.4px/);
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
