import { describe, expect, it } from 'vitest';
import {
  PENDING_ACK_TTL_MS,
  bufferPendingAck,
  drainPendingAcks,
  reduceRealtimeMessage,
  type PendingAck,
  type ProgramSyncState
} from './programSync';
import { CLEAR_PROGRAM_STATE, type OutputStatusState, type ProgramState } from '../types/program';
import type { GraphicInstance, RealtimeMessage } from '../types/graphics';
import {
  createRelaySnapshot,
  reduceRelaySnapshot,
  snapshotReplay
} from '../../scripts/relay-snapshot.mjs';

/**
 * The Program sync reducer — the rule that makes two control clients tell one
 * story and lets output acknowledgements mean something. The two load-bearing
 * properties (per the defect this stage fixes) are:
 *
 *   1. COMMAND-ID MATCHING: an acknowledgement confirms exactly the command
 *      whose id it carries — a stale ack must never confirm a newer command.
 *   2. STALE-OUTPUT PROTECTION: claims decay — reloads, mismatches and old
 *      timestamps always degrade toward "unconfirmed", never toward a claim.
 */

const T0 = 1_000_000;

function graphic(id: string): GraphicInstance {
  return {
    id,
    templateId: 'preacher-lower-third',
    values: { name: 'Mass Choir' },
    theme: {},
    durationSeconds: 0,
    createdAt: '2026-08-06T00:00:00.000Z',
    updatedAt: '2026-08-06T00:00:00.000Z'
  };
}

function show(commandId: string, timestamp: number, graphicId = 'g-1'): RealtimeMessage {
  return { id: commandId, type: 'SHOW_GRAPHIC', payload: graphic(graphicId), timestamp };
}

function clearAll(commandId: string, timestamp: number): RealtimeMessage {
  return { id: commandId, type: 'CLEAR_ALL', payload: {}, timestamp };
}

function applied(commandId: string, timestamp: number, outputId = 'out-1'): RealtimeMessage {
  return {
    id: `ack-${commandId}-${timestamp}`,
    type: 'OUTPUT_APPLIED',
    payload: { commandId, outputId, graphicId: 'g-1' },
    timestamp
  };
}

function cleared(commandId: string, timestamp: number, outputId = 'out-1'): RealtimeMessage {
  return { id: `clr-${commandId}-${timestamp}`, type: 'OUTPUT_CLEARED', payload: { commandId, outputId }, timestamp };
}

function outputFailed(commandId: string, reason: string, timestamp: number): RealtimeMessage {
  return {
    id: `fail-${commandId}-${timestamp}`,
    type: 'OUTPUT_FAILED',
    payload: { commandId, outputId: 'out-1', reason },
    timestamp
  };
}

function outputStatus(sourceActive: boolean | null, timestamp: number, outputId = 'out-1'): RealtimeMessage {
  return {
    id: `st-${timestamp}`,
    type: 'OUTPUT_STATUS',
    payload: { outputId, sourceActive, sourceVisible: sourceActive },
    timestamp
  };
}

function clientState(program: Partial<ProgramState> = {}, output: OutputStatusState | null = null): ProgramSyncState {
  return { program: { ...CLEAR_PROGRAM_STATE, ...program }, outputStatus: output };
}

/** Apply a change the way the store does: absent field = unchanged. */
function apply(state: ProgramSyncState, message: RealtimeMessage, now: number): ProgramSyncState {
  const change = reduceRealtimeMessage(state, message, now);
  return {
    program: change.program ?? state.program,
    outputStatus: change.outputStatus ?? state.outputStatus
  };
}

