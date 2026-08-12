import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENDPOINTER,
  FRAME_MS,
  createFramer,
  emptyEndpointer,
  frameDb,
  pushFrame,
  pushSamples,
  type EndpointerConfig,
  looksLikeSpeech
} from './utteranceEndpointer';

const SR = DEFAULT_ENDPOINTER.sampleRate;
const FRAME = (SR * FRAME_MS) / 1000; // 320

/** Deterministic tone at a chosen dBFS, so "speech" and "room" are exact levels. */
function tone(samples: number, db: number, seed = 1): Float32Array {
  const amplitude = Math.pow(10, db / 20) * Math.SQRT2;
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) out[i] = Math.sin((i + seed) * 0.21) * amplitude;
  return out;
}

/** Deterministic pseudo-random room noise at a chosen dBFS. */
function noise(samples: number, db: number, seed = 7): Float32Array {
  const amplitude = Math.pow(10, db / 20) * Math.SQRT2;
  let state = seed;
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    state = (state * 16807) % 2147483647;
    out[i] = (state / 2147483647 - 0.5) * 2 * amplitude;
  }
  return out;
}

const join = (...parts: Float32Array[]): Float32Array => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** Feed a whole stream through the framer in blocks of `chunk` samples. */
function frameInChunks(stream: Float32Array, chunk: number): Float32Array[] {
  let framer = createFramer(SR);
  const frames: Float32Array[] = [];
  for (let at = 0; at < stream.length; at += chunk) {
    const pushed = pushSamples(framer, stream.subarray(at, Math.min(at + chunk, stream.length)));
    framer = pushed.framer;
    frames.push(...pushed.frames);
  }
  return frames;
}

describe('no microphone sample is lost between callbacks', () => {
  /**
   * The defect this exists for: framing each audio callback independently dropped
   * whatever did not fill a whole 20 ms frame. A ScriptProcessor delivering 1024
   * samples at 16 kHz gives 3 frames of 320 and orphans 64 — **6.25% of every
   * second of speech**, removed in a regular comb, for as long as the mic was on.
   */
  it('loses nothing at the 1024-sample block size the browser actually uses', () => {
    const stream = tone(SR * 2, -20); // 2 seconds
    const frames = frameInChunks(stream, 1024);
    // 2s = 100 whole frames. The old code produced ~93 and silently binned the rest.
    expect(frames).toHaveLength(Math.floor(stream.length / FRAME));
    expect(frames.length * FRAME).toBe(SR * 2);
  });

  it('produces identical frames however the stream is chunked', () => {
    const stream = tone(SR, -20);
    const contiguous = frameInChunks(stream, stream.length);
    for (const chunk of [1024, 320, 321, 1, 7, 4096, 999]) {
      const chunked = frameInChunks(stream, chunk);
      expect(chunked.length, `chunk ${chunk}`).toBe(contiguous.length);
      for (let i = 0; i < contiguous.length; i += 1) {
        expect(Array.from(chunked[i]), `chunk ${chunk} frame ${i}`).toEqual(Array.from(contiguous[i]));
      }
    }
  });

  it('reassembles to exactly the original samples, in order', () => {
    const stream = tone(SR, -20);
    const frames = frameInChunks(stream, 1024);
    const rebuilt = join(...frames);
    const expected = stream.subarray(0, frames.length * FRAME);
    expect(Array.from(rebuilt)).toEqual(Array.from(expected));
  });

  it('holds only the incomplete tail, and only at end of stream', () => {
    const framer = createFramer(SR);
    const a = pushSamples(framer, new Float32Array(1024));
    expect(a.frames).toHaveLength(3);
    expect(a.framer.remainder).toHaveLength(64); // carried, not discarded
    const b = pushSamples(a.framer, new Float32Array(1024));
    // 64 carried + 1024 = 1088 -> 3 frames (960), 128 carried.
    expect(b.frames).toHaveLength(3);
    expect(b.framer.remainder).toHaveLength(128);
  });

  it('copies frames, so a reused audio buffer cannot mutate them', () => {
    // AudioBuffer channel data is reused between callbacks; a view would alias it.
    const block = tone(FRAME, -20);
    const { frames } = pushSamples(createFramer(SR), block);
    const before = Array.from(frames[0]);
    block.fill(0);
    expect(Array.from(frames[0])).toEqual(before);
  });
});

