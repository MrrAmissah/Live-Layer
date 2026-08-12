import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ENDPOINTER,
  emptyEndpointer,
  frameDb,
  pushFrame,
  toFrames
} from './utteranceEndpointer';
import {
  createLiveTranscriptSource,
  CAPTURE_PROFILES,
  captureProfileFromLocation,
  type CaptureProfileName
} from './liveTranscriptSource';
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

/**
 * A block of audio. `amplitude` sets the loud parts; `syllabic` gives it the
 * shape speech has.
 *
 * The shape matters now. Flat-amplitude noise is precisely what the silence
 * shield rejects — it has no dynamic range, which is what separates a voice from
 * a room — so a test that used it as "speech" was asserting the protocol against
 * something the pipeline is designed never to send. Real speech swings between
 * loud vowels and near-silent stops, and so does this.
 */
const block = (n: number, amplitude: number, seedIn = 3, syllabic = true): Float32Array => {
  const out = new Float32Array(n);
  let seed = seedIn;
  for (let i = 0; i < n; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    // ~7 Hz envelope, roughly a syllable rate, dipping to near silence between.
    const envelope = syllabic ? Math.pow(Math.abs(Math.sin((i / 16000) * Math.PI * 7)), 3) + 0.0002 : 1;
    out[i] = ((seed / 0x7fffffff) * 2 - 1) * amplitude * envelope;
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
    captureProfile?: CaptureProfileName;
    onCaptureSettings?: (settings: MediaTrackSettings) => void;
  } = {}
) {
  // A real MediaStreamTrack reports what Chrome honoured; the fake must too, or
  // the settings-reporting path is untestable.
  const tracks = [
    { stop: vi.fn(), getSettings: () => ({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }) }
  ];
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
    captureProfile: overrides.captureProfile,
    onCaptureSettings: overrides.onCaptureSettings,
    getMedia: overrides.failMedia
      ? () => Promise.reject(Object.assign(new Error('no'), { name: overrides.failMedia }))
      : (constraints: MediaStreamConstraints) => {
          overrides.captureConstraints?.push(constraints);
          return Promise.resolve({ getTracks: () => tracks, getAudioTracks: () => tracks } as unknown as MediaStream);
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

  /**
   * An open socket is transport, not readiness. Now that the SERVER owns
   * segmentation, "listening" means the server has this session and has reset its
   * VAD state — not that a TCP connection exists. Inferring the first from the
   * second would feed the operator's first sentence to a segmenter still holding
   * the previous session's state.
   */
  it('does not claim Listening merely because the socket opened', async () => {
    const { source, statuses, fire } = harness({ readyState: 0 });
    await source.start();
    fire('open', {});
    expect(statuses[statuses.length - 1].status).toBe('starting');
  });

  it('claims Listening once the server acknowledges the session', async () => {
    const { source, statuses, fire } = harness({ readyState: 0 });
    await source.start();
    fire('open', {});
    fire('message', { data: JSON.stringify({ type: 'ready', session: 1 }) });
    expect(statuses[statuses.length - 1].status).toBe('listening');
  });

  it('claims Listening immediately when the socket is already open', async () => {
    const { source, statuses } = harness();
    await source.start();
    expect(statuses[statuses.length - 1].status).toBe('listening');
  });
});

