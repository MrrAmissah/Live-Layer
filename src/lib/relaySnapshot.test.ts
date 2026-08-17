import { describe, expect, it } from 'vitest';
import {
  createRelaySnapshot,
  reduceRelaySnapshot,
  snapshotReplay,
  validateRelayMessage
} from '../../scripts/relay-snapshot.mjs';
import type { RealtimeMessage } from '../types/graphics';

/**
 * The relay's snapshot reducer — the module `livelayer-lan-relay.mjs` imports,
 * exercised directly. THE bug the old single `lastMessage` slot would have
 * caused, stated as the first test: a heartbeat lands every few seconds, so
 * whatever event happened last would replace the command a reconnecting
 * `/output` needs to restore its graphic.
 */

const T0 = 5_000_000;

const show = (id: string, timestamp: number): RealtimeMessage => ({
  id,
  type: 'SHOW_GRAPHIC',
  payload: {
    id: `g-${id}`,
    templateId: 'preacher-lower-third',
    values: { name: 'Mass Choir' },
    theme: {},
    durationSeconds: 0,
    createdAt: '2026-08-06T00:00:00.000Z',
    updatedAt: '2026-08-06T00:00:00.000Z'
  },
  timestamp
});

const applied = (commandId: string, timestamp: number): RealtimeMessage => ({
  id: `ack-${commandId}`,
  type: 'OUTPUT_APPLIED',
  payload: { commandId, outputId: 'out-1', graphicId: 'g-x' },
  timestamp
});

const status = (timestamp: number): RealtimeMessage => ({
  id: `st-${timestamp}`,
  type: 'OUTPUT_STATUS',
  payload: { outputId: 'out-1', sourceActive: true, sourceVisible: true },
  timestamp
});

const statusFrom = (
  outputId: string,
  timestamp: number,
  sourceActive: boolean | null
): RealtimeMessage => ({
  id: `st-${outputId}-${timestamp}`,
  type: 'OUTPUT_STATUS',
  payload: { outputId, sourceActive, sourceVisible: sourceActive === null ? null : true },
  timestamp
});