describe('cross-client commands', () => {
  it("applies another client's SHOW as showing + unconfirmed, with its command id", () => {
    const next = apply(clientState(), show('cmd-A', T0), T0 + 5);
    expect(next.program.status).toBe('showing');
    expect(next.program.confirmation).toBe('unconfirmed');
    expect(next.program.commandId).toBe('cmd-A');
    expect(next.program.instanceId).toBe('g-1');
    expect(next.program.snapshot?.values.name).toBe('Mass Choir');
    expect(next.program.takenAt).toBe(T0);
    // The sender's source metadata is not ours to claim.
    expect(next.program.sourceType).toBeNull();
  });

  it("applies another client's CLEAR as a pending clearing, keeping the last graphic's identity", () => {
    const showing = apply(clientState(), show('cmd-A', T0), T0);
    const next = apply(showing, clearAll('cmd-C', T0 + 100), T0 + 100);
    expect(next.program.status).toBe('clearing');
    expect(next.program.commandId).toBe('cmd-C');
    expect(next.program.snapshot?.id).toBe('g-1'); // "Last sent" wording needs it
  });

  it('a SHOW older than the current record is discarded (out-of-order delivery)', () => {
    const showing = apply(clientState(), show('cmd-new', T0 + 100, 'g-new'), T0 + 100);
    const next = apply(showing, show('cmd-old', T0, 'g-old'), T0 + 200);
    expect(next.program.commandId).toBe('cmd-new');
    expect(next.program.instanceId).toBe('g-new');
  });

  it('a CLEAR older than the current Take cannot blank it', () => {
    const showing = apply(clientState(), show('cmd-new', T0 + 100), T0 + 100);
    const next = apply(showing, clearAll('cmd-old-clear', T0), T0 + 200);
    expect(next.program.status).toBe('showing');
    expect(next.program.commandId).toBe('cmd-new');
  });

  it('a CLEAR over an already-clear Program changes nothing (hydration replay)', () => {
    let state = apply(clientState(), clearAll('cmd-C', T0), T0);
    // A fresh client's Program is clear; the replayed CLEAR must not open a
    // pending "clearing" that only an output could ever resolve.
    expect(state.program.status).toBe('clear');
    state = apply(clientState({ clearedAt: T0 - 100 }), clearAll('cmd-C2', T0), T0);
    expect(state.program.status).toBe('clear');
  });

  it('a settled clear ignores its own OUTPUT_CLEARED arriving again', () => {
    let state = apply(clientState(), show('cmd-A', T0), T0);
    state = apply(state, clearAll('cmd-C', T0 + 10), T0 + 10);
    state = apply(state, cleared('cmd-C', T0 + 20), T0 + 20);
    expect(state.program.status).toBe('clear');
    const change = reduceRealtimeMessage(state, cleared('cmd-C', T0 + 25), T0 + 25);
    expect(change.program).toBeUndefined();
  });

  it('is idempotent for the command it already tracks (echo, replay)', () => {
    const showing = apply(clientState(), show('cmd-A', T0), T0);
    const change = reduceRealtimeMessage(showing, show('cmd-A', T0), T0 + 50);
    expect(change.program).toBeUndefined();
  });

  it('an echoed command never regresses an existing confirmation', () => {
    let state = apply(clientState(), show('cmd-A', T0), T0);
    state = apply(state, applied('cmd-A', T0 + 10), T0 + 10);
    expect(state.program.confirmation).toBe('confirmed');
    const change = reduceRealtimeMessage(state, show('cmd-A', T0), T0 + 20);
    expect(change.program).toBeUndefined();
  });

  it('upgrades a recovering record when the transport replays its exact command', () => {
    const recovering = clientState({
      status: 'recovering',
      commandId: 'cmd-A',
      snapshot: graphic('g-1'),
      instanceId: 'g-1',
      takenAt: T0
    });
    const next = apply(recovering, show('cmd-A', T0), T0 + 500);
    expect(next.program.status).toBe('showing');
    expect(next.program.confirmation).toBe('unconfirmed'); // upgrade proves the command, not the render
    expect(next.program.takenAt).toBe(T0);
  });

  it('preview and theme traffic never touches Program', () => {
    const showing = apply(clientState(), show('cmd-A', T0), T0);
    const preview: RealtimeMessage = { id: 'p1', type: 'UPDATE_PREVIEW', payload: graphic('g-p'), timestamp: T0 + 50 };
    expect(reduceRealtimeMessage(showing, preview, T0 + 50)).toEqual({});
  });
});