/** Run a stream through the product endpointer at a given callback size. */
function endpoint(stream: Float32Array, chunk = 1024, config: EndpointerConfig = DEFAULT_ENDPOINTER) {
  let state = emptyEndpointer();
  let framer = createFramer(config.sampleRate);
  const utterances: Float32Array[] = [];
  let sawSpeaking = false;
  let calibratedAfter = -1;
  let frameIndex = 0;
  for (let at = 0; at < stream.length; at += chunk) {
    const pushed = pushSamples(framer, stream.subarray(at, Math.min(at + chunk, stream.length)));
    framer = pushed.framer;
    for (const frame of pushed.frames) {
      const result = pushFrame(state, frame, config);
      state = result.state;
      frameIndex += 1;
      if (!result.calibrating && calibratedAfter < 0) calibratedAfter = frameIndex;
      if (result.speaking) sawSpeaking = true;
      if (result.utterance) utterances.push(result.utterance);
    }
  }
  return { utterances, sawSpeaking, state, calibratedAfter };
}

describe('a quiet room is not mistaken for endless speech', () => {
  /**
   * The second defect. The floor started at −90 dBFS and only adapted when
   * `db < floor + threshold` — with a 12 dB threshold that is `db < −78`. Ordinary
   * idle noise at −60 dBFS was therefore classified as speech AND unable to raise
   * the floor, so the detector sat in one permanent utterance until the 15-second
   * max-length valve fired. The old tests used digital-zero silence, the single
   * input that hides it.
   */
  it.each([-70, -60, -50, -45, -35])('treats steady %d dBFS room noise as silence', (level) => {
    const { utterances, sawSpeaking } = endpoint(noise(SR * 4, level));
    expect(utterances).toHaveLength(0);
    expect(sawSpeaking).toBe(false);
  });

  it('still treats digital silence as silence', () => {
    const { utterances } = endpoint(new Float32Array(SR * 3));
    expect(utterances).toHaveLength(0);
  });

  it('never reaches the max-length valve on room noise alone', () => {
    // 20 s of room noise: more than the 15 s ceiling, so a broken floor shows up.
    const { utterances } = endpoint(noise(SR * 20, -55));
    expect(utterances).toHaveLength(0);
  });

  it('survives many utterances without the floor drifting into the room', () => {
    /**
     * The regression that a five-utterance recognition check caught. The floor
     * tracked fast downward, so it chased the QUIETEST frames of a noisy room
     * rather than the room's level; after a few utterances it had sunk far enough
     * that steady silence sat above `thresholdDb` and the detector never ended the
     * last utterance. Six in a row, and the sixth must still terminate.
     */
    const room = (ms: number) => noise((SR * ms) / 1000, -58, 3);
    const speech = (ms: number) => tone((SR * ms) / 1000, -20);
    const parts = [room(800)];
    for (let i = 0; i < 6; i += 1) parts.push(speech(700), room(800));
    const { utterances, state } = endpoint(join(...parts));
    expect(utterances).toHaveLength(6);
    // Nothing may be left mid-utterance at the end of the stream.
    expect(state.inSpeech).toBe(false);
    expect(state.buffered).toHaveLength(0);
  });

  it('finishes calibrating within the bounded window', () => {
    const { calibratedAfter } = endpoint(noise(SR * 2, -55));
    expect(calibratedAfter).toBeLessThanOrEqual(
      Math.round(DEFAULT_ENDPOINTER.calibrationMs / FRAME_MS) + 1
    );
  });
});

