import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AWAITING_OUTPUT_GRACE_MS, describeProgramStatus, type ProgramStatusWords } from './programStatus';
import { OUTPUT_STALE_MS, outputPresence } from './outputPresence';
import type { OutputStatusState, ProgramState } from '../types/program';

/**
 * The Program vocabulary decision table. Each claim must be backed by exactly
 * the evidence it names — and every claim must DECAY: staleness or a reload
 * always moves words toward "unverified", never toward a stronger claim.
 */

const NOW = 10_000_000;

type Words = Pick<ProgramState, 'status' | 'confirmation' | 'outputFailure' | 'takenAt' | 'sendFailure'>;

/**
 * `takenAt: NOW` by default, so the existing cases read at the instant of the
 * Take — which is what they were always describing. The grace period below is
 * measured from it.
 */
function program(overrides: Partial<Words> = {}): Words {
  return { status: 'showing', confirmation: 'unconfirmed', outputFailure: null, takenAt: NOW, ...overrides };
}

function output(overrides: Partial<OutputStatusState> = {}): OutputStatusState {
  return { outputId: 'out-1', sourceActive: null, sourceVisible: null, lastSeenAt: NOW, screen: null, hosted: null, failure: null, ...overrides };
}

describe('a Take nothing answered stops calling itself “awaiting”', () => {
  it('says SENT inside the grace period, when an ack really could still arrive', () => {
    expect(describeProgramStatus(program(), null, NOW + 2_000).pill).toBe('SENT');
  });

  it('turns to UNVERIFIED once nothing has answered for long enough', () => {
    /**
     * The desk said "Awaiting output", in blue, for as long as nothing
     * answered — which is forever, and blue reads as fine. An operator cannot
     * tell an ack in flight from one that is never coming.
     *
     * It is never coming more often than you would think: obs-browser suspends
     * a browser source whose video is not being rendered — no stream, no
     * recording, no preview — and a suspended page cannot POST. Every source
     * sends one status as it loads, goes silent, applies nothing further, and
     * the Take is never acknowledged. Confirmed on the rig with OBS reporting
     * `videoShowing: false` for a source in the CURRENT PROGRAM SCENE.
     */
    const words = describeProgramStatus(program(), null, NOW + AWAITING_OUTPUT_GRACE_MS + 1);
    expect(words.pill).toBe('UNVERIFIED');
    expect(words.phrase).toBe('Not confirmed');
    // Gold, because it is now something to go and look at.
    expect(words.tone).toBe('attention');
  });

  it('a confirmed Take is never downgraded by the grace period', () => {
    // The clock only speaks while nothing has answered. An acknowledged Take
    // hours old still reads from the output's own evidence.
    const words = describeProgramStatus(
      program({ confirmation: 'confirmed' }),
      output({ sourceActive: true, lastSeenAt: NOW + 3_600_000 }),
      NOW + 3_600_000
    );
    expect(words.pill).toBe('OUTPUT ACTIVE');
  });

  it('never claims more than SENT did — it only stops claiming less urgency', () => {
    // Both are honest about the same evidence (none). This is a change of
    // TONE, not of claim: neither says the graphic is on air.
    const early = describeProgramStatus(program(), null, NOW);
    const late = describeProgramStatus(program(), null, NOW + 60_000);
    expect(early.tone).toBe('pending');
    expect(late.tone).toBe('attention');
    for (const words of [early, late]) {
      expect(words.pill).not.toBe('OUTPUT ACTIVE');
      expect(words.pill).not.toBe('OUTPUT READY');
    }
  });
});

