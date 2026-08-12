/**
 * When has the speaker stopped? — the browser-side endpointing that decides what
 * audio reaches the recogniser.
 *
 * Stage 5's design buffered fixed 15- or 30-second windows, which put
 * latency-to-final at 15.6 s. Detecting the end of an utterance instead brought the
 * measured latency to 0.649 s. This module is the live half of that, and it is a
 * pure reducer so it can be tested exhaustively without a microphone — which
 * matters, because a browser automation pass cannot get microphone permission and
 * therefore cannot exercise this path at all.
 *
 * ## Two defects this file was rewritten to remove
 *
 * **1. It threw away 6.25% of the microphone, continuously.** `toFrames` emitted
 * only whole 20 ms frames and dropped the remainder, and the audio callback called
 * it independently per block. A `ScriptProcessor` delivering 1024 samples at 16 kHz
 * yields three 320-sample frames and **64 orphaned samples, discarded on every
 * callback**. Not once at the end — 6.25% of every second of speech, punched out in
 * a regular comb. The first phonemes of a book name are exactly what this
 * application cannot afford to lose. Framing is now a *stream* with a carried
 * remainder (`createFramer`).
 *
 * **2. Its noise floor could never rise, so a quiet room read as endless speech.**
 * The floor started at −90 dBFS and only adapted when `db < floor + threshold`.
 * With the default 12 dB threshold that condition is `db < −78`, so ordinary idle
 * noise at, say, −60 dBFS was **classified as speech and simultaneously unable to
 * raise the floor** — the detector sat in a permanent utterance until the
 * max-length valve fired. The old tests used digital-zero silence, which is the one
 * input that hides it.
 *
 * The floor is now calibrated over a bounded startup window and thereafter adapts
 * **only on non-speech frames** — fast downward, slow upward. Speech cannot drag it
 * up, and a real room floor is found within the calibration window.
 *
 * ## What it is not
 *
 * Not a neural VAD, and not the Python percentile algorithm in
 * `scripts/asr-benchmark/endpointing.py`. That one is offline and non-causal: it
 * takes the 10th percentile of the whole file and pads detected speech by 150 ms in
 * both directions. This one cannot see the future, so it calibrates instead and
 * keeps a pre-roll buffer to serve the same purpose as that padding. The two are
 * validated against the same conditions rather than assumed equivalent.
 *
 * **The model is not here and never will be.** This decides *when* to send audio to
 * the local recogniser process; it recognises nothing.
 */

export const FRAME_MS = 20;

export interface EndpointerConfig {
  sampleRate: number;
  /** Silence before the speaker is judged to have finished. The dominant latency term. */
  hangoverMs: number;
  /** Ignore blips shorter than this — a cough is not an utterance. */
  minSpeechMs: number;
  /** dB above the noise floor that counts as speech. */
  thresholdDb: number;
  /** Longest utterance before it is cut and sent anyway. */
  maxUtteranceMs: number;
  /**
   * How often to recognise the utterance-so-far while speech continues.
   *
   * **Re-derived when the recogniser changed, not carried over.** The old 400 ms
   * was justified against a CTC model whose cost grew with the audio — ~0.13 s for
   * a whole utterance — so the recogniser sat idle most of every interval. Whisper
   * pads every input to a 30-second window internally, which makes inference
   * effectively CONSTANT: measured across snapshots of one utterance it cost
   * 0.725 s at 0.8 s of audio and 0.792 s at 4.4 s. That is not a slower version
   * of the same shape; it is a different shape, and the reasoning that produced
   * 400 ms does not survive it.
   *
   * At 400 ms against ~0.78 s of work, roughly every second snapshot would be
   * thrown away by the service's latest-wins slot. Nothing breaks — that slot
   * exists precisely so nothing backlogs — but it is GPU spent on answers no one
   * will ever see, on a fanless machine.
   *
   * **600 ms, chosen by replaying real schedules against the real service** in
   * real time, three passes each, median of nine utterances:
   *
   * ```
   *   cadence   stale work   first transcript
   *     500 ms     16.7%         1237 ms
   *     600 ms      5.9%         1339 ms
   *     700 ms      0.0%         1435 ms
   *     800 ms      0.0%         1556 ms
   * ```
   *
   * 600 ms buys 217 ms off the number the operator actually feels for 5.9% waste;
   * 500 ms buys a further 102 ms for nearly three times that. The first snapshot
   * is what sets this figure, and it is gated by BOTH this cadence and
   * `minSnapshotMs` — a variant that lowered only the latter changed nothing,
   * measuring identically to the plain cadence, because the cadence was binding.
   */
  snapshotEveryMs: number;
  /** Don't snapshot until there is enough speech to be worth recognising. */
  minSnapshotMs: number;
  /**
   * Frames spent learning the room before any speech is reported. Bounded, and
   * short enough that pressing Start and speaking immediately still works — the
   * pre-roll below covers the overlap.
   */
  calibrationMs: number;
  /**
   * Audio kept before speech is detected, prepended to the utterance.
   *
   * Energy onset lags the actual start of a word, so cutting at the detection point
   * clips the first phoneme — and in this application the first phoneme is usually
   * the book name. Serves the same purpose as the Python harness's 150 ms pad,
   * causally.
   */
  preRollMs: number;
}

