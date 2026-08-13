import { describe, expect, it } from 'vitest';
import {
  OUTPUT_FORGET_MS,
  OUTPUT_STALE_MS,
  outputPresence,
  outputForScreen,
  stalledOutputs,
  worstOutput
} from './outputPresence';
import type { OutputStatusMap, OutputStatusState } from '../types/program';

const NOW = 1_700_000_000_000;

const screen = (outputId: string, over: Partial<OutputStatusState> = {}): OutputStatusState => ({
  outputId,
  sourceActive: true,
  sourceVisible: true,
  lastSeenAt: NOW,
  screen: null,
  failure: null,
  ...over
});

const rig = (...screens: OutputStatusState[]): OutputStatusMap =>
  Object.fromEntries(screens.map((s) => [s.outputId, s]));

/**
 * Presence across SEVERAL screens.
 *
 * LiveLayer used to hold exactly one output reading, which quietly assumed a rig
 * has exactly one browser source. Scripture Outputs makes a second source
 * ordinary — a split-screen plate alongside the full-frame one — and with a
 * single slot the two overwrote each other every few seconds: the desk reported
 * whichever screen had spoken most recently instead of whether both were up.
 *
 * `outputPresence` still takes ONE status and a clock. Everything here is about
 * what the caller does with several of them.
 */
describe('one screen at a time', () => {
  it('still reads a single status exactly as before', () => {
    expect(outputPresence(null, NOW)).toBe('unknown');
    expect(outputPresence(screen('a'), NOW)).toBe('fresh');
    expect(outputPresence(screen('a', { lastSeenAt: NOW - OUTPUT_STALE_MS - 1 }), NOW)).toBe('stale');
  });
});

describe('presence across the whole rig', () => {
  it('names a screen that has gone quiet, whatever the pill decides', () => {
    // `stalledOutputs` is the "which screen stopped" answer, and it is separate
    // from the pill's "is it on air" answer on purpose — see the pill tests
    // below, where a quiet OFF-AIR screen deliberately stops speaking for the
    // rig. Losing it here would put that failure back into silence.
    const outputs = rig(screen('a'), screen('b', { lastSeenAt: NOW - OUTPUT_STALE_MS - 1 }));
    expect(stalledOutputs(outputs, NOW).map((s) => s.outputId)).toEqual(['b']);
  });

  it('does not name a session that a fresher one has already replaced', () => {
    // The aftermath of every OBS restart: each source reloads with a new
    // session id and the old one lingers for OUTPUT_FORGET_MS. Naming it would
    // warn about a screen that is working, every single restart.
    const outputs = rig(
      screen('old-session', { screen: 'split', lastSeenAt: NOW - OUTPUT_STALE_MS - 1 }),
      screen('new-session', { screen: 'split', lastSeenAt: NOW })
    );
    expect(stalledOutputs(outputs, NOW)).toEqual([]);
  });

  it('still names a quiet session that nothing has replaced', () => {
    const outputs = rig(
      screen('gone', { screen: 'split', lastSeenAt: NOW - OUTPUT_STALE_MS - 1 }),
      screen('other', { screen: 'main', lastSeenAt: NOW })
    );
    expect(stalledOutputs(outputs, NOW).map((s) => s.outputId)).toEqual(['gone']);
  });

  it('still names a quiet session that never said which screen it was', () => {
    // Unmatchable, so unreplaceable — and unidentified plus quiet is genuinely
    // worth a look.
    const outputs = rig(
      screen('anonymous', { screen: null, lastSeenAt: NOW - OUTPUT_STALE_MS - 1 }),
      screen('live', { screen: 'main', lastSeenAt: NOW })
    );
    expect(stalledOutputs(outputs, NOW).map((s) => s.outputId)).toEqual(['anonymous']);
  });

  it('forgets a screen that has been gone long enough, and stops naming it', () => {
    // Every page load mints a new output session id, so a reloaded browser
    // source leaves its old id behind. Without eviction the desk would show
    // yesterday's tabs as permanently dead screens.
    const outputs = rig(screen('a'), screen('reloaded', { lastSeenAt: NOW - OUTPUT_FORGET_MS - 1 }));
    expect(stalledOutputs(outputs, NOW)).toEqual([]);
    expect(worstOutput(outputs, NOW)?.outputId).toBe('a');
  });

  it('a screen goes stale on its own timing, not the rig’s', () => {
    const outputs = rig(
      screen('a', { lastSeenAt: NOW }),
      screen('b', { lastSeenAt: NOW - OUTPUT_STALE_MS - 1 })
    );
    expect(outputPresence(outputs.a, NOW)).toBe('fresh');
    expect(outputPresence(outputs.b, NOW)).toBe('stale');
  });
});

