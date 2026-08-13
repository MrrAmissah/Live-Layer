import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeProgramStatus, type ProgramStatusWords } from './programStatus';
import { OUTPUT_STALE_MS, outputPresence } from './outputPresence';
import type { OutputStatusState, ProgramState } from '../types/program';

/**
 * The Program vocabulary decision table. Each claim must be backed by exactly
 * the evidence it names — and every claim must DECAY: staleness or a reload
 * always moves words toward "unverified", never toward a stronger claim.
 */

const NOW = 10_000_000;

type Words = Pick<ProgramState, 'status' | 'confirmation' | 'outputFailure'>;

function program(overrides: Partial<Words> = {}): Words {
  return { status: 'showing', confirmation: 'unconfirmed', outputFailure: null, ...overrides };
}

function output(overrides: Partial<OutputStatusState> = {}): OutputStatusState {
  return { outputId: 'out-1', sourceActive: null, sourceVisible: null, lastSeenAt: NOW, screen: null, ...overrides };
}

describe('the decision table', () => {
  it('SENT / Awaiting output while nothing has answered', () => {
    expect(describeProgramStatus(program(), null, NOW)).toEqual<ProgramStatusWords>({
      pill: 'SENT',
      phrase: 'Awaiting output'
    });
  });

  it('OUTPUT READY once the matching ack arrived and the heartbeat is fresh (no host binding)', () => {
    const words = describeProgramStatus(program({ confirmation: 'confirmed' }), output(), NOW);
    expect(words).toEqual<ProgramStatusWords>({ pill: 'OUTPUT READY', phrase: 'Output page applied the graphic' });
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
    expect(words).toEqual<ProgramStatusWords>({ pill: 'UNVERIFIED', phrase: 'Output status is stale' });
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
    expect(words).toEqual<ProgramStatusWords>({ pill: 'FAILED', phrase: 'Output couldn’t render it' });
  });

  it('clearing reads as a pending command, whatever the presence', () => {
    for (const o of [null, output(), output({ lastSeenAt: NOW - OUTPUT_STALE_MS - 1 })]) {
      expect(describeProgramStatus(program({ status: 'clearing' }), o, NOW)).toEqual<ProgramStatusWords>({
        pill: 'SENT',
        phrase: 'Clearing — awaiting output'
      });
    }
  });

  it('recovering and failed and clear keep their existing words', () => {
    expect(describeProgramStatus(program({ status: 'recovering' }), null, NOW).pill).toBe('UNVERIFIED');
    expect(describeProgramStatus(program({ status: 'failed' }), null, NOW)).toEqual({
      pill: 'FAILED',
      phrase: 'Send failed'
    });
    expect(describeProgramStatus(program({ status: 'clear' }), null, NOW)).toEqual({ pill: 'CLEAR', phrase: 'Clear' });
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
      phrase: 'OBS source active'
    });
    // Visibility simply unreported is not the same as hidden.
    expect(words({ sourceActive: true, sourceVisible: null }).pill).toBe('OUTPUT ACTIVE');
  });

  it('says hidden when the eye is off, even while OBS still calls it active', () => {
    expect(words({ sourceActive: true, sourceVisible: false })).toEqual({
      pill: 'SOURCE HIDDEN',
      phrase: 'OBS source hidden'
    });
  });

  it('says hidden on a visibility reading alone, with activity unknown', () => {
    expect(words({ sourceActive: null, sourceVisible: false }).pill).toBe('SOURCE HIDDEN');
  });

  it('says inactive when it is visible but not active', () => {
    expect(words({ sourceActive: false, sourceVisible: true })).toEqual({
      pill: 'SOURCE INACTIVE',
      phrase: 'OBS source not active'
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
      phrase: 'Output page applied the graphic'
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
      phrase: 'Output status is stale'
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
      expect(words(o, stale)).toEqual({ pill: 'UNVERIFIED', phrase: 'Output status is stale' });
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