describe('every screen survives a reconnect, not just the last one to speak', () => {
  it('replays a status for EACH output session', () => {
    /**
     * THE DEFECT, and it is the missed half of a fix the brief called out:
     * Program's `outputs` became a map keyed by session id when a second
     * browser source appeared, and this snapshot stayed a single `status` slot
     * holding whoever spoke last.
     *
     * A control page that reloads — or an EventSource that drops and comes
     * back, which is what an unstable relay looks like — rebuilds its whole
     * picture of the rig from this replay. With one slot it learned about
     * exactly ONE screen, chosen by the timing of a 15-second heartbeat. If
     * that screen was a page with no OBS binding, the desk read OUTPUT READY
     * while a source was plainly active, and flipped back when the real
     * source's next heartbeat arrived.
     */
    let s = createRelaySnapshot();
    s = reduceRelaySnapshot(s, statusFrom('obs-main', T0, true), T0);
    s = reduceRelaySnapshot(s, statusFrom('preview-tab', T0 + 1_000, null), T0 + 1_000);

    const replayed = snapshotReplay(s).filter((m) => m.type === 'OUTPUT_STATUS');
    expect(replayed.map((m) => (m.payload as { outputId: string }).outputId).sort()).toEqual([
      'obs-main',
      'preview-tab'
    ]);
    // The measuring source's reading is still in there — that is the whole point.
    const main = replayed.find((m) => (m.payload as { outputId: string }).outputId === 'obs-main');
    expect((main!.payload as { sourceActive: boolean }).sourceActive).toBe(true);
  });

  it('keeps one entry per session however long the rig runs', () => {
    let s = createRelaySnapshot();
    for (let i = 0; i < 40; i += 1) {
      s = reduceRelaySnapshot(s, statusFrom('obs-main', T0 + i * 15_000, true), T0 + i * 15_000);
    }
    expect(snapshotReplay(s).filter((m) => m.type === 'OUTPUT_STATUS')).toHaveLength(1);
  });

  it('forgets a session that has been silent for five minutes', () => {
    /**
     * Every page load mints a new session id, so a refreshed browser source
     * leaves its predecessor behind. Without pruning, a fortnight of restarts
     * replays a crowd of dead screens to every reconnecting client.
     */
    let s = createRelaySnapshot();
    s = reduceRelaySnapshot(s, statusFrom('old-session', T0, true), T0);
    s = reduceRelaySnapshot(s, statusFrom('live-session', T0 + 301_000, true), T0 + 301_000);
    const ids = snapshotReplay(s)
      .filter((m) => m.type === 'OUTPUT_STATUS')
      .map((m) => (m.payload as { outputId: string }).outputId);
    expect(ids).toEqual(['live-session']);
  });

  it('does NOT replay a screen that has gone quiet as though it were current', () => {
    /**
     * The wrinkle a per-output map makes worse. A receiver stamps `lastSeenAt`
     * when a status ARRIVES, so everything replayed is treated as fresh
     * evidence — and replaying a session that stopped four minutes ago tells a
     * reconnecting desk a dead source is alive. OUTPUT ACTIVE for a screen that
     * is gone is precisely the claim this vocabulary refuses to make.
     *
     * It stays in the map for `/health`; it is just not repeated as current.
     */
    let s = createRelaySnapshot();
    s = reduceRelaySnapshot(s, statusFrom('died-4-min-ago', T0, true), T0);
    s = reduceRelaySnapshot(s, statusFrom('still-here', T0 + 240_000, true), T0 + 240_000);
    const ids = snapshotReplay(s, T0 + 240_000)
      .filter((m: RealtimeMessage) => m.type === 'OUTPUT_STATUS')
      .map((m: RealtimeMessage) => (m.payload as { outputId: string }).outputId);
    expect(ids).toEqual(['still-here']);
    // Retained, though — the two windows are deliberately different.
    expect(Object.keys(s.statuses)).toHaveLength(2);
  });

  it('replays the looks and the command before any status', () => {
    // Unchanged contract: a reconnecting output must know how it paints and
    // what it is painting before it hears about anyone's source state.
    let s = createRelaySnapshot();
    s = reduceRelaySnapshot(s, statusFrom('obs-main', T0, true), T0);
    s = reduceRelaySnapshot(s, show('cmd-A', T0 + 10), T0 + 10);
    s = reduceRelaySnapshot(s, statusFrom('split', T0 + 20, false), T0 + 20);
    const types = snapshotReplay(s).map((m) => m.type);
    expect(types.indexOf('SHOW_GRAPHIC')).toBeLessThan(types.indexOf('OUTPUT_STATUS'));
  });
});

describe('a status event can never displace the command', () => {
  it('keeps the command through any number of heartbeats, and a reconnect replays it first', () => {
    let s = createRelaySnapshot();
    s = reduceRelaySnapshot(s, show('cmd-A', T0), T0);
    for (let i = 1; i <= 20; i += 1) {
      s = reduceRelaySnapshot(s, status(T0 + i * 15_000), T0 + i * 15_000);
    }
    expect(s.command?.id).toBe('cmd-A');
    const replay = snapshotReplay(s);
    expect(replay[0]?.type).toBe('SHOW_GRAPHIC'); // /output restores before anything else applies
    expect(replay[0]?.id).toBe('cmd-A');
  });

  it('acks refresh output liveness without touching the command slot', () => {
    let s = createRelaySnapshot();
    s = reduceRelaySnapshot(s, show('cmd-A', T0), T0);
    s = reduceRelaySnapshot(s, applied('cmd-A', T0 + 5), T0 + 5);
    expect(s.command?.id).toBe('cmd-A');
    expect(s.outputLastSeenAt).toBe(T0 + 5);
  });
});