/**
 * The status pill is one phrase, so several screens have to become one reading.
 * The only honest choice is the WEAKEST story on the rig.
 */
describe('which screen speaks for the rig', () => {
  it('is nothing at all when nothing is known', () => {
    expect(worstOutput({}, NOW)).toBeNull();
  });

  /**
   * THE RULE THAT MAKES A TWO-SCREEN RIG READABLE.
   *
   * The main and split scenes are alternatives — exactly one is live — so the
   * other's browser source is off-air by design and reports hidden or inactive
   * for the whole service. Letting the weakest of ALL screens speak pinned the
   * pill to SOURCE HIDDEN permanently: a fault nobody can fix, about a screen
   * nobody is watching. A status light that is always red is furniture.
   */
  it('ignores a screen that is off-air by design', () => {
    expect(
      worstOutput(rig(screen('live'), screen('other-scene', { sourceVisible: false })), NOW)?.outputId
    ).toBe('live');
    expect(
      worstOutput(rig(screen('live'), screen('other-scene', { sourceActive: false })), NOW)?.outputId
    ).toBe('live');
  });

  it('ignores a screen that has gone quiet while another is carrying', () => {
    // The pill answers "is what I commanded reaching air". It is; the split
    // screen dying in a scene nobody is cutting to does not change that, and
    // `describeStalledScreens` names it regardless.
    const outputs = rig(screen('live'), screen('gone', { lastSeenAt: NOW - OUTPUT_STALE_MS - 1 }));
    expect(worstOutput(outputs, NOW)?.outputId).toBe('live');
    expect(stalledOutputs(outputs, NOW).map((s) => s.outputId)).toEqual(['gone']);
  });

  it('speaks for the rig again the moment NOTHING is carrying', () => {
    // Now it is real news: no live source is showing this graphic. That covers
    // a scene without the Live Layer source in it, and the case that matters —
    // the operator cuts TO the split scene and its source is dead.
    expect(
      worstOutput(rig(screen('a', { sourceVisible: false }), screen('b', { sourceActive: false })), NOW)?.outputId
    ).toBe('a'); // hidden outranks inactive
    const dead = rig(
      screen('main-offair', { sourceVisible: false }),
      screen('split-dead', { lastSeenAt: NOW - OUTPUT_STALE_MS - 1 })
    );
    expect(worstOutput(dead, NOW)?.outputId).toBe('split-dead'); // stale outranks all
  });

  it('answers from a measured source the instant one exists', () => {
    // The responsiveness property, stated as a rule: one source reporting
    // active IS the evidence that the graphic is compositing, and no amount of
    // other screens in other states delays or dilutes it.
    const outputs = rig(
      screen('obs-live'),
      screen('obs-other-scene', { sourceVisible: false }),
      screen('tab', { sourceActive: null, sourceVisible: null }),
      screen('dead', { lastSeenAt: NOW - OUTPUT_STALE_MS - 1 })
    );
    const speaking = worstOutput(outputs, NOW);
    expect(speaking?.outputId).toBe('obs-live');
    expect(speaking?.sourceActive).toBe(true);
    // ...and the dead one is still named, by the other question.
    expect(stalledOutputs(outputs, NOW).map((s) => s.outputId)).toEqual(['dead']);
  });

  /**
   * A BROWSER TAB DOES NOT OUTVOTE THE RIG.
   *
   * This used to prefer the unbound page "because it claims less", and on a
   * one-screen rig that was right. With a preview window open — or `/output` on
   * a phone over the relay, which is how this gets used — it was badly wrong in
   * both directions at once: the pill sat at OUTPUT READY while the OBS source
   * was plainly active, and when the real sources went hidden the tab was the
   * only thing still counted as carrying, so SOURCE HIDDEN never appeared.
   *
   * A page with no host binding has measured nothing. It cannot weaken a source
   * that has.
   */
  it('is not outvoted by a page that has measured nothing', () => {
    const outputs = rig(screen('obs'), screen('tab', { sourceActive: null, sourceVisible: null }));
    expect(worstOutput(outputs, NOW)?.outputId).toBe('obs');
  });

  it('still says OUTPUT READY when unbound pages are all there is', () => {
    // No OBS anywhere — a laptop and a phone on the relay. Nothing has measured
    // a source, so nothing may claim one, and the fallback pool says so.
    const outputs = rig(
      screen('tab-a', { sourceActive: null, sourceVisible: null }),
      screen('tab-b', { sourceActive: null, sourceVisible: null })
    );
    expect(worstOutput(outputs, NOW)?.sourceActive).toBeNull();
  });

  it('reports SOURCE HIDDEN again the moment the real sources hide, tab or no tab', () => {
    // The other half of the same fault. With the tab counted as carrying, the
    // hidden sources were filtered out and the tab spoke instead — the desk
    // said OUTPUT READY about a rig showing nothing.
    const outputs = rig(
      screen('obs-main', { sourceVisible: false }),
      screen('obs-split', { sourceActive: false }),
      screen('tab', { sourceActive: null, sourceVisible: null })
    );
    expect(worstOutput(outputs, NOW)?.outputId).toBe('obs-main'); // hidden outranks inactive
  });

  it('returns the single screen unchanged when there is only one', () => {
    expect(worstOutput(rig(screen('only')), NOW)?.outputId).toBe('only');
  });
});

