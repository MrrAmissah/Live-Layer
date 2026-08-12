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

/**
 * Minimal fakes: the source must be testable without a microphone OR a Web Audio
 * implementation. Node has neither, and without this stub `start()` throws after
 * registering its socket listeners — which the session guard then correctly treats
 * as a dead session, so every later assertion fails for the wrong reason.
 */
/** The last script processor handed out, so a test can push audio through it. */
let lastProcessor: { onaudioprocess: ((event: unknown) => void) | null } | null = null;

class FakeAudioContext {
  sampleRate = 16000;
  createMediaStreamSource() {
    return { connect: () => undefined };
  }
  createScriptProcessor() {
    const processor = { connect: () => undefined, disconnect: () => undefined, onaudioprocess: null };
    lastProcessor = processor as unknown as { onaudioprocess: ((event: unknown) => void) | null };
    return processor;
  }
  close() {
    return Promise.resolve();
  }
}

/** Push one block of samples through the capture path, as the browser would. */
function pushAudio(samples: Float32Array) {
  lastProcessor?.onaudioprocess?.({ inputBuffer: { getChannelData: () => samples } });
}

const block = (n: number, amplitude: number, seedIn = 3): Float32Array => {
  const out = new Float32Array(n);
  let seed = seedIn;
  for (let i = 0; i < n; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    out[i] = ((seed / 0x7fffffff) * 2 - 1) * amplitude;
  }
  return out;
};