describe('acknowledgement matching — the load-bearing rule', () => {
  it('OUTPUT_APPLIED with the matching commandId confirms', () => {
    const showing = apply(clientState(), show('cmd-A', T0), T0);
    const next = apply(showing, applied('cmd-A', T0 + 10), T0 + 10);
    expect(next.program.confirmation).toBe('confirmed');
    expect(next.program.appliedAt).toBe(T0 + 10);
  });

  it('a stale OUTPUT_APPLIED for an older command must not confirm the current one', () => {
    let state = apply(clientState(), show('cmd-old', T0), T0);
    state = apply(state, show('cmd-new', T0 + 100, 'g-new'), T0 + 100);
    const next = apply(state, applied('cmd-old', T0 + 110), T0 + 110);
    expect(next.program.commandId).toBe('cmd-new');
    expect(next.program.confirmation).toBe('unconfirmed');
    expect(next.program.appliedAt).toBeNull();
    // …but the ack still proves the output page is alive.
    expect(next.outputStatus?.lastSeenAt).toBe(T0 + 110);
  });

  it('OUTPUT_FAILED with the matching commandId surfaces the failure', () => {
    const showing = apply(clientState(), show('cmd-A', T0), T0);
    const next = apply(showing, outputFailed('cmd-A', 'Template "x" is not available in this build', T0 + 10), T0 + 10);
    expect(next.program.outputFailure?.reason).toContain('not available');
    expect(next.program.confirmation).toBe('unconfirmed');
  });

  it('a stale OUTPUT_FAILED cannot smear a newer command', () => {
    let state = apply(clientState(), show('cmd-old', T0), T0);
    state = apply(state, show('cmd-new', T0 + 100), T0 + 100);
    const next = apply(state, outputFailed('cmd-old', 'boom', T0 + 110), T0 + 110);
    expect(next.program.outputFailure).toBeNull();
  });

  it('a failure never un-confirms an applied command', () => {
    let state = apply(clientState(), show('cmd-A', T0), T0);
    state = apply(state, applied('cmd-A', T0 + 10), T0 + 10);
    const next = apply(state, outputFailed('cmd-A', 'late retry failed', T0 + 20), T0 + 20);
    expect(next.program.confirmation).toBe('confirmed');
    expect(next.program.outputFailure).toBeNull();
  });

  it('CLEAR stays pending until OUTPUT_CLEARED for the matching command', () => {
    let state = apply(clientState(), show('cmd-A', T0), T0);
    state = apply(state, clearAll('cmd-C', T0 + 100), T0 + 100);
    expect(state.program.status).toBe('clearing');
    // A cleared ack for some OTHER clear changes nothing.
    const wrong = apply(state, cleared('cmd-other', T0 + 110), T0 + 110);
    expect(wrong.program.status).toBe('clearing');
    // The matching one settles it.
    const done = apply(state, cleared('cmd-C', T0 + 120), T0 + 120);
    expect(done.program.status).toBe('clear');
    expect(done.program.snapshot).toBeNull();
    expect(done.program.clearedAt).toBe(T0 + 120);
  });

  it('a stale OUTPUT_CLEARED for an earlier clear cannot blank a newer Take', () => {
    let state = apply(clientState(), clearAll('cmd-C', T0), T0);
    state = apply(state, show('cmd-new', T0 + 100), T0 + 100);
    const next = apply(state, cleared('cmd-C', T0 + 110), T0 + 110);
    expect(next.program.status).toBe('showing');
    expect(next.program.commandId).toBe('cmd-new');
  });

  it('an OUTPUT_CLEARED naming a SHOW command id cannot blank a showing Program', () => {
    // Matching id alone is not enough — the acknowledgement KIND must fit the
    // pending command. A buggy or forged OUTPUT_CLEARED that echoes the SHOW's
    // own id would otherwise blank a graphic that is still on air.
    const showing = apply(clientState(), show('cmd-A', T0), T0);
    const next = apply(showing, cleared('cmd-A', T0 + 10), T0 + 10);
    expect(next.program.status).toBe('showing');
    expect(next.program.snapshot).not.toBeNull();
  });

  it('an OUTPUT_APPLIED naming the pending clear id cannot flip clearing into confirmed-showing', () => {
    let state = apply(clientState(), show('cmd-A', T0), T0);
    state = apply(state, clearAll('cmd-C', T0 + 10), T0 + 10);
    const next = apply(state, applied('cmd-C', T0 + 20), T0 + 20);
    expect(next.program.status).toBe('clearing');
    expect(next.program.confirmation).toBe('unconfirmed');
  });

  it('an ack matching a FAILED record does not resurrect it — the send failure stays visible', () => {
    // 'failed' is the operator's cue that their transport (usually a dead or
    // misconfigured relay) needs fixing; a same-browser ack must not paper
    // over it with a confident OUTPUT READY.
    const failed = clientState({
      status: 'failed',
      commandId: 'cmd-A',
      snapshot: graphic('g-1')
    });
    const next = apply(failed, applied('cmd-A', T0 + 10), T0 + 10);
    expect(next.program.status).toBe('failed');
    expect(next.program.confirmation).toBe('unconfirmed');
  });

  it('output restoring after refresh re-confirms a recovering record by exact id', () => {
    const recovering = clientState({
      status: 'recovering',
      commandId: 'cmd-A',
      snapshot: graphic('g-1'),
      takenAt: T0
    });
    const next = apply(recovering, applied('cmd-A', T0 + 500), T0 + 500);
    expect(next.program.status).toBe('showing');
    expect(next.program.confirmation).toBe('confirmed');
  });

  it('an ack for a DIFFERENT id leaves a recovering record unverified', () => {
    const recovering = clientState({
      status: 'recovering',
      commandId: 'cmd-A',
      snapshot: graphic('g-1'),
      takenAt: T0
    });
    const next = apply(recovering, applied('cmd-B', T0 + 500), T0 + 500);
    expect(next.program.status).toBe('recovering');
    expect(next.program.confirmation).toBe('unconfirmed');
  });
});