/**
 * The map is keyed by output SESSION id; the Screens page is keyed by SCREEN.
 * Getting from one to the other is where a card can quietly start lying.
 */
describe('which output speaks for a named screen', () => {
  it('is nothing at all when no source has reported that screen', () => {
    // "Not connected" and "stale" are different answers, and on a setup page
    // the difference is the whole diagnosis: nothing was ever there, versus
    // something was and stopped.
    expect(outputForScreen(rig(screen('a', { screen: 'main' })), 'split', NOW)).toBeNull();
    expect(outputForScreen({}, 'main', NOW)).toBeNull();
  });

  it('picks the FRESHEST when two sessions claim the same screen', () => {
    // The ordinary case, not an exotic one: every page load mints a new session
    // id, so a refreshed browser source leaves its predecessor on the board for
    // OUTPUT_FORGET_MS. Reading the dead one would show a live screen as stale.
    const outputs = rig(
      screen('old', { screen: 'split', lastSeenAt: NOW - 60_000 }),
      screen('new', { screen: 'split', lastSeenAt: NOW })
    );
    expect(outputForScreen(outputs, 'split', NOW)?.outputId).toBe('new');
  });

  it('files an output that named no screen under no screen at all', () => {
    // An older build sends no screen. Filing it under `main` would invent an
    // answer, and a card claiming a source it cannot identify is a lie.
    const outputs = rig(screen('unnamed', { screen: null }));
    expect(outputForScreen(outputs, 'main', NOW)).toBeNull();
  });

  it('forgets a session that has been gone long enough', () => {
    const outputs = rig(screen('gone', { screen: 'split', lastSeenAt: NOW - OUTPUT_FORGET_MS - 1 }));
    expect(outputForScreen(outputs, 'split', NOW)).toBeNull();
  });

  it('still reports a screen that is merely stale, so the card can say so', () => {
    const outputs = rig(screen('quiet', { screen: 'split', lastSeenAt: NOW - OUTPUT_STALE_MS - 1 }));
    expect(outputForScreen(outputs, 'split', NOW)?.outputId).toBe('quiet');
  });
});
