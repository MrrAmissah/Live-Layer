import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * THE WALL-CLOCK CONTRACT, PROVEN OFF UTC.
 *
 * `serviceContext.test.ts` asserts that a 10:30 service renders as 10:30 either
 * side of both DST boundaries. On this machine that assertion is TRUE AND
 * VACUOUS: the development host runs on UTC, where reading a local time as an
 * instant produces exactly the same digits, so the one bug the contract exists
 * to prevent is invisible to it.
 *
 * So those tests are re-run here in child processes pinned to zones where the
 * difference is visible — one well east of UTC and one well west, both with
 * daylight saving, and both crossing their DST boundary inside the dates the
 * suite uses. If any conversion creeps into storage, parsing, formatting or the
 * countdown arithmetic, the hour moves and the child fails.
 *
 * A child process is the only honest way to do this: Node resolves the local
 * zone once at startup, so `TZ` cannot be changed from inside a running suite.
 * It re-runs ONE small file, and only that file — never itself.
 */

const ZONES = [
  // UTC+12/+13. DST ends 5 April 2026 and begins 27 September 2026.
  'Pacific/Auckland',
  // UTC-8/-7. DST begins 8 March 2026 and ends 1 November 2026.
  'America/Los_Angeles',
  // Half-hour offset, no DST — the case that catches arithmetic assuming whole hours.
  'Asia/Kolkata'
];

describe('a service time does not move when the machine is not on UTC', () => {
  it.each(ZONES)('holds in %s', (zone) => {
    // Only the wall-clock file. Passing this file would recurse.
    const run = () =>
      execFileSync('npx', ['vitest', 'run', 'src/lib/serviceContext.test.ts', '--reporter=basic'], {
        cwd: process.cwd(),
        env: { ...process.env, TZ: zone, CI: '1' },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
    expect(run).not.toThrow();
  }, 120_000);
});