describe('speech above the room is still heard', () => {
  const room = (ms: number, db: number) => noise((SR * ms) / 1000, db);
  const speech = (ms: number, db: number) => tone((SR * ms) / 1000, db);

  it.each([
    [-60, -25],
    [-50, -20],
    [-45, -15],
    [-70, -30]
  ])('detects speech at %d dBFS room / %d dBFS voice', (roomDb, voiceDb) => {
    const stream = join(room(1000, roomDb), speech(900, voiceDb), room(900, roomDb));
    const { utterances } = endpoint(stream);
    expect(utterances).toHaveLength(1);
  });

  it('hears a quiet speaker that is still clearly above the floor', () => {
    // 18 dB over a −60 room: quiet, but not ambiguous.
    const stream = join(room(1000, -60), speech(900, -42), room(900, -60));
    expect(endpoint(stream).utterances).toHaveLength(1);
  });

  it('keeps one utterance across a breath', () => {
    const stream = join(
      room(1000, -55),
      speech(600, -20),
      room(200, -55), // shorter than the hangover
      speech(600, -20),
      room(900, -55)
    );
    expect(endpoint(stream).utterances).toHaveLength(1);
  });

  it('separates two utterances across a real pause', () => {
    const stream = join(
      room(1000, -55),
      speech(600, -20),
      room(900, -55), // longer than the hangover
      speech(600, -20),
      room(900, -55)
    );
    expect(endpoint(stream).utterances).toHaveLength(2);
  });

  it('discards a cough', () => {
    const stream = join(room(1000, -55), speech(80, -20), room(900, -55));
    expect(endpoint(stream).utterances).toHaveLength(0);
  });

  it('cuts an utterance that never ends rather than buffering without bound', () => {
    const stream = join(room(600, -60), tone(SR * 20, -20));
    const { utterances } = endpoint(stream);
    expect(utterances.length).toBeGreaterThanOrEqual(1);
    const longest = Math.max(...utterances.map((u) => u.length));
    expect(longest).toBeLessThanOrEqual((SR * DEFAULT_ENDPOINTER.maxUtteranceMs) / 1000 + FRAME);
  });
});

describe('the first phoneme survives', () => {
  /**
   * Energy onset lags the start of a word, so cutting at the detection point clips
   * it — and here the first phoneme is usually the book name, which is exactly the
   * token the whole spoken-reference layer depends on.
   */
  it('prepends pre-roll, so the utterance starts before detection did', () => {
    const stream = join(noise(SR, -60), tone((SR * 900) / 1000, -20), noise((SR * 900) / 1000, -60));
    const [utterance] = endpoint(stream).utterances;
    // Without pre-roll the utterance would be at most the speech itself.
    const speechSamples = (SR * 900) / 1000;
    expect(utterance.length).toBeGreaterThan(speechSamples);
    const preRollSamples = (SR * DEFAULT_ENDPOINTER.preRollMs) / 1000;
    expect(utterance.length).toBeGreaterThanOrEqual(speechSamples + preRollSamples * 0.5);
  });

  it('does not let pre-roll grow without bound while the room is quiet', () => {
    // Ten seconds of room then one word: the utterance must carry pre-roll, not ten
    // seconds of silence.
    const stream = join(noise(SR * 10, -60), tone((SR * 600) / 1000, -20), noise(SR, -60));
    const [utterance] = endpoint(stream).utterances;
    // Padding is symmetric — a lead pad before onset and a tail pad after the
    // speech ends, mirroring the offline algorithm's 150 ms on both sides. The
    // point of this test is that ten seconds of preceding room does NOT ride along.
    const pad = (SR * DEFAULT_ENDPOINTER.preRollMs) / 1000;
    expect(utterance.length).toBeLessThanOrEqual((SR * 600) / 1000 + pad * 2 + FRAME);
  });
});

describe('endpointing does not depend on how the browser sizes its callbacks', () => {
  const stream = join(
    noise(SR, -58),
    tone((SR * 800) / 1000, -20),
    noise(SR, -58),
    tone((SR * 800) / 1000, -20),
    noise(SR, -58)
  );

  it('finds the same utterances at every callback size', () => {
    const reference = endpoint(stream, stream.length).utterances;
    expect(reference).toHaveLength(2);
    for (const chunk of [1024, 512, 320, 333, 2048, 4096]) {
      const got = endpoint(stream, chunk).utterances;
      expect(got.length, `chunk ${chunk}`).toBe(reference.length);
      for (let i = 0; i < reference.length; i += 1) {
        expect(got[i].length, `chunk ${chunk} utterance ${i}`).toBe(reference[i].length);
        expect(Array.from(got[i]), `chunk ${chunk} utterance ${i}`).toEqual(Array.from(reference[i]));
      }
    }
  });
});

