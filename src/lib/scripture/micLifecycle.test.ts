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

/**
 * Chrome's actual AudioContext semantics, which the previous fake did not model.
 *
 * A context constructed outside a user-gesture call stack starts **suspended**,
 * and a suspended context never fires `onaudioprocess` — no PCM leaves the page.
 * `start()` awaits `getUserMedia` before building the audio graph, so by the time
 * the context exists the synchronous gesture stack is long gone.
 *
 * The old fake reported `state = 'running'` from birth, which is why every
 * lifecycle test passed while the second listening session produced no transcript
 * in a real browser.
 */
class FakeAudioContext {
  sampleRate = 16000;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  static throwOnConstruct = false;
  static live: FakeAudioContext[] = [];
  constructor() {
    if (FakeAudioContext.throwOnConstruct) throw new Error('AudioContext unavailable');
    FakeAudioContext.live.push(this);
  }
  createMediaStreamSource() {
    if (this.state === 'closed') throw new Error('context is closed');
    return { connect: () => undefined };
  }
  createScriptProcessor() {
    if (this.state === 'closed') throw new Error('context is closed');
    const node = { connect: () => undefined, disconnect: () => undefined, onaudioprocess: null };
    processors.push({ node, context: this });
    return node;
  }
  resume() {
    if (this.state !== 'closed') this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

/** Every processor handed out, with the context that owns it. */
const processors: { node: { onaudioprocess: ((event: unknown) => void) | null }; context: FakeAudioContext }[] = [];

/**
 * Deliver one audio block, as the browser would — which means ONLY when the
 * owning context is actually running.
 */
function deliverAudio(samples: Float32Array): number {
  let delivered = 0;
  for (const { node, context } of processors) {
    if (context.state !== 'running' || !node.onaudioprocess) continue;
    node.onaudioprocess({ inputBuffer: { getChannelData: () => samples } });
    delivered += 1;
  }
  return delivered;
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


describe('the SECOND listening session must work as well as the first', () => {
  /**
   * Human evidence: the first session works, the second "barely responds and
   * frequently produces no transcript at all". Every existing lifecycle test
   * passed, because they asserted that the microphone was released — not that
   * audio was ever produced again.
   *
   * The property that was missing: **PCM must actually flow on every session.**
   */
  const block = (n: number, amplitude: number): Float32Array => {
    const out = new Float32Array(n);
    let seed = 7;
    for (let i = 0; i < n; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      out[i] = ((seed / 0x7fffffff) * 2 - 1) * amplitude;
    }
    return out;
  };

  it('produces PCM on the second and third sessions, not only the first', async () => {
    processors.length = 0;
    FakeAudioContext.live.length = 0;
    const h = harness();
    const sentPerSession: number[] = [];

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await h.source.start();
      h.fire('open');
      const before = h.sockets[h.sockets.length - 1].sent.length;
      deliverAudio(block(1024, 0.2));
      deliverAudio(block(1024, 0.2));
      sentPerSession.push(h.sockets[h.sockets.length - 1].sent.length - before);
      h.source.stop();
    }

    // The failure this pins: [2, 0, 0] — the first session speaks, the rest are mute.
    expect(sentPerSession, 'a later session produced no PCM at all').toEqual([2, 2, 2]);
  });

  it('never leaves the audio path suspended when it reports listening', async () => {
    processors.length = 0;
    FakeAudioContext.live.length = 0;
    const h = harness();
    await h.source.start();
    h.fire('open');
    const current = FakeAudioContext.live[FakeAudioContext.live.length - 1];
    expect(current.state, 'reported ready over a context that cannot deliver audio').toBe('running');
    h.source.stop();
  });

  it('closes each session’s context rather than reusing a dead one', async () => {
    processors.length = 0;
    FakeAudioContext.live.length = 0;
    const h = harness();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await h.source.start();
      h.fire('open');
      h.source.stop();
    }
    // Every context that was retired is closed, and none is reused after closing.
    const closed = FakeAudioContext.live.filter((c) => c.state === 'closed');
    expect(closed.length).toBe(FakeAudioContext.live.length);
  });
});

describe('the listening control never moves', () => {
  /**
   * A screenshot review found Start rendered below the manual lookup panel and
   * the Stop that replaced it at the TOP of the workspace. Pressing a button and
   * then having to look for it is not something a live surface may ask, and it is
   * worst immediately after the press — which is when Stop matters most.
   *
   * The cause was CSS order swapping on listening state. These pin the fix at
   * both levels: one slot in the markup, and no rule that moves it.
   */
  const workspace = readFileSync(
    new URL('../../app/workspaces/ScriptureWorkspace.tsx', import.meta.url),
    'utf8'
  );
  const styles = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

  it('gives the live panel a single fixed slot', () => {
    expect(workspace).toContain('scripture-workspace__live');
    // One instance, one position — asserted elsewhere too, and cheap to keep.
    expect((workspace.match(/<VoiceAssistPreview/g) ?? [])).toHaveLength(1);
  });

  it('has no rule that reorders the workspace on listening state', () => {
    // `[data-listening] … order:` is the exact shape that moved the control.
    const reorder = /scripture-workspace\[data-listening\][^{]*\{[^}]*order/;
    expect(reorder.test(styles), 'a listening-state rule still reorders the workspace').toBe(false);
  });

  it('puts the live panel above the manual lookup, in both states', () => {
    const live = /\.scripture-workspace__live\s*\{[^}]*order:\s*(\d+)/.exec(styles);
    const manual = /\.scripture-workspace__manual\s*\{[^}]*order:\s*(\d+)/.exec(styles);
    expect(live).not.toBeNull();
    expect(manual).not.toBeNull();
    expect(Number(live![1])).toBeLessThan(Number(manual![1]));
  });

  it('reserves a fixed height for the strip so nothing below it shifts', () => {
    // Off is button + one line; listening adds the meter. Reserving the taller
    // state keeps the Scripture content beneath it still across a toggle.
    expect(/\.live-mic\s*\{[^}]*min-height:/.test(styles)).toBe(true);
  });
});
