import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ENDPOINTER,
  emptyEndpointer,
  frameDb,
  pushFrame,
  toFrames
} from './utteranceEndpointer';
import { createLiveTranscriptSource } from './liveTranscriptSource';
import { applyTranscriptEvent, EMPTY_STREAM } from './transcriptStream';

const FRAME = (DEFAULT_ENDPOINTER.sampleRate * 20) / 1000;
const silence = (frames: number) => Array.from({ length: frames }, () => new Float32Array(FRAME));
const speech = (frames: number, level = 0.2) =>
  Array.from({ length: frames }, () =>
    Float32Array.from({ length: FRAME }, (_, i) => Math.sin(i * 0.3) * level)
  );

/** Feed frames and collect every released utterance. */
function run(frames: Float32Array[]) {
  let state = emptyEndpointer();
  const released: Float32Array[] = [];
  let sawSpeaking = false;
  for (const frame of frames) {
    const result = pushFrame(state, frame, DEFAULT_ENDPOINTER);
    state = result.state;
    if (result.speaking) sawSpeaking = true;
    if (result.utterance) released.push(result.utterance);
  }
  return { released, sawSpeaking, state };
}

describe('deciding when the speaker has stopped', () => {
  it('releases nothing while silence continues', () => {
    expect(run(silence(200)).released).toHaveLength(0);
  });

  it('releases one utterance after speech then a hangover of silence', () => {
    const { released } = run([...silence(30), ...speech(40), ...silence(40)]);
    expect(released).toHaveLength(1);
  });

  it('does not release while the speaker is still going', () => {
    // Long speech with only short gaps must stay one utterance, not fragment on
    // every breath.
    const { released } = run([...silence(30), ...speech(30), ...silence(10), ...speech(30)]);
    expect(released).toHaveLength(0);
  });

  it('separates two utterances across a real pause', () => {
    const { released } = run([
      ...silence(30), ...speech(30), ...silence(40), ...speech(30), ...silence(40)
    ]);
    expect(released).toHaveLength(2);
  });

  it('discards a blip too short to be an utterance', () => {
    // A cough must not be sent to the model, and must not become a transcript.
    const { released } = run([...silence(30), ...speech(3), ...silence(40)]);
    expect(released).toHaveLength(0);
  });

  it('reports speaking, which is what the indicator shows', () => {
    expect(run([...silence(30), ...speech(30), ...silence(40)]).sawSpeaking).toBe(true);
    expect(run(silence(100)).sawSpeaking).toBe(false);
  });

  it('cuts an utterance that never ends, rather than buffering without bound', () => {
    const frames = Math.ceil(DEFAULT_ENDPOINTER.maxUtteranceMs / 20) + 20;
    const { released } = run([...silence(20), ...speech(frames)]);
    expect(released.length).toBeGreaterThanOrEqual(1);
  });

  it('measures level in dB, so a quiet and a loud voice both register', () => {
    expect(frameDb(new Float32Array(FRAME))).toBeLessThan(-100);
    expect(frameDb(speech(1, 0.5)[0])).toBeGreaterThan(frameDb(speech(1, 0.02)[0]));
    // Both are speech against the same floor.
    expect(run([...silence(30), ...speech(40, 0.02), ...silence(40)]).released).toHaveLength(1);
  });

  it('frames a stream at 20ms and drops the ragged tail', () => {
    expect(toFrames(new Float32Array(FRAME * 3 + 7))).toHaveLength(3);
  });
});

/** Minimal fakes: the source must be testable without a microphone. */
function harness(overrides: { failMedia?: string } = {}) {
  const sent: ArrayBuffer[] = [];
  const tracks = [{ stop: vi.fn() }];
  const socketListeners: Record<string, ((event: unknown) => void)[]> = {};
  const socket = {
    readyState: 1,
    binaryType: '',
    send: (data: ArrayBuffer) => sent.push(data),
    close: vi.fn(),
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      (socketListeners[type] ??= []).push(fn);
    }
  };
  const statuses: { status: string; detail: string }[] = [];
  const source = createLiveTranscriptSource({
    getMedia: overrides.failMedia
      ? () => Promise.reject(Object.assign(new Error('no'), { name: overrides.failMedia }))
      : () => Promise.resolve({ getTracks: () => tracks } as unknown as MediaStream),
    createSocket: () => socket as unknown as WebSocket,
    onStatus: (s) => statuses.push({ status: s.status, detail: s.detail })
  });
  const fire = (type: string, event: unknown) => socketListeners[type]?.forEach((fn) => fn(event));
  return { source, sent, tracks, statuses, fire, socket };
}