export const DEFAULT_ENDPOINTER: EndpointerConfig = {
  sampleRate: 16000,
  hangoverMs: 500,
  minSpeechMs: 250,
  thresholdDb: 12,
  /**
   * A hard ceiling so a room the detector has misjudged cannot buffer without
   * bound. A safety valve, not the endpoint mechanism: if it fires in normal use
   * the floor estimate is wrong.
   */
  maxUtteranceMs: 15000,
  calibrationMs: 400,
  preRollMs: 200,
  snapshotEveryMs: 600,
  minSnapshotMs: 600
};

// --- streaming framer ---------------------------------------------------------

export interface Framer {
  /** Samples left over from the previous push, waiting for the rest of their frame. */
  remainder: Float32Array;
  frameSize: number;
}

export const createFramer = (sampleRate = DEFAULT_ENDPOINTER.sampleRate): Framer => ({
  remainder: new Float32Array(0),
  frameSize: Math.round((sampleRate * FRAME_MS) / 1000)
});

/**
 * Push a block of samples; get whole frames out and keep the tail for next time.
 *
 * The invariant that matters: feeding a stream as one buffer and feeding it as
 * arbitrary chunks must produce **identical frames in identical order**. Anything
 * less means the frames depend on how the browser happened to size its callbacks,
 * which is not something the recogniser should be able to notice.
 */
export function pushSamples(framer: Framer, block: Float32Array): { framer: Framer; frames: Float32Array[] } {
  const { frameSize } = framer;
  const joined =
    framer.remainder.length === 0
      ? block
      : (() => {
          const merged = new Float32Array(framer.remainder.length + block.length);
          merged.set(framer.remainder, 0);
          merged.set(block, framer.remainder.length);
          return merged;
        })();

  const whole = Math.floor(joined.length / frameSize);
  const frames: Float32Array[] = [];
  for (let i = 0; i < whole; i += 1) {
    // Copied, not a view: `joined` may be the caller's buffer, and an
    // AudioBuffer's channel data is reused between callbacks.
    frames.push(joined.slice(i * frameSize, (i + 1) * frameSize));
  }
  return {
    framer: { ...framer, remainder: joined.slice(whole * frameSize) },
    frames
  };
}

/**
 * Frames of a complete, already-known buffer. Convenience for tests and offline
 * work — it still drops a ragged tail, which is correct at END OF STREAM and wrong
 * mid-stream, so live capture uses `pushSamples`.
 */
export function toFrames(samples: Float32Array, sampleRate = DEFAULT_ENDPOINTER.sampleRate): Float32Array[] {
  return pushSamples(createFramer(sampleRate), samples).frames;
}

// --- endpointer ---------------------------------------------------------------

export interface EndpointerState {
  /** Frames held for the utterance being spoken, oldest first. */
  buffered: Float32Array[];
  /** Recent frames kept in case speech starts, so its onset is not clipped. */
  preRoll: Float32Array[];
  /** Consecutive silent frames since speech was last seen. */
  silentFrames: number;
  /** Speech frames in the current utterance. */
  speechFrames: number;
  /** True once speech has started and not yet ended. */
  inSpeech: boolean;
  /** Noise-floor estimate, dBFS. */
  noiseFloorDb: number;
  /** Frames seen since the last reset. */
  framesSeen: number;
  /** True while the room is still being learned; no speech is reported. */
  calibrating: boolean;
  /** Speech frames counted when the last provisional snapshot was taken. */
  lastSnapshotFrames: number;
}

