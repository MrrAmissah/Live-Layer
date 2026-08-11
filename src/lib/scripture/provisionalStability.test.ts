import { describe, expect, it } from 'vitest';
import {
  NO_AGREEMENT,
  decideDisplay,
  forgetAgreement,
  observeProvisional,
  REQUIRED_AGREEMENT
} from './provisionalStability';

/** Replay a run of provisional readings and report which ones would be displayed. */
function replay(readings: { segment: string; reference: string }[]): (string | null)[] {
  let state = NO_AGREEMENT;
  return readings.map(({ segment, reference }) => {
    const verdict = observeProvisional(state, segment, reference);
    state = verdict.state;
    return verdict.displayEligible ? reference : null;
  });
}

describe('a guess must be heard twice before it fills the passage card', () => {
  /**
   * The defect this exists for, in the exact shape the rehearsal produced it.
   * "John three sixteen" spoken once, recognised progressively: a snapshot taken
   * before the last syllable lands reads `John 3:6`, which is a real verse, and
   * not the one that was said.
   */
  it('does not display a reading that the next revision contradicts', () => {
    expect(replay([
      { segment: 'u1', reference: 'John 3:6' },
      { segment: 'u1', reference: 'John 3:16' }
    ])).toEqual([null, null]);
  });

  it('displays a reading two consecutive revisions agree on', () => {
    expect(replay([
      { segment: 'u1', reference: 'John 3:16' },
      { segment: 'u1', reference: 'John 3:16' }
    ])).toEqual([null, 'John 3:16']);
  });

  it('displays the corrected reading once IT has been said twice', () => {
    expect(replay([
      { segment: 'u1', reference: 'John 3:6' },
      { segment: 'u1', reference: 'John 3:16' },
      { segment: 'u1', reference: 'John 3:16' }
    ])).toEqual([null, null, 'John 3:16']);
  });

  /**
   * Disagreement RESETS rather than decays. Two different readings are evidence
   * that recognition has not settled; letting them sum would let `John 3:6` and
   * `John 3:16` between them earn a display neither of them had.
   */
  it('starts again from one when the reading changes', () => {
    const state = observeProvisional(
      observeProvisional(NO_AGREEMENT, 'u1', 'John 3:16').state,
      'u1',
      'John 3:17'
    );
    expect(state.state.agreement).toBe(1);
    expect(state.displayEligible).toBe(false);
  });

  it('keeps a settled card up rather than rebuilding it every revision', () => {
    // Four revisions of a speaker still talking, all naming the same reference.
    expect(replay([
      { segment: 'u1', reference: 'Romans 8:28' },
      { segment: 'u1', reference: 'Romans 8:28' },
      { segment: 'u1', reference: 'Romans 8:28' },
      { segment: 'u1', reference: 'Romans 8:28' }
    ])).toEqual([null, 'Romans 8:28', 'Romans 8:28', 'Romans 8:28']);
  });

  /**
   * A genuine short reference must stay possible. The rule delays a reading by one
   * revision; it must never make one unreachable, or "John three six" becomes a
   * verse the operator can hear but the surface cannot show.
   */
  it('does not make a genuine short verse impossible', () => {
    expect(replay([
      { segment: 'u1', reference: 'John 3:6' },
      { segment: 'u1', reference: 'John 3:6' }
    ])).toEqual([null, 'John 3:6']);
  });
});

describe('agreement never crosses the thing it is about', () => {
  it('will not let the previous utterance vote for this one', () => {
    // Two utterances, each naming John 3:16 once. Neither has been said twice.
    expect(replay([
      { segment: 'u1', reference: 'John 3:16' },
      { segment: 'u2', reference: 'John 3:16' }
    ])).toEqual([null, null]);
  });

  it('will not let a vote survive a Stop', () => {
    const first = observeProvisional(NO_AGREEMENT, 'u1', 'John 3:16');
    expect(first.displayEligible).toBe(false);
    // Operator stops listening; the source is torn down and votes are dropped.
    const afterStop = forgetAgreement();
    expect(afterStop).toEqual(NO_AGREEMENT);
    // Start again, say the same reference: it is the FIRST time, not the second.
    expect(observeProvisional(afterStop, 'u1', 'John 3:16').displayEligible).toBe(false);
  });

  it('forgets on demand without reaching into the previous state', () => {
    const settled = observeProvisional(
      observeProvisional(NO_AGREEMENT, 'u1', 'Psalms 23:1').state,
      'u1',
      'Psalms 23:1'
    );
    expect(settled.displayEligible).toBe(true);
    expect(forgetAgreement().agreement).toBe(0);
    expect(forgetAgreement().reference).toBeNull();
    expect(forgetAgreement().segmentId).toBeNull();
  });
});

describe('what this deliberately is not', () => {
  it('counts revisions, and exposes no score to be mistaken for one', () => {
    const verdict = observeProvisional(NO_AGREEMENT, 'u1', 'John 3:16');
    // An integer count and a boolean. Nothing here is a probability, and nothing
    // here should be rendered as one.
    expect(Object.keys(verdict.state).sort()).toEqual(['agreement', 'reference', 'segmentId']);
    expect(Number.isInteger(verdict.state.agreement)).toBe(true);
    expect(typeof verdict.displayEligible).toBe('boolean');
  });

  it('needs exactly two, which is what the rehearsal and the UI both assume', () => {
    expect(REQUIRED_AGREEMENT).toBe(2);
  });
});

describe('the decision both paths share', () => {
  it('lets a final display at once, with no votes required', () => {
    const cold = decideDisplay(NO_AGREEMENT, { segmentId: 'u1', reference: 'John 3:16', isFinal: true });
    expect(cold.display).toBe(true);
  });

  it('lets a final display a reference no provisional ever proposed', () => {
    // Provisionals were converging on the wrong verse; the final has the whole
    // utterance and overrules them without waiting to be confirmed.
    const after = decideDisplay(
      observeProvisional(NO_AGREEMENT, 'u1', 'John 3:6').state,
      { segmentId: 'u1', reference: 'John 3:16', isFinal: true }
    );
    expect(after.display).toBe(true);
    expect(after.state).toEqual(NO_AGREEMENT);
  });

  it('clears the votes as it settles the utterance', () => {
    const settled = decideDisplay(
      observeProvisional(NO_AGREEMENT, 'u1', 'John 3:16').state,
      { segmentId: 'u1', reference: 'John 3:16', isFinal: true }
    );
    // Nothing from the finished utterance can count toward the next one.
    expect(decideDisplay(settled.state, { segmentId: 'u2', reference: 'John 3:16', isFinal: false }).display).toBe(
      false
    );
  });

  /**
   * The stale-lookup rule. Every revision obsoletes what came before it, so a
   * retrieval for a reading recognition has moved off cannot arrive late and
   * reinstate itself over the card the operator is now reading.
   */
  it('obsoletes work in flight on every revision, displayed or not', () => {
    const changed = decideDisplay(
      observeProvisional(observeProvisional(NO_AGREEMENT, 'u1', 'John 3:16').state, 'u1', 'John 3:16').state,
      { segmentId: 'u1', reference: 'John 3:17', isFinal: false }
    );
    expect(changed.display).toBe(false); // 3:17 has been said once
    expect(changed.invalidatePending).toBe(true); // …and 3:16's lookup is dead
  });

  it('obsoletes work in flight when a final overtakes a provisional', () => {
    expect(
      decideDisplay(NO_AGREEMENT, { segmentId: 'u1', reference: 'John 3:16', isFinal: true }).invalidatePending
    ).toBe(true);
  });
});