describe('the hangover stays where the latency measurement assumed', () => {
  it('ends an utterance about one hangover after the speaker stops', () => {
    const speechMs = 800;
    const stream = join(noise(SR, -58), tone((SR * speechMs) / 1000, -20), noise(SR * 2, -58));
    const [utterance] = endpoint(stream).utterances;
    /**
     * The released clip is speech plus a symmetric pad. The HANGOVER is silence the
     * detector waited through to be sure, and it is deliberately trimmed back off —
     * shipping it would send half a second of room tone to the recogniser on every
     * utterance and make the clip longer than the one whose latency was measured.
     */
    const pad = (SR * DEFAULT_ENDPOINTER.preRollMs) / 1000;
    const hangover = (SR * DEFAULT_ENDPOINTER.hangoverMs) / 1000;
    const speechSamples = (SR * speechMs) / 1000;
    expect(utterance.length).toBeGreaterThanOrEqual(speechSamples);
    expect(utterance.length).toBeLessThanOrEqual(speechSamples + pad * 2 + FRAME * 2);
    // And decisively shorter than it would be if the hangover rode along.
    expect(utterance.length).toBeLessThan(speechSamples + hangover);
  });

  it('measures level in dB, so quiet and loud both register', () => {
    expect(frameDb(new Float32Array(FRAME))).toBeLessThan(-100);
    expect(frameDb(tone(FRAME, -20))).toBeGreaterThan(frameDb(tone(FRAME, -40)));
  });
});

describe('provisional snapshots while the speaker is still talking', () => {
  /**
   * The first human test found the whole experience batch: speak, wait, "Recognising",
   * then a result. The model is utterance-batch CTC and that has not changed — but at
   * ~0.2 s per inference it is fast enough to re-recognise the utterance SO FAR
   * every few hundred milliseconds, so the operator sees work happening while they
   * speak instead of afterwards.
   */
  const room = (ms: number) => noise((SR * ms) / 1000, -58, 3);
  const speech = (ms: number) => tone((SR * ms) / 1000, -20);

  function snapshots(stream: Float32Array, config = DEFAULT_ENDPOINTER) {
    let state = emptyEndpointer();
    let framer = createFramer(config.sampleRate);
    const out: { snapshots: number[]; final: number | null } = { snapshots: [], final: null };
    for (let at = 0; at < stream.length; at += 1024) {
      const pushed = pushSamples(framer, stream.subarray(at, Math.min(at + 1024, stream.length)));
      framer = pushed.framer;
      for (const frame of pushed.frames) {
        const result = pushFrame(state, frame, config);
        state = result.state;
        if (result.snapshot) out.snapshots.push(result.snapshot.length);
        if (result.utterance) out.final = result.utterance.length;
      }
    }
    return out;
  }

  it('emits growing snapshots during a long utterance, then one final', () => {
    const { snapshots: seen, final } = snapshots(join(room(800), speech(3000), room(900)));
    // Derived from the cadence rather than hard-coded, so re-deriving the cadence
    // for a different recogniser does not silently invalidate this expectation —
    // which is exactly what it did when Whisper moved it from 400 ms to 800 ms.
    const expected = Math.floor(3000 / DEFAULT_ENDPOINTER.snapshotEveryMs);
    expect(seen.length).toBeGreaterThanOrEqual(expected);
    // Each snapshot contains everything the previous one did, and more.
    for (let i = 1; i < seen.length; i += 1) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    expect(final).not.toBeNull();
    // The final is the authoritative pass over the whole utterance.
    expect(final!).toBeGreaterThanOrEqual(seen[seen.length - 1]);
  });

  it('holds the cadence rather than firing per frame', () => {
    // Every 20 ms would backlog the recogniser and flicker the card; the cadence is
    // measured in buffered audio so a stalled callback cannot make it drift.
    const { snapshots: seen } = snapshots(join(room(800), speech(2000), room(900)));
    const expected = Math.floor(2000 / DEFAULT_ENDPOINTER.snapshotEveryMs);
    expect(seen.length).toBeLessThanOrEqual(expected + 1);
  });

  it('says nothing until there is enough speech to be worth recognising', () => {
    const { snapshots: seen } = snapshots(join(room(800), speech(300), room(900)));
    expect(seen).toHaveLength(0);
  });

  it('emits no snapshot at all when nobody is speaking', () => {
    expect(snapshots(noise(SR * 4, -55)).snapshots).toHaveLength(0);
  });

  it('is chunk-invariant, like the rest of the audio path', () => {
    const stream = join(room(800), speech(2200), room(900));
    const reference = snapshots(stream).snapshots;
    for (const chunk of [320, 512, 2048]) {
      let state = emptyEndpointer();
      let framer = createFramer(SR);
      const seen: number[] = [];
      for (let at = 0; at < stream.length; at += chunk) {
        const pushed = pushSamples(framer, stream.subarray(at, Math.min(at + chunk, stream.length)));
        framer = pushed.framer;
        for (const frame of pushed.frames) {
          const result = pushFrame(state, frame, DEFAULT_ENDPOINTER);
          state = result.state;
          if (result.snapshot) seen.push(result.snapshot.length);
        }
      }
      expect(seen, `chunk ${chunk}`).toEqual(reference);
    }
  });
});