export const emptyEndpointer = (): EndpointerState => ({
  buffered: [],
  preRoll: [],
  silentFrames: 0,
  speechFrames: 0,
  inSpeech: false,
  /**
   * Starts at the TOP of the range, not the bottom. Calibration drives it down to
   * whatever the room actually is; starting at −90 meant a floor that could only be
   * wrong in the dangerous direction, because everything sat above it and nothing
   * could pull it up.
   */
  noiseFloorDb: 0,
  framesSeen: 0,
  calibrating: true,
  lastSnapshotFrames: 0
});

/** RMS of a frame in dBFS. dB because speech level varies by ~40 dB. */
export function frameDb(frame: Float32Array): number {
  let sum = 0;
  for (const sample of frame) sum += sample * sample;
  return 20 * Math.log10(Math.max(Math.sqrt(sum / Math.max(frame.length, 1)), 1e-10));
}

export interface EndpointerResult {
  state: EndpointerState;
  /**
   * A complete utterance, ready to recognise. Non-null ONLY when the speaker has
   * been judged to have stopped — this is the single place audio is released.
   */
  utterance: Float32Array | null;
  /** Whether speech is being heard right now, for the listening indicator. */
  speaking: boolean;
  /** True while the room is still being learned. */
  calibrating: boolean;
  /** Why the utterance was released. */
  reason: '' | 'endpoint' | 'max-length';
  /**
   * The utterance SO FAR, while the speaker is still talking.
   *
   * Non-null only when a snapshot is due (`snapshotEveryMs`). Recognising this
   * gives the operator a transcript and often a passage before they stop speaking,
   * instead of the whole pipeline starting at the endpoint. It is provisional by
   * construction — the same audio will be recognised again, authoritatively, when
   * the utterance actually ends.
   */
  snapshot: Float32Array | null;
}

const concat = (frames: Float32Array[]): Float32Array => {
  const total = frames.reduce((n, f) => n + f.length, 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const f of frames) {
    out.set(f, at);
    at += f.length;
  }
  return out;
};

/**
 * Feed one 20 ms frame.
 *
 * ## The floor
 *
 * For a bounded startup window the frame is treated as room, and the floor tracks
 * the quietest thing seen. After that it adapts **only when the frame is not
 * speech** — quickly downward (a quieter room is immediately believed) and slowly
 * upward (a noisier one is believed reluctantly). Adapting on speech frames is what
 * would let a long sentence drag the floor up until the speaker's own voice reads
 * as silence and the utterance ends mid-word.
 */