describe('the decision table', () => {
  it('SENT / Awaiting output while nothing has answered', () => {
    expect(describeProgramStatus(program(), null, NOW)).toEqual<ProgramStatusWords>({
      pill: 'SENT',
      phrase: 'Awaiting output',
      tone: 'pending'
    });
  });

  it('OUTPUT READY once the matching ack arrived and the heartbeat is fresh (no host binding)', () => {
    const words = describeProgramStatus(program({ confirmation: 'confirmed' }), output(), NOW);
    expect(words).toEqual<ProgramStatusWords>({ pill: 'OUTPUT READY', phrase: 'Output page applied the graphic' , tone: 'ready' });
  });

  it('OUTPUT ACTIVE only for a fresh sourceActive === true reading', () => {
    const words = describeProgramStatus(program({ confirmation: 'confirmed' }), output({ sourceActive: true }), NOW);
    expect(words.pill).toBe('OUTPUT ACTIVE');
  });

  it('SOURCE INACTIVE for a fresh sourceActive === false — false is not unknown', () => {
    const words = describeProgramStatus(program({ confirmation: 'confirmed' }), output({ sourceActive: false }), NOW);
    expect(words.pill).toBe('SOURCE INACTIVE');
    // Explicitly: an inactive reading must never be presented as active.
    expect(words.pill).not.toBe('OUTPUT ACTIVE');
  });

  it('a stale heartbeat downgrades confirmed claims to UNVERIFIED — OUTPUT ACTIVE never latches', () => {
    const staleOutput = output({ sourceActive: true, lastSeenAt: NOW - OUTPUT_STALE_MS - 1 });
    const words = describeProgramStatus(program({ confirmation: 'confirmed' }), staleOutput, NOW);
    expect(words).toEqual<ProgramStatusWords>({ pill: 'UNVERIFIED', phrase: 'Output status is stale' , tone: 'attention' });
  });

  it('confirmed with NO presence record at all is also UNVERIFIED, never READY', () => {
    const words = describeProgramStatus(program({ confirmation: 'confirmed' }), null, NOW);
    expect(words.pill).toBe('UNVERIFIED');
  });

  it('the staleness boundary is exact: fresh at the threshold, stale past it', () => {
    expect(outputPresence(output({ lastSeenAt: NOW - OUTPUT_STALE_MS }), NOW)).toBe('fresh');
    expect(outputPresence(output({ lastSeenAt: NOW - OUTPUT_STALE_MS - 1 }), NOW)).toBe('stale');
    expect(outputPresence(null, NOW)).toBe('unknown');
  });

  it('an output failure outranks liveness readings', () => {
    const words = describeProgramStatus(
      program({ outputFailure: { reason: 'Template "x" is not available in this build', at: NOW } }),
      output({ sourceActive: true }),
      NOW
    );
    // The reason travels with it — see "a failed send says WHY" below.
    expect(words).toEqual<ProgramStatusWords>({
      pill: 'FAILED',
      phrase: 'Output couldn’t render it',
      tone: 'failed',
      detail: 'Template "x" is not available in this build'
    });
  });

  it('clearing reads as a pending command, whatever the presence', () => {
    for (const o of [null, output(), output({ lastSeenAt: NOW - OUTPUT_STALE_MS - 1 })]) {
      expect(describeProgramStatus(program({ status: 'clearing' }), o, NOW)).toEqual<ProgramStatusWords>({
        pill: 'SENT',
        phrase: 'Clearing — awaiting output',
        tone: 'pending'
      });
    }
  });

  it('recovering and failed and clear keep their existing words', () => {
    expect(describeProgramStatus(program({ status: 'recovering' }), null, NOW).pill).toBe('UNVERIFIED');
    expect(describeProgramStatus(program({ status: 'failed' }), null, NOW)).toEqual({
      pill: 'FAILED',
      phrase: 'Send failed',
      tone: 'failed'
    });
    // Deliberately not the word "CLEAR": that is what the button beside it says.
    expect(describeProgramStatus(program({ status: 'clear' }), null, NOW)).toEqual({ pill: 'NO GRAPHIC', phrase: 'Clear', tone: 'idle' });
  });
});