describe('output presence', () => {
  it('OUTPUT_STATUS records the reading at the receiver clock and never touches Program', () => {
    const showing = apply(clientState(), show('cmd-A', T0), T0);
    const change = reduceRealtimeMessage(showing, outputStatus(true, T0 + 10), T0 + 42);
    expect(change.program).toBeUndefined();
    expect(change.outputStatus).toEqual({
      outputId: 'out-1',
      sourceActive: true,
      sourceVisible: true,
      lastSeenAt: T0 + 42 // receiver clock, not the message's
    });
  });

  it('acks refresh lastSeenAt but carry no source reading of their own', () => {
    const withStatus = apply(clientState(), outputStatus(true, T0), T0);
    const state = apply(withStatus, show('cmd-A', T0 + 1), T0 + 1);
    const next = apply(state, applied('cmd-A', T0 + 10), T0 + 10);
    expect(next.outputStatus?.sourceActive).toBe(true); // same output session: reading survives
    expect(next.outputStatus?.lastSeenAt).toBe(T0 + 10);
  });

  it("a different output session's ack resets source readings to unknown", () => {
    const withStatus = apply(clientState(), outputStatus(true, T0), T0);
    const state = apply(withStatus, show('cmd-A', T0 + 1), T0 + 1);
    const next = apply(state, applied('cmd-A', T0 + 10, 'out-2'), T0 + 10);
    expect(next.outputStatus?.outputId).toBe('out-2');
    expect(next.outputStatus?.sourceActive).toBeNull();
  });
});

describe('the ack-before-mark race (found in browser QA)', () => {
  /**
   * The publisher records its own command only after the relay answers the
   * POST; a same-browser output acknowledges over BroadcastChannel first. The
   * refused ack is buffered and drained when the command is recorded —
   * WITHOUT weakening the stale-ack rule: draining runs the same reducer.
   */
  it('a buffered OUTPUT_CLEARED settles the clear recorded moments later', () => {
    const showing = apply(clientState(), show('cmd-A', T0), T0);
    // The early ack arrives while Program still tracks cmd-A: refused, buffered.
    const early = cleared('cmd-C', T0 + 100);
    expect(reduceRealtimeMessage(showing, early, T0 + 100).program).toBeUndefined();
    const pending = bufferPendingAck([], early, T0 + 100);
    // Now the publisher records its clear and drains.
    const clearingState: ProgramSyncState = {
      ...showing,
      program: { ...showing.program, status: 'clearing', commandId: 'cmd-C', clearedAt: T0 + 150 }
    };
    const drained = drainPendingAcks(clearingState, pending, T0 + 200);
    expect(drained.program.status).toBe('clear');
    expect(drained.pending).toEqual([]); // consumed
  });

  it('a buffered OUTPUT_APPLIED confirms the Take recorded moments later', () => {
    const early = applied('cmd-A', T0 + 10);
    const pending = bufferPendingAck([], early, T0 + 10);
    const showing = apply(clientState(), show('cmd-A', T0), T0);
    const drained = drainPendingAcks(showing, pending, T0 + 50);
    expect(drained.program.confirmation).toBe('confirmed');
    expect(drained.pending).toEqual([]);
  });

  it('a genuinely stale ack is NOT consumed by the drain and expires instead', () => {
    const staleAck = applied('cmd-old', T0 + 10);
    let pending: PendingAck[] = bufferPendingAck([], staleAck, T0 + 10);
    const showing = apply(clientState(), show('cmd-new', T0 + 20), T0 + 20);
    const drained = drainPendingAcks(showing, pending, T0 + 30);
    expect(drained.program.confirmation).toBe('unconfirmed'); // still no false claim
    expect(drained.pending).toHaveLength(1); // carried, not consumed…
    pending = bufferPendingAck(drained.pending, null, T0 + 10 + PENDING_ACK_TTL_MS);
    expect(pending).toEqual([]); // …and gone once the TTL passes
  });

  it('the drain itself honours the TTL', () => {
    const early = cleared('cmd-C', T0);
    const pending = bufferPendingAck([], early, T0);
    const clearing = apply(apply(clientState(), show('cmd-A', T0 - 100), T0 - 100), clearAll('cmd-C', T0 + 1), T0 + 1);
    const drained = drainPendingAcks(clearing, pending, T0 + PENDING_ACK_TTL_MS + 1);
    expect(drained.program.status).toBe('clearing'); // too old to trust
    expect(drained.pending).toEqual([]);
  });
});