export function pushFrame(
  state: EndpointerState,
  frame: Float32Array,
  config: EndpointerConfig = DEFAULT_ENDPOINTER
): EndpointerResult {
  const db = frameDb(frame);
  const framesSeen = state.framesSeen + 1;
  const calibrationFrames = Math.max(1, Math.round(config.calibrationMs / FRAME_MS));
  const stillCalibrating = framesSeen <= calibrationFrames;

  let noiseFloorDb = state.noiseFloorDb;
  if (stillCalibrating) {
    // Learn the room: take the quietest frame seen so far.
    noiseFloorDb = Math.min(state.noiseFloorDb, db);
  }

  // No speech is reported while calibrating, so the first frames of a noisy room
  // cannot be mistaken for someone talking.
  const isSpeech = !stillCalibrating && db > noiseFloorDb + config.thresholdDb;

  if (!stillCalibrating && !isSpeech) {
    /**
     * A slow average of the frames we believe are room, in BOTH directions.
     *
     * This tracked fast downward (alpha 0.3) at first, on the reasoning that a
     * quieter room should be believed immediately. It made the detector fail after
     * a few utterances: random room noise has frame-to-frame variance, fast-down
     * tracking chases the quietest of those frames rather than the room's level,
     * and the floor sinks until the room itself sits more than `thresholdDb` above
     * it — at which point steady silence reads as one endless utterance. Caught by
     * a five-utterance recognition check where the last utterance never ended.
     *
     * Non-speech frames ARE the room, so averaging them converges on it. Symmetric
     * and slow: the floor cannot be dragged by outliers in either direction, and
     * because this runs only on non-speech frames, sustained speech cannot pull it
     * up until the speaker's own voice reads as silence.
     */
    noiseFloorDb = noiseFloorDb + (db - noiseFloorDb) * 0.05;
  }

  const hangoverFrames = Math.max(1, Math.round(config.hangoverMs / FRAME_MS));
  const minSpeechFrames = Math.max(1, Math.round(config.minSpeechMs / FRAME_MS));
  const maxFrames = Math.max(1, Math.round(config.maxUtteranceMs / FRAME_MS));
  const preRollFrames = Math.max(0, Math.round(config.preRollMs / FRAME_MS));

  const startingNow = isSpeech && !state.inSpeech;
  const inSpeech = state.inSpeech || isSpeech;

  const next: EndpointerState = {
    ...state,
    noiseFloorDb,
    framesSeen,
    calibrating: stillCalibrating,
    // Speech starts with the pre-roll already in front of it, so the onset survives.
    buffered: startingNow
      ? [...state.preRoll, frame]
      : inSpeech
        ? [...state.buffered, frame]
        : state.buffered,
    preRoll: inSpeech ? [] : [...state.preRoll, frame].slice(-preRollFrames),
    inSpeech,
    speechFrames: isSpeech ? state.speechFrames + 1 : state.speechFrames,
    silentFrames: isSpeech ? 0 : inSpeech ? state.silentFrames + 1 : 0
  };

  const reset = (): EndpointerState => ({
    ...emptyEndpointer(),
    noiseFloorDb,
    framesSeen,
    calibrating: false,
    lastSnapshotFrames: 0
  });

  const release = (reason: 'endpoint' | 'max-length'): EndpointerResult => {
    /**
     * Trim the hangover back off the clip, keeping a short tail pad.
     *
     * The hangover is how long we WAITED to be sure, not part of what was said, and
     * the offline algorithm this was measured against does the same — it cuts at
     * where silence began (`end = i - silence + 1`) and then pads. Shipping the
     * whole hangover would send half a second of room tone to the recogniser on
     * every utterance, making the clip longer than the one whose latency and
     * accuracy were measured.
     */
    const tailPad = Math.min(preRollFrames, next.silentFrames);
    const keep =
      reason === 'endpoint'
        ? next.buffered.slice(0, Math.max(1, next.buffered.length - next.silentFrames + tailPad))
        : next.buffered;
    return {
      state: reset(),
      utterance: concat(keep),
      snapshot: null,
      speaking: false,
      calibrating: false,
      reason
    };
  };

  if (next.inSpeech && next.buffered.length >= maxFrames) return release('max-length');
  if (next.inSpeech && next.silentFrames >= hangoverFrames) {
    // Too short to be an utterance: discard rather than send a cough to the model.
    if (next.speechFrames < minSpeechFrames) {
      return { state: reset(), utterance: null, snapshot: null, speaking: false, calibrating: false, reason: '' };
    }
    return release('endpoint');
  }

  /**
   * Due a provisional snapshot?
   *
   * Counted in frames of **speech**, not wall clock and not frames buffered. Wall
   * clock would drift with a stalled callback; frames buffered would count the
   * pre-roll and the trailing hangover silence as though they were things the
   * speaker said — so a 300 ms word would buy an inference on the strength of
   * 200 ms of room tone in front of it, and a pause would keep re-recognising
   * identical audio while the final was already on its way.
   */
  const snapshotEvery = Math.max(1, Math.round(config.snapshotEveryMs / FRAME_MS));
  const minSnapshot = Math.max(1, Math.round(config.minSnapshotMs / FRAME_MS));
  const dueSnapshot =
    next.inSpeech &&
    next.speechFrames >= minSnapshot &&
    next.speechFrames - next.lastSnapshotFrames >= snapshotEvery;

  return {
    // Still the whole buffer that gets recognised — pre-roll included, because the
    // book name lives in the onset. Only the *decision to send* counts speech.
    state: dueSnapshot ? { ...next, lastSnapshotFrames: next.speechFrames } : next,
    utterance: null,
    // Provisional: the same audio is recognised again when the utterance ends.
    snapshot: dueSnapshot ? concat(next.buffered) : null,
    speaking: isSpeech,
    calibrating: stillCalibrating,
    reason: ''
  };
}