/** Read the 16-byte header the service parses with `struct('<IIIi')`. */
function readHeader(frame: ArrayBuffer) {
  const view = new DataView(frame);
  return {
    session: view.getUint32(0, true),
    utterance: view.getUint32(4, true),
    revision: view.getUint32(8, true),
    final: view.getInt32(12, true),
    samples: (frame.byteLength - 16) / 2
  };
}
(globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
(globalThis as unknown as { WebSocket: unknown }).WebSocket ??= { CONNECTING: 0, OPEN: 1 };

/** Minimal fakes: the source must be testable without a microphone. */
function harness(
  overrides: {
    failMedia?: string;
    readyState?: number;
    captureConstraints?: MediaStreamConstraints[];
    audioConstraints?: MediaTrackConstraints;
  } = {}
) {
  const tracks = [{ stop: vi.fn() }];
  const statuses: { status: string; detail: string }[] = [];
  /**
   * A NEW socket per connection, because that is what the browser does. Reusing one
   * object made every session share a listener map, so a message aimed at an old
   * session was also delivered to the new session's handler — the harness would have
   * hidden exactly the bug these tests exist to catch.
   */
  const sockets: {
    readyState: number;
    sent: ArrayBuffer[];
    listeners: Record<string, ((event: unknown) => void)[]>;
    close: ReturnType<typeof vi.fn>;
  }[] = [];
  const createSocket = () => {
    const listeners: Record<string, ((event: unknown) => void)[]> = {};
    const socket = {
      readyState: overrides.readyState ?? 1,
      binaryType: '',
      sent: [] as ArrayBuffer[],
      listeners,
      send(data: ArrayBuffer) {
        socket.sent.push(data);
      },
      close: vi.fn(),
      addEventListener: (type: string, fn: (event: unknown) => void) => {
        (listeners[type] ??= []).push(fn);
      }
    };
    sockets.push(socket);
    return socket as unknown as WebSocket;
  };
  const source = createLiveTranscriptSource({
    audioConstraints: overrides.audioConstraints,
    getMedia: overrides.failMedia
      ? () => Promise.reject(Object.assign(new Error('no'), { name: overrides.failMedia }))
      : (constraints: MediaStreamConstraints) => {
          overrides.captureConstraints?.push(constraints);
          return Promise.resolve({ getTracks: () => tracks } as unknown as MediaStream);
        },
    createSocket,
    onStatus: (s) => statuses.push({ status: s.status, detail: s.detail })
  });
  /** Fire at a specific socket; defaults to the most recent one. */
  const fireOn = (index: number, type: string, event: unknown) =>
    sockets[index]?.listeners[type]?.forEach((fn) => fn(event));
  const fire = (type: string, event: unknown) => fireOn(sockets.length - 1, type, event);
  return { source, tracks, statuses, fire, fireOn, sockets };
}

describe('the live source, as a transcript port', () => {
  it('declares itself live and stoppable, which the UI depends on', () => {
    const { source } = harness();
    expect(source.isLive).toBe(true);
    expect(source.isListening()).toBe(false);
    expect(typeof source.stop).toBe('function');
    expect(source.languages.length).toBeGreaterThan(0);
  });

  it('labels a provisional snapshot interim and the endpoint result final', async () => {
    /**
     * This used to assert that EVERY event was final, on the reasoning that the
     * model has no partial hypotheses. That is still true of the model — each
     * snapshot is a complete re-recognition of the utterance so far — but it was
     * the wrong conclusion for the consumer. From the reducer's side a revisable
     * guess for an utterance still in progress is exactly what interim means, and
     * calling it final let half a sentence stand as the settled answer.
     */
    const { source, fire } = harness();
    await source.start();
    const events: { isFinal: boolean; text: string }[] = [];
    source.subscribe((e) => events.push({ isFinal: e.isFinal, text: e.text }));
    fire('message', { data: JSON.stringify({ session: 1, utterance: 1, revision: 1, final: false, text: 'jon chapter' }) });
    fire('message', { data: JSON.stringify({ session: 1, utterance: 1, revision: 2, final: true, text: 'jon chapter three vers sixteen' }) });
    expect(events).toEqual([
      { isFinal: false, text: 'jon chapter' },
      { isFinal: true, text: 'jon chapter three vers sixteen' }
    ]);
  });

  it('ignores a provisional result that arrives AFTER its final', async () => {
    // A snapshot made from half the sentence must never replace the authoritative
    // answer just because the network delivered it late.
    const { source, fire } = harness();
    await source.start();
    const events: { isFinal: boolean; text: string }[] = [];
    source.subscribe((e) => events.push({ isFinal: e.isFinal, text: e.text }));
    fire('message', { data: JSON.stringify({ session: 1, utterance: 1, revision: 3, final: true, text: 'the whole sentence' }) });
    fire('message', { data: JSON.stringify({ session: 1, utterance: 1, revision: 2, final: false, text: 'half of it' }) });
    expect(events).toEqual([{ isFinal: true, text: 'the whole sentence' }]);
  });

  it('ignores a result belonging to another session', async () => {
    const { source, fire } = harness();
    await source.start();
    const events: unknown[] = [];
    source.subscribe((e) => events.push(e));
    fire('message', { data: JSON.stringify({ session: 999, utterance: 1, revision: 1, final: true, text: 'not ours' }) });
    expect(events).toHaveLength(0);
  });

  it('gives each utterance its own segment, so the reducer keeps them apart', async () => {
    const { source, fire } = harness();
    await source.start();
    const ids: string[] = [];
    source.subscribe((e) => ids.push(e.segmentId));
    fire('message', { data: JSON.stringify({ session: 1, utterance: 1, revision: 1, final: true, text: 'one' }) });
    fire('message', { data: JSON.stringify({ session: 1, utterance: 2, revision: 1, final: true, text: 'two' }) });
    expect(new Set(ids).size).toBe(2);
  });

  it('drops an empty or malformed frame rather than parsing it', async () => {
    const { source, fire } = harness();
    await source.start();
    const events: unknown[] = [];
    source.subscribe((e) => events.push(e));
    fire('message', { data: JSON.stringify({ utterance: 1, revision: 1, final: false, text: '   ' }) });
    fire('message', { data: 'not json at all' });
    fire('message', { data: JSON.stringify({ utterance: 2, revision: 1, final: false }) });
    expect(events).toHaveLength(0);
  });

  it('feeds the stream reducer, which releases the text for parsing', async () => {
    const { source, fire } = harness();
    await source.start();
    let update = { state: EMPTY_STREAM, finalText: null as string | null, ignored: '' as string };
    source.subscribe((event) => {
      update = applyTranscriptEvent(update.state, event) as typeof update;
    });
    fire('message', {
      data: JSON.stringify({ session: 1, utterance: 1, revision: 1, final: true, text: 'Romans eight twenty eight' })
    });
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

  it('reports stopped even when the permission prompt was still open', async () => {
    // Otherwise the status line keeps saying "Asking for the microphone…" over a
    // source that has already been torn down.
    const { source, statuses } = harness();
    const starting = source.start();
    source.stop();
    await starting;
    const last = statuses[statuses.length - 1];
    expect(last.status).toBe('stopped');
    expect(last.detail).toBe('');
    expect(source.isListening()).toBe(false);
  });

  it('releases a microphone granted AFTER the operator stopped', async () => {
    // The dangerous version of the above: teardown had already cleared `stream`, so
    // a track arriving late was never tracked and stop() could not reach it.
    const { source, tracks } = harness();
    const starting = source.start();
    source.stop();
    await starting;
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(source.isListening()).toBe(false);
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
    fire('message', { data: JSON.stringify({ utterance: 1, revision: 1, final: true, text: 'John three sixteen', inference_seconds: 0.1 }) });
    // Exactly the TranscriptEvent shape from §4 — nothing more rides along.
    expect(Object.keys(event!).sort()).toEqual(
      ['isFinal', 'language', 'segmentId', 'sequence', 'sourceId', 'text'].sort()
    );
  });
});


describe('a stopped session can never speak again', () => {
  it('discards a response that was already in flight when Stop was pressed', async () => {
    const { source, fire } = harness();
    await source.start();
    const events: unknown[] = [];
    source.subscribe((e) => events.push(e));
    source.stop();
    // The service replies to an utterance sent before the operator stopped.
    fire('message', { data: JSON.stringify({ session: 1, utterance: 1, revision: 1, final: true, text: 'John three sixteen' }) });
    expect(events).toHaveLength(0);
  });

  it('discards an OLD session response arriving after Stop then Start', async () => {
    // The dangerous one: `listening` is true again, so a flag check would let a
    // transcript from before the stop be offered as the new session's first result.
    const { source, fireOn } = harness();
    await source.start();
    source.stop();
    await source.start();
    const events: unknown[] = [];
    source.subscribe((e) => events.push(e));
    // Socket 0 belongs to the session that already ended.
    fireOn(0, 'message', { data: JSON.stringify({ utterance: 1, revision: 1, final: true, text: 'from the previous session' }) });
    expect(events).toHaveLength(0);
  });

  it('still accepts a response belonging to the CURRENT session', async () => {
    const { source, fire } = harness();
    await source.start();
    source.stop();
    await source.start();
    const events: { text: string }[] = [];
    source.subscribe((e) => events.push({ text: e.text }));
    fire('message', { data: JSON.stringify({ utterance: 1, revision: 1, final: true, text: 'Romans eight one' }) });
    expect(events).toEqual([{ text: 'Romans eight one' }]);
  });

  it('an old socket erroring cannot tear down a newer session', async () => {
    const { source, fireOn } = harness();
    await source.start();
    source.stop();
    await source.start();
    expect(source.isListening()).toBe(true);
    fireOn(0, 'error', {}); // the session that already ended
    expect(source.isListening()).toBe(true);
  });

  it('an old socket closing cannot stop a newer session', async () => {
    const { source, fireOn } = harness();
    await source.start();
    source.stop();
    await source.start();
    fireOn(0, 'close', {});
    expect(source.isListening()).toBe(true);
  });
});

describe('connection readiness is reported honestly', () => {
  it('does not claim Listening while the socket is still CONNECTING', async () => {
    const { source, statuses } = harness({ readyState: 0 });
    await source.start();
    const last = statuses[statuses.length - 1];
    expect(last.status).toBe('starting');
    expect(last.detail).toMatch(/connecting/i);
  });

  it('claims Listening once the socket opens', async () => {
    const { source, statuses, fire } = harness({ readyState: 0 });
    await source.start();
    fire('open', {});
    expect(statuses[statuses.length - 1].status).toBe('listening');
  });

  it('claims Listening immediately when the socket is already open', async () => {
    const { source, statuses } = harness();
    await source.start();
    expect(statuses[statuses.length - 1].status).toBe('listening');
  });
});

describe('the wire protocol the local recogniser parses', () => {
  /**
   * Identity travels WITH the audio, in a 16-byte little-endian header the service
   * reads as `struct('<IIIi')`. It is not metadata for logging: progressive
   * recognition means several answers are in flight for one utterance, and arrival
   * order is not identity. A provisional that took longer than the final it was
   * superseded by would otherwise overwrite the only answer that has to be right.
   */
  const speak = async (blocks: number) => {
    const { source, sockets } = harness();
    await source.start();
    // Room tone first, so the detector has a floor to measure speech against.
    for (let i = 0; i < 40; i += 1) pushAudio(block(1024, 0.0008, 5 + i));
    for (let i = 0; i < blocks; i += 1) pushAudio(block(1024, 0.25, 100 + i));
    for (let i = 0; i < 40; i += 1) pushAudio(block(1024, 0.0008, 900 + i));
    return sockets[0].sent.map(readHeader);
  };

  it('puts a readable header in front of every frame of audio', async () => {
    const frames = await speak(60);
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame.session).toBeGreaterThan(0);
      expect(frame.utterance).toBeGreaterThan(0);
      expect(frame.revision).toBeGreaterThan(0);
      // 16-bit PCM, so a whole number of samples with nothing left over.
      expect(Number.isInteger(frame.samples)).toBe(true);
      expect(frame.samples).toBeGreaterThan(0);
    }
  });

  it('numbers revisions within one utterance, and ends it with exactly one final', async () => {
    const frames = await speak(60);
    const finals = frames.filter((f) => f.final === 1);
    expect(finals).toHaveLength(1);
    // Every frame belongs to the same utterance…
    expect(new Set(frames.map((f) => f.utterance)).size).toBe(1);
    // …and revisions rise, so the newest is identifiable without a clock.
    const revisions = frames.map((f) => f.revision);
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
    expect(new Set(revisions).size).toBe(revisions.length);
    // The final is the last word on this utterance.
    expect(frames[frames.length - 1].final).toBe(1);
  });

  it('sends each provisional as more audio than the one before it', async () => {
    // A snapshot is the utterance SO FAR — it grows, it is not a fresh window.
    const provisionals = (await speak(60)).filter((f) => f.final === 0);
    expect(provisionals.length).toBeGreaterThan(1);
    for (let i = 1; i < provisionals.length; i += 1) {
      expect(provisionals[i].samples).toBeGreaterThan(provisionals[i - 1].samples);
    }
  });

  it('sends the final as the whole utterance, not just its tail', async () => {
    const frames = await speak(60);
    const last = frames[frames.length - 1];
    const biggestProvisional = Math.max(...frames.filter((f) => f.final === 0).map((f) => f.samples));
    expect(last.samples).toBeGreaterThanOrEqual(biggestProvisional);
  });
});

describe('what the microphone is actually asked for', () => {
  /**
   * The first human microphone test returned `"jon thr ixteen"` for "John three
   * sixteen" — vowels intact, the `ee` of "three" and the `s` of "sixteen" gone.
   * The same words recognise cleanly when a FILE goes through the same model and
   * the same pipeline, and the only thing a file never passes through is Chrome's
   * voice-call processing, which this asked for explicitly.
   */
  it('does not ask Chrome to clean up the audio before the recogniser sees it', async () => {
    const asked: MediaStreamConstraints[] = [];
    const { source } = harness({ captureConstraints: asked });
    await source.start();
    const audio = asked[0].audio as MediaTrackConstraints;
    // A spectral gate tuned for telephony removes the quietest, broadest parts of
    // speech — which is what a fricative is.
    expect(audio.noiseSuppression).toBe(false);
    expect(audio.autoGainControl).toBe(false);
    // Nothing here echoes; cancelling an echo path that does not exist costs signal.
    expect(audio.echoCancellation).toBe(false);
    expect(audio.channelCount).toBe(1);
  });

  it('still lets a room that genuinely needs processing turn it back on', async () => {
    const asked: MediaStreamConstraints[] = [];
    const { source } = harness({ captureConstraints: asked, audioConstraints: { noiseSuppression: true } });
    await source.start();
    expect((asked[0].audio as MediaTrackConstraints).noiseSuppression).toBe(true);
  });
});