/**
 * Three clients, one relay — the real topology, modelled with the real relay
 * reducer (`scripts/relay-snapshot.mjs`) as the bus. Dock (OBS CEF) and studio
 * (system browser) share NO localStorage; the only common ground is the relay.
 */
describe('two control clients and the relay snapshot', () => {
  it('a studio Take reaches a separately mounted dock, and both tell the same story', () => {
    let relay = createRelaySnapshot();
    let dock = clientState();
    // Studio publishes; the relay reduces and broadcasts; the dock applies.
    const command = show('cmd-A', T0);
    relay = reduceRelaySnapshot(relay, command, T0);
    dock = apply(dock, command, T0 + 1);
    // Output applies it and acknowledges through the same bus.
    const ack = applied('cmd-A', T0 + 5);
    relay = reduceRelaySnapshot(relay, ack, T0 + 5);
    dock = apply(dock, ack, T0 + 6);
    expect(dock.program.status).toBe('showing');
    expect(dock.program.confirmation).toBe('confirmed');
    expect(dock.program.snapshot?.values.name).toBe('Mass Choir');
    // The dock can no longer say "Ready / Nothing on air".
    expect(dock.program.status).not.toBe('clear');
  });

  it('a dock Clear reaches the studio symmetrically', () => {
    const command = show('cmd-A', T0);
    let studio = apply(clientState(), command, T0);
    const clear = clearAll('cmd-C', T0 + 100);
    studio = apply(studio, clear, T0 + 101);
    expect(studio.program.status).toBe('clearing');
    studio = apply(studio, cleared('cmd-C', T0 + 105), T0 + 105);
    expect(studio.program.status).toBe('clear');
  });

  it('a client opened AFTER the command hydrates from the snapshot replay', () => {
    let relay = createRelaySnapshot();
    relay = reduceRelaySnapshot(relay, show('cmd-A', T0), T0);
    relay = reduceRelaySnapshot(relay, applied('cmd-A', T0 + 5), T0 + 5);
    relay = reduceRelaySnapshot(relay, outputStatus(true, T0 + 6), T0 + 6);
    // A fresh dock: empty Program, applies the replay in the order served.
    let dock = clientState();
    for (const message of snapshotReplay(relay)) {
      dock = apply(dock, message, T0 + 100);
    }
    expect(dock.program.status).toBe('showing');
    expect(dock.program.confirmation).toBe('confirmed');
    expect(dock.outputStatus?.sourceActive).toBe(true);
  });

  it('two clients that heard the same traffic hold identical Program cores', () => {
    const traffic = [show('cmd-A', T0), applied('cmd-A', T0 + 5), clearAll('cmd-C', T0 + 50), cleared('cmd-C', T0 + 55)];
    let a = clientState();
    let b = clientState();
    for (const message of traffic) {
      a = apply(a, message, message.timestamp + 1);
      b = apply(b, message, message.timestamp + 1);
    }
    expect(a.program).toEqual(b.program);
    expect(a.program.status).toBe('clear');
  });
});