describe('the continuous uplink', () => {
  /**
   * The browser no longer decides what counts as speech; it transports audio and
   * measures a meter. The uplink is therefore a STREAM, and what these tests pin
   * is the property a stream has to have: every sample the microphone produced
   * arrives once, in order, inside the session that produced it.
   *
   * An earlier framer in this file dropped whatever did not fill a 20 ms frame on
   * every callback — 64 of every 1024 samples, continuously — so "no samples are
   * lost" is a claim this codebase has been wrong about before.
   */
  const UPLINK_BYTES = 12;
  const CONTROL_AUDIO = 0;
  const CONTROL_START = 1;
  const CONTROL_STOP = 2;

  /** Control frames go out as ArrayBuffer, audio frames as a Uint8Array view. */
  const bytes = (frame: unknown): ArrayBuffer =>
    frame instanceof ArrayBuffer ? frame : ((frame as Uint8Array).buffer as ArrayBuffer);

  const readHeader = (frame: unknown) => {
    const view = new DataView(bytes(frame));
    return {
      session: view.getUint32(0, true),
      sequence: view.getUint32(4, true),
      control: view.getInt32(8, true),
      samples: (bytes(frame).byteLength - UPLINK_BYTES) / 2
    };
  };
  const samplesOf = (frame: unknown) => new Int16Array(bytes(frame).slice(UPLINK_BYTES));

  async function capture(blocks: Float32Array[]) {
    const { source, sockets, fire } = harness();
    await source.start();
    // The session is declared when the socket OPENS, so the fake has to open —
    // otherwise these tests would assert a stream that never started.
    fire('open', {});
    for (const b of blocks) pushAudio(b);
    return { sent: sockets[0].sent.map((f) => ({ ...readHeader(f), pcm: samplesOf(f) })), source };
  }

  it('declares the session before any audio', async () => {
    const { sent } = await capture([block(1024, 0.2, 1)]);
    expect(sent[0].control).toBe(CONTROL_START);
    expect(sent[0].samples).toBe(0);
    expect(sent.slice(1).every((f) => f.control === CONTROL_AUDIO)).toBe(true);
  });

  it('transports every sample exactly once, in order', async () => {
    // Distinct, recoverable values: sample i carries i, so any loss, duplication
    // or reordering is visible rather than merely plausible.
    const total = 1024 * 5 + 373; // deliberately not a multiple of anything
    const ramp = new Float32Array(total);
    for (let i = 0; i < total; i += 1) ramp[i] = ((i % 20000) + 1) / 32767;
    const blocks: Float32Array[] = [];
    for (let at = 0; at < total; at += 1024) blocks.push(ramp.subarray(at, Math.min(at + 1024, total)));

    const { sent } = await capture(blocks);
    const audio = sent.filter((f) => f.control === CONTROL_AUDIO);
    const flat: number[] = [];
    for (const frame of audio) for (const v of frame.pcm) flat.push(v);

    expect(flat).toHaveLength(total);
    for (let i = 0; i < total; i += 1) expect(flat[i], `sample ${i}`).toBe((i % 20000) + 1);
  });

  it('is invariant to the size of the browser’s callbacks', async () => {
    // 1024 is common but it is not a contract, and nothing downstream may depend
    // on it: the accumulator that meets Silero's fixed frame size is on the server.
    const total = 4096;
    const ramp = new Float32Array(total);
    for (let i = 0; i < total; i += 1) ramp[i] = (i + 1) / 32767;
    const flatten = async (chunk: number) => {
      const blocks: Float32Array[] = [];
      for (let at = 0; at < total; at += chunk) blocks.push(ramp.subarray(at, Math.min(at + chunk, total)));
      const { sent } = await capture(blocks);
      const out: number[] = [];
      for (const f of sent.filter((x) => x.control === CONTROL_AUDIO)) for (const v of f.pcm) out.push(v);
      return out;
    };
    const reference = await flatten(1024);
    for (const chunk of [128, 480, 1500, 4096]) {
      expect(await flatten(chunk), `chunk ${chunk}`).toEqual(reference);
    }
  });

  it('carries the session on every frame, so stopped audio cannot be segmented', async () => {
    const { sent } = await capture([block(1024, 0.2, 1), block(1024, 0.2, 2)]);
    expect(new Set(sent.map((f) => f.session)).size).toBe(1);
    expect(sent[0].session).toBeGreaterThan(0);
  });

  it('tells the server to reset when the operator stops', async () => {
    const { source, sockets, fire } = harness();
    await source.start();
    fire('open', {});
    pushAudio(block(1024, 0.2, 1));
    source.stop();
    const frames = sockets[0].sent.map(readHeader);
    // Stop is the last thing on the wire and carries no audio: the server drops
    // the partial utterance, the pre-roll and Silero's state on it.
    expect(frames[frames.length - 1].control).toBe(CONTROL_STOP);
    expect(frames[frames.length - 1].samples).toBe(0);
  });

  it('sends nothing at all once stopped', async () => {
    const { source, sockets, fire } = harness();
    await source.start();
    fire('open', {});
    pushAudio(block(1024, 0.25, 4));
    source.stop();
    const after = sockets[0].sent.length;
    pushAudio(block(1024, 0.25, 5));
    pushAudio(block(1024, 0.25, 6));
    expect(sockets[0].sent.length).toBe(after);
  });

  it('makes no judgement about whether the audio is speech', async () => {
    // The whole point of the migration. Near-silence is transported exactly like
    // speech; deciding is the server's job now, and a browser that filtered first
    // would be a ceiling the VAD could never see past.
    const quiet = await capture([block(1024, 0.00005, 7, false)]);
    const loud = await capture([block(1024, 0.3, 7)]);
    expect(quiet.sent.filter((f) => f.control === CONTROL_AUDIO)).toHaveLength(1);
    expect(loud.sent.filter((f) => f.control === CONTROL_AUDIO)).toHaveLength(1);
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

describe('capture profiles', () => {
  /**
   * The previous stage turned Chrome's voice processing off on a hypothesis, and
   * the operator then reported that listening felt somewhat worse. Both are real
   * observations and neither is a measurement, so the setting is now a named
   * profile a human can A/B rather than an opinion compiled into a call.
   */
  it('asks for exactly what the named profile declares', async () => {
    for (const [name, expected] of Object.entries(CAPTURE_PROFILES)) {
      const asked: MediaStreamConstraints[] = [];
      const { source } = harness({ captureConstraints: asked, captureProfile: name as CaptureProfileName });
      await source.start();
      expect(asked[0].audio, name).toMatchObject(expected);
    }
  });

  it('never asks for automatic gain, in any profile', () => {
    // AGC is the one that fights the silence shield: it raises the gain when
    // nobody is speaking, lifting room noise toward the level that reads as voice.
    for (const [name, profile] of Object.entries(CAPTURE_PROFILES)) {
      expect(profile.autoGainControl, name).toBe(false);
    }
  });

  it('reads a profile from the URL and refuses anything else', () => {
    expect(captureProfileFromLocation('?mic=cleanup')).toBe('cleanup');
    expect(captureProfileFromLocation('?mic=echo-only')).toBe('echo-only');
    expect(captureProfileFromLocation('?mic=whatever')).toBeNull();
    expect(captureProfileFromLocation('')).toBeNull();
  });

  it('reports what Chrome actually honoured, which may not be what was asked', async () => {
    const seen: MediaTrackSettings[] = [];
    const { source } = harness({ onCaptureSettings: (s) => seen.push(s) });
    await source.start();
    expect(seen).toHaveLength(1);
  });
});