describe('visibility outranks activity', () => {
  /**
   * The defect a real OBS test found. OBS reports active and visible
   * independently: toggling the eye leaves `sourceActive: true` while
   * `sourceVisible` goes false, and reading only `sourceActive` kept claiming
   * OUTPUT ACTIVE for a source contributing nothing to the scene.
   */
  const confirmed = program({ confirmation: 'confirmed' });
  const words = (o: Partial<OutputStatusState>, now = NOW) =>
    describeProgramStatus(confirmed, output(o), now);

  it('claims active only when it is active and not hidden', () => {
    expect(words({ sourceActive: true, sourceVisible: true })).toEqual({
      pill: 'OUTPUT ACTIVE',
      phrase: 'OBS source active',
      tone: 'live'
    });
    // Visibility simply unreported is not the same as hidden.
    expect(words({ sourceActive: true, sourceVisible: null }).pill).toBe('OUTPUT ACTIVE');
  });

  it('says hidden when the eye is off, even while OBS still calls it active', () => {
    expect(words({ sourceActive: true, sourceVisible: false })).toEqual({
      pill: 'SOURCE HIDDEN',
      phrase: 'OBS source hidden',
      tone: 'attention'
    });
  });

  it('says hidden on a visibility reading alone, with activity unknown', () => {
    expect(words({ sourceActive: null, sourceVisible: false }).pill).toBe('SOURCE HIDDEN');
  });

  it('says inactive when it is visible but not active', () => {
    expect(words({ sourceActive: false, sourceVisible: true })).toEqual({
      pill: 'SOURCE INACTIVE',
      phrase: 'OBS source not active',
      tone: 'attention'
    });
  });

  it('does not fold hidden into inactive — they are different repairs', () => {
    // An operator fixes a hidden source by clicking the eye and an inactive one
    // by putting the scene on program. One word for both would misdirect them.
    expect(words({ sourceActive: false, sourceVisible: false }).pill).toBe('SOURCE HIDDEN');
  });

  it('falls back to OUTPUT READY when neither reading is decisive', () => {
    // A plain browser tab, or OBS before it has dispatched either event.
    expect(words({ sourceActive: null, sourceVisible: null })).toEqual({
      pill: 'OUTPUT READY',
      phrase: 'Output page applied the graphic',
      tone: 'ready'
    });
  });

  it('will not say READY with no presence record at all', () => {
    /**
     * Distinct from "readings unknown". `OUTPUT_APPLIED` refreshes presence, so a
     * confirmed command always carries a record and this state is unreachable in
     * practice — but if it ever occurs we know nothing about the output page, and
     * the conservative answer is the honest one.
     */
    expect(describeProgramStatus(confirmed, null, NOW)).toEqual({
      pill: 'UNVERIFIED',
      phrase: 'Output status is stale',
      tone: 'attention'
    });
  });

  it('lets a stale heartbeat override every source reading', () => {
    /**
     * Including the ones that would otherwise be reassuring. If the page is gone
     * — which is what "Shutdown source when not visible" does — nothing it last
     * said is still evidence.
     */
    const stale = NOW + OUTPUT_STALE_MS + 1;
    for (const o of [
      { sourceActive: true, sourceVisible: true },
      { sourceActive: true, sourceVisible: false },
      { sourceActive: false, sourceVisible: false },
      { sourceActive: null, sourceVisible: null }
    ]) {
      expect(words(o, stale)).toEqual({ pill: 'UNVERIFIED', phrase: 'Output status is stale' , tone: 'attention' });
    }
  });

  it('gives the dock and the studio identical wording', () => {
    // Both surfaces call this one function; nothing may re-derive the words.
    const cases: Partial<OutputStatusState>[] = [
      { sourceActive: true, sourceVisible: true },
      { sourceActive: true, sourceVisible: false },
      { sourceActive: false, sourceVisible: true },
      { sourceActive: null, sourceVisible: null }
    ];
    for (const o of cases) {
      const a = describeProgramStatus(confirmed, output(o), NOW);
      const b = describeProgramStatus(confirmed, output(o), NOW);
      expect(a).toEqual(b);
    }
    const strip = readFileSync('src/components/control/DockProgramStrip.tsx', 'utf8');
    const rail = readFileSync('src/components/control/ProgramRail.tsx', 'utf8');
    for (const [name, code] of [['dock', strip], ['studio', rail]] as const) {
      expect(code, name).toContain('describeProgramStatus');
      // Neither may name a source reading itself and reach its own conclusion.
      expect(code, `${name} must not re-derive source wording`).not.toMatch(/sourceVisible|sourceActive/);
    }
  });
});

