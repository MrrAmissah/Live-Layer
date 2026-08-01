import { describe, expect, it } from 'vitest';
import { resolveClearOutcome, resolveTakeOutcome } from './takeOutcome';
import type { PublishResult } from './realtime';

/**
 * These transitions used to be written inline in the control page and modelled
 * a second time inside `realtime.test.ts`, so the tests asserted a copy of the
 * rule: deleting the real `if (result.ok)` would not have failed anything.
 * Now the rule is one function and this is the only statement of it.
 */
const ok: PublishResult = { ok: true, transport: 'local' };
const failed: PublishResult = { ok: false, transport: 'none', reason: 'no-channel' };

describe('resolveTakeOutcome', () => {
  it('advances every operator-visible record on success', () => {
    expect(resolveTakeOutcome(ok)).toEqual({
      markShowing: true,
      markFailed: false,
      addRecent: true,
      advanceLiveCursor: true
    });
  });

  it('advances nothing when the command never reached a transport', () => {
    // The graphic that was already on air may still be on air; claiming
    // otherwise is the one thing Program must never do.
    expect(resolveTakeOutcome(failed)).toEqual({
      markShowing: false,
      markFailed: true,
      addRecent: false,
      advanceLiveCursor: false
    });
  });

  it('never marks both showing and failed', () => {
    for (const result of [ok, failed]) {
      const outcome = resolveTakeOutcome(result);
      expect(outcome.markShowing && outcome.markFailed).toBe(false);
    }
  });

  it('ties Recent and the live cursor to the same success, not to each other', () => {
    // Recent is a log of what went to air and the cursor is what the queue
    // believes is live; both are downstream of the publish, never of each other.
    for (const result of [ok, failed]) {
      const outcome = resolveTakeOutcome(result);
      expect(outcome.addRecent).toBe(outcome.markShowing);
      expect(outcome.advanceLiveCursor).toBe(outcome.markShowing);
    }
  });

  it('treats every failure reason the same way', () => {
    // Every reason the transport can report — a hung relay is as much a
    // non-delivery as a missing channel.
    const reasons: PublishResult[] = [
      { ok: false, transport: 'none', reason: 'no-channel' },
      { ok: false, transport: 'relay', reason: 'timeout' },
      { ok: false, transport: 'relay', reason: 'http', detail: '502' },
      { ok: false, transport: 'relay', reason: 'network' },
      { ok: false, transport: 'local', reason: 'no-transport' }
    ];
    for (const result of reasons) {
      expect(resolveTakeOutcome(result).markShowing).toBe(false);
    }
  });
});

describe('resolveClearOutcome', () => {
  it('clears Program and drops the live cursor only when the clear was accepted', () => {
    expect(resolveClearOutcome(ok)).toEqual({ markClear: true, dropLiveCursor: true });
    expect(resolveClearOutcome(failed)).toEqual({ markClear: false, dropLiveCursor: false });
  });
});