describe('the live source, as a transcript port', () => {
  it('declares itself live and stoppable, which the UI depends on', () => {
    const { source } = harness();
    expect(source.isLive).toBe(true);
    expect(source.isListening()).toBe(false);
    expect(typeof source.stop).toBe('function');
    expect(source.languages.length).toBeGreaterThan(0);
  });

  it('emits only FINAL events, because the model has no partial hypotheses', async () => {
    const { source, fire } = harness();
    await source.start();
    const events: { isFinal: boolean; text: string }[] = [];
    source.subscribe((e) => events.push({ isFinal: e.isFinal, text: e.text }));
    fire('message', { data: JSON.stringify({ text: 'John three sixteen' }) });
    expect(events).toEqual([{ isFinal: true, text: 'John three sixteen' }]);
  });

  it('gives each utterance its own segment, so the reducer keeps them apart', async () => {
    const { source, fire } = harness();
    await source.start();
    const ids: string[] = [];
    source.subscribe((e) => ids.push(e.segmentId));
    fire('message', { data: JSON.stringify({ text: 'one' }) });
    fire('message', { data: JSON.stringify({ text: 'two' }) });
    expect(new Set(ids).size).toBe(2);
  });

  it('drops an empty or malformed frame rather than parsing it', async () => {
    const { source, fire } = harness();
    await source.start();
    const events: unknown[] = [];
    source.subscribe((e) => events.push(e));
    fire('message', { data: JSON.stringify({ text: '   ' }) });
    fire('message', { data: 'not json at all' });
    fire('message', { data: JSON.stringify({}) });
    expect(events).toHaveLength(0);
  });

  it('feeds the stream reducer, which releases the text for parsing', async () => {
    const { source, fire } = harness();
    await source.start();
    let update = { state: EMPTY_STREAM, finalText: null as string | null, ignored: '' as string };
    source.subscribe((event) => {
      update = applyTranscriptEvent(update.state, event) as typeof update;
    });
    fire('message', { data: JSON.stringify({ text: 'Romans eight twenty eight' }) });
    expect(update.finalText).toBe('Romans eight twenty eight');
  });
});

describe('failure degrades to typing, never to silence', () => {
  it('says so when permission is refused', async () => {
    const { source, statuses } = harness({ failMedia: 'NotAllowedError' });
    await source.start();
    const last = statuses[statuses.length - 1];
    expect(last.status).toBe('denied');
    expect(last.detail).toMatch(/type the reference/i);
    expect(source.isListening()).toBe(false);
  });

  it('says so when there is no microphone', async () => {
    const { source, statuses } = harness({ failMedia: 'NotFoundError' });
    await source.start();
    expect(statuses[statuses.length - 1].status).toBe('unavailable');
    expect(statuses[statuses.length - 1].detail).toMatch(/type the reference/i);
  });

  it('says so when the local service is not running', async () => {
    const { source, fire, statuses } = harness();
    await source.start().catch(() => undefined);
    fire('error', {});
    const last = statuses[statuses.length - 1];
    expect(last.status).toBe('unavailable');
    expect(last.detail).toMatch(/local speech service/i);
    expect(source.isListening()).toBe(false);
  });
});

describe('stopping releases the microphone', () => {
  it('stops every track, so capture cannot outlive the operator pressing stop', async () => {
    const { source, tracks } = harness();
    await source.start().catch(() => undefined);
    source.stop();
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(source.isListening()).toBe(false);
  });

  it('is safe to stop when never started', () => {
    const { source } = harness();
    expect(() => source.stop()).not.toThrow();
  });
});

describe('what the live source refuses to be', () => {
  it('has no way to accept, stage, queue or take', () => {
    const { source } = harness();
    for (const forbidden of ['accept', 'stage', 'queue', 'take', 'publish', 'send']) {
      expect(forbidden in source, forbidden).toBe(false);
    }
  });

  it('carries no audio, tensors or credentials across the port', async () => {
    const { source, fire } = harness();
    await source.start();
    let event: Record<string, unknown> | null = null;
    source.subscribe((e) => {
      event = e as unknown as Record<string, unknown>;
    });
    fire('message', { data: JSON.stringify({ text: 'John three sixteen', inference_seconds: 0.1 }) });
    // Exactly the TranscriptEvent shape from §4 — nothing more rides along.
    expect(Object.keys(event!).sort()).toEqual(
      ['isFinal', 'language', 'segmentId', 'sequence', 'sourceId', 'text'].sort()
    );
  });
});
