import { describe, expect, it } from 'vitest';
import { CLOCK_COARSE_MS, CLOCK_FINE_MS, programClockMs } from './programClock';
import { CLEAR_PROGRAM_STATE } from '../types/program';
import type { ProgramState } from '../types/program';

/**
 * A Program surface should only wake up when its own text would change.
 *
 * Both surfaces used to tick every second during `recovering`, a state in which
 * neither renders a time — the dock suppresses the clock because `takenAt`
 * survives a reload and would read as a huge stale number beside "Not
 * confirmed", and the studio renders a fixed sentence. That is a one-second
 * interval running indefinitely for nothing, in a dock that mounts one tab at a
 * time specifically to avoid that kind of cost.
 */

const NOW = 1_700_000_000_000;
const state = (over: Partial<ProgramState>): ProgramState => ({ ...CLEAR_PROGRAM_STATE, ...over });

describe('the Program clock runs only when the text moves', () => {
  it('ticks every second while showing', () => {
    // Renders MM:SS, so it needs every second for as long as it is up — not a
    // coarse cadence after the first minute, which left the seconds stale.
    expect(programClockMs(state({ status: 'showing', takenAt: NOW - 5_000 }), NOW)).toBe(CLOCK_FINE_MS);
    expect(programClockMs(state({ status: 'showing', takenAt: NOW - 10 * 60_000 }), NOW)).toBe(CLOCK_FINE_MS);
  });

  it('ticks every second for a recent clear', () => {
    // "12s ago" changes every second until it stops naming seconds.
    expect(programClockMs(state({ status: 'clear', clearedAt: NOW - 1_000 }), NOW)).toBe(CLOCK_FINE_MS);
    expect(programClockMs(state({ status: 'clear', clearedAt: NOW - 59_000 }), NOW)).toBe(CLOCK_FINE_MS);
  });

  it('drops to the minute cadence once a clear only reports whole minutes', () => {
    expect(programClockMs(state({ status: 'clear', clearedAt: NOW - 60_000 }), NOW)).toBe(CLOCK_COARSE_MS);
    expect(programClockMs(state({ status: 'clear', clearedAt: NOW - 3 * 3600_000 }), NOW)).toBe(CLOCK_COARSE_MS);
  });

  it('creates no timer while recovering', () => {
    // The decisive case. `takenAt` is present and non-null precisely because it
    // survived the reload, so a naive implementation happily ticks forever.
    expect(programClockMs(state({ status: 'recovering', takenAt: NOW - 75 * 60_000 }), NOW)).toBe(0);
    expect(programClockMs(state({ status: 'recovering', takenAt: NOW - 1_000 }), NOW)).toBe(0);
  });

  it('creates no timer after a failed send', () => {
    expect(programClockMs(state({ status: 'failed', takenAt: NOW - 2_000 }), NOW)).toBe(0);
  });

  it('creates no timer when there is no timestamp to count from', () => {
    // "Ready — nothing on air" and a showing state with no takenAt are both static.
    expect(programClockMs(state({ status: 'clear', clearedAt: null }), NOW)).toBe(0);
    expect(programClockMs(state({ status: 'showing', takenAt: null }), NOW)).toBe(0);
    expect(programClockMs(CLEAR_PROGRAM_STATE, NOW)).toBe(0);
  });

  it('is the single source both surfaces read', () => {
    // Neither surface may re-derive the cadence inline again.
    const read = (path: string) => require('node:fs').readFileSync(path, 'utf8');
    for (const path of [
      'src/components/control/DockProgramStrip.tsx',
      'src/components/control/ProgramRail.tsx'
    ]) {
      const code = read(path);
      expect(code, path).toContain('programClockMs(program, Date.now())');
      expect(code, `${path} must not name statuses when choosing a cadence`).not.toMatch(/needsClock/);
      expect(code, `${path} must not hardcode an interval`).not.toMatch(/useTicks\(\s*(1000|60_000)/);
    }
  });
});
