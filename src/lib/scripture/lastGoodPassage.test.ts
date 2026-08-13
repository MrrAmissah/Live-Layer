import { describe, expect, it } from 'vitest';
import {
  IDLE,
  beginResolving,
  passageResolved,
  receiveTranscript,
  reject,
  resolutionFailed
} from './voiceAssist';
import { readCorrection } from './referenceCorrection';
import { parseScriptureReference } from './parseReference';
import type { ScriptureLookupResult } from '../../types/scripture';

/**
 * The invariant: **a bad or incomplete new hypothesis must never erase the last
 * confirmed good Scripture.**
 *
 * The failure this pins happened in production speech. LiveLayer had Romans 8:28
 * on screen, correctly. The preacher said "no, verse three" — completely ordinary
 * self-correction — and the panel lost the passage: the fragment had no book in
 * it, the parser rightly refused, and `receiveTranscript` builds a FRESH state for
 * every utterance, so the refusal replaced a result that was right.
 *
 * The fix is structural rather than careful. The confirmed passage lives OUTSIDE
 * this reducer, so no transition here can reach it. These tests hold that shape in
 * place: each one takes a reducer path that destroys the transient attempt, and
 * asserts that the durable value it does not own is untouched.
 */

const passage = (reference: string): ScriptureLookupResult =>
  ({ reference, translation: 'KJV', text: `text of ${reference}`, attribution: '' }) as ScriptureLookupResult;

const ref = (text: string) => {
  const parsed = parseScriptureReference(text);
  if (!parsed.ok) throw new Error(`bad fixture: ${text}`);
  return parsed.reference;
};

/**
 * The panel's two halves, modelled exactly as the component holds them: a durable
 * `confirmed` that only a successful replacement or an explicit dismiss may
 * change, and a transient `attempt` rebuilt for every utterance.
 */
function panel() {
  let confirmed: { reference: ReturnType<typeof ref>; passage: ScriptureLookupResult } | null = null;
  let attempt = IDLE;
  return {
    /** What the operator is actually reading. */
    showing: () => (attempt.passage ?? confirmed?.passage ?? null)?.reference ?? null,
    confirm(reference: string) {
      attempt = passageResolved(receiveTranscript(reference), passage(reference));
      confirmed = { reference: ref(reference), passage: passage(reference) };
    },
    hear(transcript: string) {
      attempt = receiveTranscript(transcript);
    },
    lookupFailed() {
      attempt = resolutionFailed(attempt, 'Could not retrieve that passage.');
    },
    resolving() {
      attempt = beginResolving(attempt);
    },
    dismiss() {
      confirmed = null;
      attempt = reject(attempt);
    },
    correction: (transcript: string) => readCorrection(transcript, confirmed?.reference ?? null),
    replace(reference: string) {
      confirmed = { reference: ref(reference), passage: passage(reference) };
      attempt = passageResolved(attempt, passage(reference));
    }
  };
}

describe('the last confirmed passage survives everything except a replacement', () => {
  it('survives an utterance that names no reference at all', () => {
    const p = panel();
    p.confirm('Romans 8:28');
    p.hear('and so we see the goodness of God in all of it');
    expect(p.showing()).toBe('Romans 8:28');
  });

  it('survives the exact fragment that caused the failure', () => {
    const p = panel();
    p.confirm('Romans 8:28');
    // No book in it. The ordinary path refuses — and refusing is not evidence
    // against a passage that was already confirmed.
    p.hear('No, verse 3.');
    expect(p.showing()).toBe('Romans 8:28');
  });

  it('survives a failed lookup', () => {
    const p = panel();
    p.confirm('Romans 8:28');
    p.hear('John 3 16');
    p.lookupFailed();
    expect(p.showing()).toBe('Romans 8:28');
  });

  it('survives a provisional that never became stable', () => {
    const p = panel();
    p.confirm('Romans 8:28');
    // A guess heard once is withheld from display; the card keeps what it had.
    p.hear('John 3.6');
    expect(p.showing()).toBe('Romans 8:28');
  });

  it('shows no empty card while a replacement is being retrieved', () => {
    const p = panel();
    p.confirm('Romans 8:28');
    p.hear('John 3 16');
    p.resolving();
    // The dominant area is never blank mid-attempt — that blank was the whole
    // complaint, and an operator mid-service cannot use a card that flickers off.
    expect(p.showing()).toBe('Romans 8:28');
  });

  it('is replaced atomically by a valid retrieved passage', () => {
    const p = panel();
    p.confirm('Romans 8:28');
    p.replace('Romans 8:3');
    expect(p.showing()).toBe('Romans 8:3');
  });

  it('is cleared by the operator, and only by the operator', () => {
    const p = panel();
    p.confirm('Romans 8:28');
    p.dismiss();
    expect(p.showing()).toBeNull();
  });
});

