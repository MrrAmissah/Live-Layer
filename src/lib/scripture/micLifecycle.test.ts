import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createLiveTranscriptSource } from './liveTranscriptSource';

/**
 * The microphone must never outlive the UI that claims to own it.
 *
 * Human evidence that produced this file: Chrome's site controls said
 * **"Microphone — Using now"** while LiveLayer said **"Start listening /
 * Microphone off"**. Permission was not the problem. `getUserMedia` had handed
 * over a live track and the source had lost its listening state without releasing
 * it — so the operator could see no way to turn off a microphone that was on.
 *
 * Every test below takes one route from "permission granted" to "not listening"
 * and asserts the same single property: **no track is left live**. That is the
 * one invariant an operator cannot verify for themselves and cannot recover from.
 */

class FakeAudioContext {
  sampleRate = 16000;
  state = 'running';
  static throwOnConstruct = false;
  constructor() {
    if (FakeAudioContext.throwOnConstruct) throw new Error('AudioContext unavailable');
  }
  createMediaStreamSource() {
    return { connect: () => undefined };
  }
  createScriptProcessor() {
    return { connect: () => undefined, disconnect: () => undefined, onaudioprocess: null };
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}
(globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
(globalThis as unknown as { WebSocket: unknown }).WebSocket ??= { CONNECTING: 0, OPEN: 1, CLOSED: 3 };

/** A track that knows whether it is still live, like the real thing. */
function fakeTrack() {
  const track = {
    readyState: 'live' as 'live' | 'ended',
    stop: vi.fn(() => {
      track.readyState = 'ended';
    }),
    getSettings: () => ({})
  };
  return track;
}

interface Options {
  readyState?: number;
  failMedia?: string;
  socketThrows?: boolean;
  contextThrows?: boolean;
}

function harness(options: Options = {}) {
  FakeAudioContext.throwOnConstruct = Boolean(options.contextThrows);
  /** Every track ever handed out, so a leak cannot hide behind a reassignment. */
  const granted: ReturnType<typeof fakeTrack>[][] = [];
  const sockets: {
    readyState: number;
    sent: unknown[];
    close: ReturnType<typeof vi.fn>;
    listeners: Record<string, ((event: unknown) => void)[]>;
  }[] = [];
  const statuses: { status: string; detail: string }[] = [];

  const source = createLiveTranscriptSource({
    getMedia: options.failMedia
      ? () => Promise.reject(Object.assign(new Error('no'), { name: options.failMedia }))
      : () => {
          const tracks = [fakeTrack()];
          granted.push(tracks);
          return Promise.resolve({
            getTracks: () => tracks,
            getAudioTracks: () => tracks
          } as unknown as MediaStream);
        },
    createSocket: () => {
      if (options.socketThrows) throw new Error('cannot open socket');
      const listeners: Record<string, ((event: unknown) => void)[]> = {};
      const socket = {
        readyState: options.readyState ?? 1,
        binaryType: '',
        sent: [] as unknown[],
        listeners,
        send: (data: unknown) => socket.sent.push(data),
        close: vi.fn(() => {
          socket.readyState = 3;
        }),
        addEventListener: (type: string, fn: (event: unknown) => void) => {
          (listeners[type] ??= []).push(fn);
        }
      };
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    onStatus: (s) => statuses.push({ status: s.status, detail: s.detail })
  });

  const fire = (type: string, index = sockets.length - 1) =>
    sockets[index]?.listeners[type]?.forEach((fn) => fn({}));
  /** The property under test, across every stream ever granted. */
  const liveTracks = () => granted.flat().filter((t) => t.readyState === 'live').length;

  return { source, granted, sockets, statuses, fire, liveTracks };
}

const lastStatus = (statuses: { status: string }[]) => statuses[statuses.length - 1]?.status;

describe('a failure after permission must still release the microphone', () => {
  it('releases when the socket cannot be created at all', async () => {
    const h = harness({ socketThrows: true });
    await h.source.start();
    expect(h.granted.flat()).toHaveLength(1); // permission WAS granted
    expect(h.liveTracks(), 'a track survived a failed start').toBe(0);
    expect(h.source.isListening()).toBe(false);
  });

  it('releases when audio setup throws', async () => {
    const h = harness({ contextThrows: true });
    await h.source.start();
    expect(h.granted.flat()).toHaveLength(1);
    expect(h.liveTracks(), 'a track survived an AudioContext failure').toBe(0);
    expect(h.source.isListening()).toBe(false);
  });

  it('releases when the service refuses the connection', async () => {
    const h = harness({ readyState: 0 });
    await h.source.start();
    h.fire('error');
    expect(h.liveTracks(), 'a track survived a socket error').toBe(0);
    expect(lastStatus(h.statuses)).toBe('unavailable');
  });

  /**
   * The exact shape of the reported bug. A socket that closes DURING startup —
   * before the source has finished declaring itself listening — is the one path
   * where "not listening yet" and "microphone already open" overlap.
   */
  it('releases when the socket closes before listening is established', async () => {
    const h = harness({ readyState: 0 });
    await h.source.start();
    h.fire('close');
    expect(h.liveTracks(), 'a track survived a close during startup').toBe(0);
    expect(h.source.isListening()).toBe(false);
  });

  it('releases when the service closes an established connection', async () => {
    const h = harness();
    await h.source.start();
    h.fire('open');
    expect(h.source.isListening()).toBe(true);
    h.fire('close');
    expect(h.liveTracks(), 'a track survived the service hanging up').toBe(0);
    expect(h.source.isListening()).toBe(false);
  });
});

describe('stop always releases, however it is reached', () => {
  it('releases every track on an explicit stop', async () => {
    const h = harness();
    await h.source.start();
    h.fire('open');
    h.source.stop();
    expect(h.liveTracks()).toBe(0);
    expect(h.source.isListening()).toBe(false);
  });

  it('releases a stream granted AFTER the operator stopped', async () => {
    // The permission prompt outlives the click that opened it. A stream arriving
    // after Stop is never assigned anywhere, so only the start path can release it.
    const h = harness();
    const starting = h.source.start();
    h.source.stop();
    await starting;
    expect(h.granted.flat().length).toBeGreaterThan(0);
    expect(h.liveTracks(), 'a late-granted track was never released').toBe(0);
  });

  it('leaks nothing across repeated start/stop cycles', async () => {
    const h = harness();
    for (let i = 0; i < 5; i += 1) {
      await h.source.start();
      h.fire('open');
      expect(h.source.isListening(), `cycle ${i} should be listening`).toBe(true);
      h.source.stop();
      expect(h.liveTracks(), `cycle ${i} leaked a track`).toBe(0);
    }
    // Five cycles, five streams, none of them live.
    expect(h.granted).toHaveLength(5);
    expect(h.liveTracks()).toBe(0);
  });

  it('is safe to stop twice', async () => {
    const h = harness();
    await h.source.start();
    h.fire('open');
    h.source.stop();
    h.source.stop();
    expect(h.liveTracks()).toBe(0);
  });
});

describe('the UI can never say off while the microphone is on', () => {
  /**
   * The invariant stated directly, over every route out of listening. If any of
   * these ever disagree, the operator sees Chrome's indicator on and LiveLayer's
   * button offering to Start — with no control that turns the microphone off.
   */
  const routes: [string, (h: ReturnType<typeof harness>) => void][] = [
    ['explicit stop', (h) => h.source.stop()],
    ['socket error', (h) => h.fire('error')],
    ['socket close', (h) => h.fire('close')]
  ];

  for (const [name, act] of routes) {
    it(`holds after ${name}`, async () => {
      const h = harness();
      await h.source.start();
      h.fire('open');
      act(h);
      const claimsOff = !h.source.isListening();
      expect(claimsOff, `${name} should leave the UI reporting off`).toBe(true);
      expect(h.liveTracks(), `${name} left the microphone live while the UI said off`).toBe(0);
    });
  }
});

describe('an old session cannot revive listening', () => {
  it('ignores a late open from a socket the operator already stopped', async () => {
    const h = harness();
    await h.source.start();
    h.source.stop();
    // The first socket's open arrives after Stop; it must not restart anything.
    h.fire('open', 0);
    expect(h.source.isListening()).toBe(false);
    expect(h.liveTracks()).toBe(0);
  });

  it('does not let an old socket close tear down a newer session', async () => {
    const h = harness();
    await h.source.start();
    h.fire('open', 0);
    h.source.stop();
    await h.source.start();
    h.fire('open', 1);
    expect(h.source.isListening()).toBe(true);
    // The OLD socket now closes. The new session must survive it.
    h.fire('close', 0);
    expect(h.source.isListening(), 'an old socket closed the new session').toBe(true);
  });
});

describe('the panel that owns the microphone keeps its identity', () => {
  /**
   * A source-level check, because the failure it pins is invisible to every unit
   * test above: the source behaved perfectly, and the microphone was still lost.
   *
   * The workspace briefly rendered `VoiceAssistPreview` in one of TWO positions
   * depending on whether the operator was listening. Moving a component between
   * positions in the children array makes React unmount the old instance and
   * mount a fresh one — so the panel holding the microphone was destroyed and
   * recreated at the exact moment Start was pressed. Chrome reported the
   * microphone in use; LiveLayer offered to start listening.
   *
   * The rule this asserts: it is rendered ONCE, and order is a matter of CSS.
   */
  const workspace = readFileSync(
    new URL('../../app/workspaces/ScriptureWorkspace.tsx', import.meta.url),
    'utf8'
  );

  it('renders the live panel exactly once', () => {
    const rendered = workspace.match(/<VoiceAssistPreview/g) ?? [];
    expect(rendered, 'the microphone panel must not be rendered in two places').toHaveLength(1);
  });

  it('does not make the live panel conditional on listening state', () => {
    // `{listening ? <VoiceAssistPreview .../> : null}` is the exact shape that
    // remounts it, and remounting is what loses the microphone.
    expect(/listening\s*\?[^\n]*VoiceAssistPreview/.test(workspace)).toBe(false);
    expect(/VoiceAssistPreview[^\n]*:\s*null/.test(workspace)).toBe(false);
  });

  it('reorders with CSS instead', () => {
    expect(workspace).toContain('scripture-workspace__live');
    expect(workspace).toContain('scripture-workspace__manual');
  });
});
