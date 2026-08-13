import { describe, expect, it } from 'vitest';
import {
  OUTPUT_FORGET_MS,
  OUTPUT_STALE_MS,
  outputPresence,
  overallPresence,
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
  it('is unknown until something speaks', () => {
    expect(overallPresence({}, NOW)).toBe('unknown');
  });

  it('is fresh only while every known screen is fresh', () => {
    expect(overallPresence(rig(screen('a'), screen('b')), NOW)).toBe('fresh');
  });

  it('one quiet screen makes the whole reading stale', () => {
    // The load-bearing rule. "Some of the outputs are alive" is not something an
    // operator can act on, and reporting fresh while a screen is down is the
    // exact failure the single record produced.
    const outputs = rig(screen('a'), screen('b', { lastSeenAt: NOW - OUTPUT_STALE_MS - 1 }));
    expect(overallPresence(outputs, NOW)).toBe('stale');
    expect(stalledOutputs(outputs, NOW).map((s) => s.outputId)).toEqual(['b']);
  });

  it('forgets a screen that has been gone long enough, and stops naming it', () => {
    // Every page load mints a new output session id, so a reloaded browser
    // source leaves its old id behind. Without eviction the desk would show
    // yesterday's tabs as permanently dead screens.
    const outputs = rig(screen('a'), screen('reloaded', { lastSeenAt: NOW - OUTPUT_FORGET_MS - 1 }));
    expect(overallPresence(outputs, NOW)).toBe('fresh');
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

  it('prefers a stale screen over every live one', () => {
    const outputs = rig(screen('live'), screen('gone', { lastSeenAt: NOW - OUTPUT_STALE_MS - 1 }));
    expect(worstOutput(outputs, NOW)?.outputId).toBe('gone');
  });

  it('prefers hidden over inactive, and inactive over active', () => {
    expect(
      worstOutput(rig(screen('active'), screen('hidden', { sourceVisible: false })), NOW)?.outputId
    ).toBe('hidden');
    expect(
      worstOutput(rig(screen('active'), screen('off', { sourceActive: false })), NOW)?.outputId
    ).toBe('off');
    expect(
      worstOutput(rig(screen('off', { sourceActive: false }), screen('hidden', { sourceVisible: false })), NOW)
        ?.outputId
    ).toBe('hidden');
  });

  it('prefers an unbound page over an active source, because it claims less', () => {
    // A plain browser tab reports no host binding at all. Reading the OBS source
    // instead would let the desk say OUTPUT ACTIVE about a screen whose state
    // nobody has measured.
    const outputs = rig(screen('obs'), screen('tab', { sourceActive: null, sourceVisible: null }));
    expect(worstOutput(outputs, NOW)?.outputId).toBe('tab');
  });

  it('returns the single screen unchanged when there is only one', () => {
    expect(worstOutput(rig(screen('only')), NOW)?.outputId).toBe('only');
  });
});