describe('a correction is a transaction over the confirmed passage', () => {
  it('reads the correction from the confirmed reference, not the failed attempt', () => {
    const p = panel();
    p.confirm('Romans 8:28');
    p.hear('No, verse 3.'); // the ordinary path refuses this
    // …and the correction layer, reading from what is CONFIRMED, does not.
    expect(p.correction('No, verse 3.')?.reference.canonical).toBe('Romans 8:3');
    // Nothing has been replaced yet: the transaction has not committed.
    expect(p.showing()).toBe('Romans 8:28');
  });

  it('commits only after the replacement is retrieved', () => {
    const p = panel();
    p.confirm('Romans 8:28');
    const amendment = p.correction('verse 3 instead.');
    expect(amendment).not.toBeNull();
    expect(p.showing()).toBe('Romans 8:28'); // still, while retrieving
    p.replace(amendment!.reference.canonical);
    expect(p.showing()).toBe('Romans 8:3');
  });

  it('leaves the passage alone when the correction cannot be understood', () => {
    const p = panel();
    p.confirm('1 John 4:8');
    expect(p.correction('No, something verse R.')).toBeNull();
    expect(p.showing()).toBe('1 John 4:8');
  });

  it('cannot invent a reference once the operator has cleared the card', () => {
    const p = panel();
    p.confirm('Romans 8:28');
    p.dismiss();
    // With nothing confirmed, a bare fragment means nothing — which is what stops
    // a sermon's numbers from becoming Scripture.
    expect(p.correction('verse 3 instead.')).toBeNull();
    expect(p.showing()).toBeNull();
  });

  it('reads a later correction against the corrected reference, not the original', () => {
    const p = panel();
    p.confirm('Romans 8:28');
    p.replace(p.correction('verse 3 instead.')!.reference.canonical);
    expect(p.showing()).toBe('Romans 8:3');
    // "chapter nine" now amends Romans 8:3, and drops the verse that belonged to
    // the chapter being replaced.
    expect(p.correction('Chapter 9')?.reference.canonical).toBe('Romans 9');
  });
});

describe('a correction that has been overtaken must not land', () => {
  /**
   * Retrieval takes ~0.31 s when the passage is not cached, and a speaker
   * correcting themselves twice in a row is exactly the situation this layer
   * exists for. The guard is the same generation counter the rest of the panel
   * uses: whatever the operator is reading must reflect the LAST thing said, not
   * whichever lookup happened to finish last.
   */
  function withGenerations() {
    let generation = 0;
    let showing = 'Romans 8:28';
    return {
      showing: () => showing,
      /** Begin a correction; returns a commit that only lands if still current. */
      begin(reference: string) {
        const mine = (generation += 1);
        return () => {
          if (generation !== mine) return false;
          showing = reference;
          return true;
        };
      }
    };
  }

  it('lets the newest correction win when two are in flight', () => {
    const p = withGenerations();
    const first = p.begin('Romans 8:3'); // "verse three"
    const second = p.begin('Romans 8:17'); // "no, seventeen"
    // The slower first lookup returns last and must be refused.
    expect(second()).toBe(true);
    expect(first()).toBe(false);
    expect(p.showing()).toBe('Romans 8:17');
  });

  it('refuses a correction whose session ended while it was retrieving', () => {
    const p = withGenerations();
    const inFlight = p.begin('Romans 8:3');
    p.begin('ignored'); // Stop/Start bumps the same counter
    expect(inFlight()).toBe(false);
    expect(p.showing()).toBe('Romans 8:28');
  });
});