describe('silence must never become Scripture input', () => {
  /**
   * The production blocker, in the operator's words: during actual silence,
   * Whisper sometimes says "thank you".
   *
   * It is worse than it sounds. Measured against the running service, three
   * seconds of DIGITAL SILENCE decoded confidently as "Thank you." — and
   * `no_speech_prob` came back **0.000 for that and for every other input**,
   * including real speech, while silence scored a BETTER `avg_logprob` (−0.213)
   * than a real short correction ("Verse 3.", −0.393). There is no threshold on
   * the model's own output that separates the two classes here.
   *
   * So the microphone is the authority, and these tests hold that line. Each
   * number below was measured from the audio class it names.
   */
  const SR2 = 16000;
  const flat = (ms: number, db: number, seedIn = 5): Float32Array => {
    const out = new Float32Array((SR2 * ms) / 1000);
    const amp = Math.pow(10, db / 20);
    let seed = seedIn;
    for (let i = 0; i < out.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      out[i] = ((seed / 0x7fffffff) * 2 - 1) * amp;
    }
    return out;
  };
  /** Loud parts, quiet parts — the thing a room cannot do. */
  const voice = (ms: number, db: number, seedIn = 9): Float32Array => {
    const out = flat(ms, db, seedIn);
    for (let i = 0; i < out.length; i += 1) {
      out[i] *= Math.pow(Math.abs(Math.sin((i / SR2) * Math.PI * 6)), 3) + 0.0002;
    }
    return out;
  };

  function through(stream: Float32Array) {
    let state = emptyEndpointer();
    let framer = createFramer(SR2);
    const sent: { audio: Float32Array; audible: boolean }[] = [];
    for (let at = 0; at < stream.length; at += 1024) {
      const pushed = pushSamples(framer, stream.subarray(at, Math.min(at + 1024, stream.length)));
      framer = pushed.framer;
      for (const frame of pushed.frames) {
        const r = pushFrame(state, frame, DEFAULT_ENDPOINTER);
        state = r.state;
        const audio = r.utterance ?? r.snapshot;
        if (audio && r.evidence) sent.push({ audio, audible: looksLikeSpeech(r.evidence) });
      }
    }
    return sent;
  }

  const audible = (stream: Float32Array) => through(stream).filter((s) => s.audible).length;

  it('sends nothing at all for digital silence', () => {
    expect(audible(new Float32Array(SR2 * 4))).toBe(0);
  });

  it('sends nothing for steady room noise, at any level', () => {
    // −70 through −40 dBFS: a quiet study through a room with air conditioning.
    for (const db of [-70, -60, -55, -50, -45, -40]) {
      const stream = join(flat(1000, -60), flat(3000, db), flat(1000, -60));
      expect(audible(stream), `${db} dBFS room`).toBe(0);
    }
  });

  it('sends nothing for a breath or a chair moving', () => {
    // Short, quiet, and flat — loud enough to trip a bare energy detector, which
    // is exactly how "thank you" reached the operator.
    expect(audible(join(flat(1000, -60), flat(600, -42), flat(1200, -60)))).toBe(0);
  });

  it('sends nothing for a cough', () => {
    expect(audible(join(flat(1000, -60), flat(120, -28), flat(1200, -60)))).toBe(0);
  });

  it('still sends real speech, including a short correction', () => {
    // "verse three" is under a second — the shield must not price it out.
    expect(audible(join(flat(1000, -60), voice(900, -14), flat(1000, -60)))).toBeGreaterThan(0);
    expect(audible(join(flat(1000, -60), voice(3000, -14), flat(1000, -60)))).toBeGreaterThan(0);
  });

  it('still sends speech in a room that is not quiet', () => {
    // The failure direction that matters: a shield tuned against clean silence
    // would refuse a real reference in a real building.
    expect(audible(join(flat(1000, -45), voice(1500, -14, 21), flat(1000, -45)))).toBeGreaterThan(0);
  });

  it('repeated silence never accumulates into one audible segment', () => {
    // Thirty seconds of listening to nothing, which is the human soak test.
    let total = 0;
    for (let i = 0; i < 10; i += 1) total += audible(join(flat(1000, -58, i), flat(2000, -52, i + 40)));
    expect(total).toBe(0);
  });
});