describe('ack retention is command-id matched', () => {
  it('retains the ack that answers the current command', () => {
    let s = createRelaySnapshot();
    s = reduceRelaySnapshot(s, show('cmd-A', T0), T0);
    s = reduceRelaySnapshot(s, applied('cmd-A', T0 + 5), T0 + 5);
    expect(s.ack?.id).toBe('ack-cmd-A');
  });

  it('drops a stale ack from retention rather than replaying it beside a newer command', () => {
    let s = createRelaySnapshot();
    s = reduceRelaySnapshot(s, show('cmd-A', T0), T0);
    s = reduceRelaySnapshot(s, show('cmd-B', T0 + 100), T0 + 100);
    s = reduceRelaySnapshot(s, applied('cmd-A', T0 + 110), T0 + 110);
    expect(s.ack).toBeNull();
    expect(snapshotReplay(s).some((m) => m.type === 'OUTPUT_APPLIED')).toBe(false);
  });

  it('a new command resets the previous ack', () => {
    let s = createRelaySnapshot();
    s = reduceRelaySnapshot(s, show('cmd-A', T0), T0);
    s = reduceRelaySnapshot(s, applied('cmd-A', T0 + 5), T0 + 5);
    s = reduceRelaySnapshot(s, show('cmd-B', T0 + 100), T0 + 100);
    expect(s.ack).toBeNull();
    expect(s.command?.id).toBe('cmd-B');
  });
});

describe('the replay is a coherent snapshot in apply-safe order', () => {
  it('serves command → matching ack → status', () => {
    let s = createRelaySnapshot();
    // Arrival order scrambled on purpose: status first, then command, then ack.
    s = reduceRelaySnapshot(s, status(T0 - 10), T0 - 10);
    s = reduceRelaySnapshot(s, show('cmd-A', T0), T0);
    s = reduceRelaySnapshot(s, applied('cmd-A', T0 + 5), T0 + 5);
    expect(snapshotReplay(s).map((m) => m.type)).toEqual(['SHOW_GRAPHIC', 'OUTPUT_APPLIED', 'OUTPUT_STATUS']);
  });

  it('preview/theme traffic is never retained for replay', () => {
    let s = createRelaySnapshot();
    s = reduceRelaySnapshot(s, show('cmd-A', T0), T0);
    const preview = {
      id: 'p-1',
      type: 'UPDATE_PREVIEW',
      payload: { anything: true },
      timestamp: T0 + 1
    } as unknown as RealtimeMessage;
    s = reduceRelaySnapshot(s, preview, T0 + 1);
    expect(snapshotReplay(s).map((m) => m.id)).toEqual(['cmd-A']);
  });
});

describe('bounded per-type validation', () => {
  const envelope = { id: 'm-1', timestamp: T0 };

  it('accepts every command with an object payload, exactly like the old relay', () => {
    for (const type of ['SHOW_GRAPHIC', 'HIDE_GRAPHIC', 'CLEAR_ALL', 'UPDATE_PREVIEW', 'LOAD_PRESET', 'SET_THEME']) {
      expect(validateRelayMessage({ ...envelope, type, payload: {} }).ok).toBe(true);
      expect(validateRelayMessage({ ...envelope, type, payload: 'nope' }).ok).toBe(false);
    }
  });

  it('rejects output events without the fields matching depends on', () => {
    expect(validateRelayMessage({ ...envelope, type: 'OUTPUT_APPLIED', payload: { outputId: 'o' } }).ok).toBe(false);
    expect(validateRelayMessage({ ...envelope, type: 'OUTPUT_CLEARED', payload: { commandId: 'c' } }).ok).toBe(false);
    expect(
      validateRelayMessage({ ...envelope, type: 'OUTPUT_FAILED', payload: { commandId: 'c', outputId: 'o' } }).ok
    ).toBe(false); // no reason
    expect(
      validateRelayMessage({
        ...envelope,
        type: 'OUTPUT_FAILED',
        payload: { commandId: 'c', outputId: 'o', reason: 'template missing' }
      }).ok
    ).toBe(true);
    expect(validateRelayMessage({ ...envelope, type: 'OUTPUT_STATUS', payload: {} }).ok).toBe(false);
  });

  it('rejects unknown types and broken envelopes', () => {
    expect(validateRelayMessage({ ...envelope, type: 'TOTALLY_NEW', payload: {} }).ok).toBe(false);
    expect(validateRelayMessage({ id: 'x', type: 'CLEAR_ALL', payload: {} }).ok).toBe(false); // no timestamp
    expect(validateRelayMessage('garbage').ok).toBe(false);
  });
});