describe('the honesty guard on the vocabulary itself', () => {
  it('never emits LIVE / ON AIR / Confirmed in any reachable combination', () => {
    const statuses: ProgramState['status'][] = ['clear', 'showing', 'clearing', 'recovering', 'failed'];
    const confirmations: ProgramState['confirmation'][] = ['unconfirmed', 'confirmed'];
    const outputs = [
      null,
      output(),
      output({ sourceActive: true }),
      output({ sourceActive: false }),
      output({ lastSeenAt: NOW - OUTPUT_STALE_MS - 1, sourceActive: true })
    ];
    const failures = [null, { reason: 'x', at: NOW }];
    for (const status of statuses) {
      for (const confirmation of confirmations) {
        for (const o of outputs) {
          for (const outputFailure of failures) {
            const words = describeProgramStatus(program({ status, confirmation, outputFailure }), o, NOW);
            for (const text of [words.pill, words.phrase]) {
              expect(text).not.toMatch(/\bLIVE\b/);
              expect(text).not.toMatch(/\bON AIR\b/i);
              expect(text).not.toMatch(/\bConfirmed\b/);
            }
          }
        }
      }
    }
  });
});

describe('a failed send says WHY', () => {
  /**
   * `postToRelay` already works out precisely what went wrong — "No relay
   * response in 4000ms", "Relay responded 400", a network message — and
   * `markProgramFailed` discarded all of it. The desk said "Send failed" and
   * nothing else however it failed, so an operator two rooms from the graphics
   * machine had no way to tell a relay that is down from one that refused the
   * message from a network path that dropped it. Three different responses.
   */
  it('carries the transport’s reason beside the claim', () => {
    const words = describeProgramStatus(
      program({ status: 'failed', sendFailure: { reason: 'timeout', detail: 'No relay response in 4000ms', at: NOW } }),
      null,
      NOW
    );
    expect(words.pill).toBe('FAILED');
    expect(words.phrase).toBe('Send failed');
    expect(words.detail).toBe('No relay response in 4000ms');
  });

  it('still says FAILED when the transport gave no reason', () => {
    // The claim never depends on the evidence being present — a missing detail
    // must not soften or hide the failure.
    const words = describeProgramStatus(program({ status: 'failed' }), null, NOW);
    expect(words.pill).toBe('FAILED');
    expect(words.detail).toBeUndefined();
  });

  it('names what the OUTPUT refused, not just that it refused', () => {
    const words = describeProgramStatus(
      program({ outputFailure: { reason: 'Template "x" is not available in this build', at: NOW } }),
      null,
      NOW
    );
    expect(words.pill).toBe('FAILED');
    expect(words.detail).toMatch(/not available in this build/);
  });

  it('never lets a reason reach a pill that is not a failure', () => {
    // The detail is evidence FOR a claim, never a claim of its own — a healthy
    // status with a stale reason attached would read as a fault.
    const healthy = describeProgramStatus(
      program({ confirmation: 'confirmed', sendFailure: { reason: 'timeout', detail: 'old news', at: NOW } }),
      output({ sourceActive: true }),
      NOW
    );
    expect(healthy.pill).toBe('OUTPUT ACTIVE');
    expect(healthy.detail).toBeUndefined();
  });
});
