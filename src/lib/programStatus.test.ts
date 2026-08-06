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
  return { outputId: 'out-1', sourceActive: null, sourceVisible: null, lastSeenAt: NOW, ...overrides };
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
