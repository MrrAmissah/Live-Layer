import { describe, expect, it } from 'vitest';
import { templateRegistry } from '../components/templates/registry';
import {
  SCRIPTURE_OUTPUT_SCREENS,
  readOutputScreen,
  screenRenders,
  scriptureLookFor,
  DEFAULT_SCRIPTURE_OUTPUTS,
  type ScriptureOutputScreen
} from './scriptureOutputs';
import { SCRIPTURE_TEMPLATE_ID } from './graphicReadiness';

/**
 * THE WHOLE MATRIX: every screen against every template.
 *
 * Asked for after "some lowerthird scriptures bleed into the main screen —
 * I thought we agreed on strict constraints on what can be shown where". The
 * individual rules were each tested; what was not, was the GRID they make. A
 * leak here is not a wrong pixel, it is a graphic appearing on a scene that was
 * composed on the assumption it could not — and nothing on the desk would show
 * it until it was on air.
 *
 * Written as a matrix rather than as cases so a new screen or a new template
 * joins it automatically. Adding either without deciding what it may carry
 * fails here.
 */
const SCREENS = SCRIPTURE_OUTPUT_SCREENS.map((screen) => screen.id);
const TEMPLATES = templateRegistry.map((template) => template.id);

describe('what each screen will carry', () => {
  it('covers every screen and every template, with nothing untested', () => {
    // A guard on the guard: if either list is empty the assertions below pass
    // vacuously and prove nothing.
    expect(SCREENS.length).toBeGreaterThanOrEqual(5);
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(7);
    expect(TEMPLATES).toContain(SCRIPTURE_TEMPLATE_ID);
  });

  it('lets MAIN carry everything, scripture included', () => {
    /**
     * Confirmed as the intended rule rather than a leak. Main is the full-frame
     * source and the one screen with no restriction — a verse over the live
     * camera is a thing this church does. What was actually wrong was that the
     * card sat inside the scene's ticker, which is a layout fix, not a scoping
     * one.
     */
    for (const template of TEMPLATES) {
      expect(screenRenders('main', template), `main / ${template}`).toBe(true);
    }
  });

  it('lets NO other screen carry anything but scripture', () => {
    const leaks: string[] = [];
    for (const screen of SCREENS) {
      if (screen === 'main') continue;
      for (const template of TEMPLATES) {
        const renders = screenRenders(screen, template);
        const shouldRender = template === SCRIPTURE_TEMPLATE_ID;
        if (renders !== shouldRender) leaks.push(`${screen} / ${template}: renders=${renders}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it('names exactly one screen as unrestricted', () => {
    // The rule in the operator's words: lower thirds and announcements are
    // "strict for the main screen". If a second screen ever becomes `all`, that
    // sentence stops being true and this fails.
    const unrestricted = SCRIPTURE_OUTPUT_SCREENS.filter((screen) => screen.scope === 'all');
    expect(unrestricted.map((screen) => screen.id)).toEqual(['main']);
  });
});

describe('the ?screen= contract, which is live in OBS', () => {
  it('reads every declared screen back from its own query', () => {
    for (const screen of SCRIPTURE_OUTPUT_SCREENS) {
      const query = screen.query ? `?relay=http://x:4174&${screen.query}` : '?relay=http://x:4174';
      expect(readOutputScreen(query), screen.id).toBe(screen.id);
    }
  });

  it('degrades an unknown or retired screen to main rather than to silence', () => {
    // `?screen=lower` was a real address before that screen was retired. An
    // overlay showing more than expected is visible and recoverable; one
    // silently drawing nothing is a mystery to debug mid-service.
    expect(readOutputScreen('?screen=lower')).toBe('main');
    expect(readOutputScreen('?screen=nonsense')).toBe('main');
  });
});

describe('what each screen makes a scripture card look like', () => {
  it('gives every screen a default that this build can actually render', () => {
    /**
     * A screen configured to a variant that no longer exists renders the
     * graphic's own look instead — silently. That is survivable but it means
     * the scene stops matching its plate, so every default is checked against
     * the registry rather than assumed.
     */
    const scripture = templateRegistry.find((entry) => entry.id === SCRIPTURE_TEMPLATE_ID)!;
    const known = new Set(scripture.variants!.map((variant) => variant.id));
    for (const screen of SCREENS as ScriptureOutputScreen[]) {
      const look = scriptureLookFor(screen, DEFAULT_SCRIPTURE_OUTPUTS);
      if (look !== null) expect(known, `${screen} → ${look}`).toContain(look);
    }
  });

  it('pairs each scene-shaped screen with the look drawn for its plate', () => {
    /**
     * The pairing that was wrong on air: `split` still defaulted to
     * `split-wide` after the wide SCENE was deleted, so the tall scene — tall
     * plates, portrait camera — was served a look drawn for a card, and the
     * verse sat pinned to the top of the column.
     */
    expect(scriptureLookFor('split', DEFAULT_SCRIPTURE_OUTPUTS)).toBe('split-tall');
    expect(scriptureLookFor('split-dual', DEFAULT_SCRIPTURE_OUTPUTS)).toBe('dual-well');
    expect(scriptureLookFor('house', DEFAULT_SCRIPTURE_OUTPUTS)).toBe('house-wall');
  });

  it('leaves the two full-frame screens on the operator’s own choice', () => {
    // `main` and `scripture` render whatever variant the graphic carries —
    // forcing one would make the library's variant picker a control with no
    // effect for scripture.
    expect(scriptureLookFor('main', DEFAULT_SCRIPTURE_OUTPUTS)).toBeNull();
    expect(scriptureLookFor('scripture', DEFAULT_SCRIPTURE_OUTPUTS)).toBeNull();
  });
});
