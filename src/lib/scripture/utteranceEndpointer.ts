/**
 * When has the speaker stopped? — the browser-side half of the endpointing that
 * §9 measured, kept as a pure reducer so it can be tested without a microphone.
 *
 * Stage 5's live-assist design buffered fixed 15- or 30-second windows, which put
 * latency-to-final at 15.6 seconds. Nothing about the model caused that: the
 * operator was waiting for a window to fill. Detecting the end of an utterance
 * instead took the measured latency to **0.649 s median**, of which 0.504 s is the
 * hangover below and 0.146 s is inference.
 *
 * Deliberately energy-based and deliberately small. A neural VAD is a provider
 * decision; this has to run in a Browser Source that is also compositing graphics
 * at frame rate, so it is arithmetic over 20 ms frames and nothing else.
 *
 * **The model is not here and never will be.** This decides *when* to send audio
 * to the local recogniser process; it does not recognise anything. A 0.6B-parameter
 * encoder does not belong in the page that renders to air.
 */

export const FRAME_MS = 20;

export interface EndpointerConfig {
  sampleRate: number;
  /** Silence before the speaker is judged to have finished. The dominant latency term. */
  hangoverMs: number;
  /** Ignore blips shorter than this — a cough is not an utterance. */
  minSpeechMs: number;
  /** dB above the running noise floor that counts as speech. */
  thresholdDb: number;
  /** Longest utterance before it is cut and sent anyway. */
  maxUtteranceMs: number;
}

export const DEFAULT_ENDPOINTER: EndpointerConfig = {
  sampleRate: 16000,
  hangoverMs: 500,
  minSpeechMs: 250,
  thresholdDb: 12,
  /**
   * A hard ceiling so a room with constant noise cannot buffer without bound. It is
   * a safety valve, not the architecture: if this fires regularly the noise floor
   * estimate is wrong and the operator should be typing.
   */
  maxUtteranceMs: 15000
};

export interface EndpointerState {
  /** Frames held for the utterance being spoken, oldest first. */
  buffered: Float32Array[];
  /** Consecutive silent frames since speech was last seen. */
  silentFrames: number;
  /** Speech frames in the current utterance. */
  speechFrames: number;
  /** True once speech has started and not yet ended. */
  inSpeech: boolean;
  /** Running noise-floor estimate, dBFS. */
  noiseFloorDb: number;
  /** Frames seen, for the initial floor estimate. */
  framesSeen: number;
}

export const emptyEndpointer = (): EndpointerState => ({
  buffered: [],
  silentFrames: 0,
  speechFrames: 0,
  inSpeech: false,
  // Starts pessimistically low so the first frames do not all read as speech; the
  // floor rises to meet the room within a second.
  noiseFloorDb: -90,
  framesSeen: 0
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
  /** Why the utterance was released, for diagnostics. */
  reason: '' | 'endpoint' | 'max-length';
}

/**
 * Feed one 20 ms frame.
 *
 * The noise floor tracks the room asymmetrically: it rises slowly toward quiet
 * frames and is never pulled up by loud ones. Symmetric tracking lets a long
 * sentence drag the floor up until the speaker's own voice reads as silence,
 * which ends the utterance mid-word.
 */
export function pushFrame(
  state: EndpointerState,
  frame: Float32Array,
  config: EndpointerConfig = DEFAULT_ENDPOINTER
): EndpointerResult {
  const db = frameDb(frame);
  const framesSeen = state.framesSeen + 1;

  // Adapt only downward-ish: quiet frames pull the floor toward themselves.
  const noiseFloorDb =
    db < state.noiseFloorDb + config.thresholdDb
      ? state.noiseFloorDb + (db - state.noiseFloorDb) * 0.05
      : state.noiseFloorDb;

  const isSpeech = db > noiseFloorDb + config.thresholdDb;
  const hangoverFrames = Math.max(1, Math.round(config.hangoverMs / FRAME_MS));
  const minSpeechFrames = Math.max(1, Math.round(config.minSpeechMs / FRAME_MS));
  const maxFrames = Math.max(1, Math.round(config.maxUtteranceMs / FRAME_MS));

  const next: EndpointerState = {
    ...state,
    noiseFloorDb,
    framesSeen,
    buffered: state.inSpeech || isSpeech ? [...state.buffered, frame] : state.buffered,
    inSpeech: state.inSpeech || isSpeech,
    speechFrames: isSpeech ? state.speechFrames + 1 : state.speechFrames,
    silentFrames: isSpeech ? 0 : state.inSpeech ? state.silentFrames + 1 : 0
  };

  const release = (reason: 'endpoint' | 'max-length'): EndpointerResult => {
    const total = next.buffered.reduce((n, f) => n + f.length, 0);
    const utterance = new Float32Array(total);
    let at = 0;
    for (const f of next.buffered) {
      utterance.set(f, at);
      at += f.length;
    }
    return {
      state: { ...emptyEndpointer(), noiseFloorDb, framesSeen },
      utterance,
      speaking: false,
      reason
    };
  };

  if (next.inSpeech && next.buffered.length >= maxFrames) return release('max-length');
  if (next.inSpeech && next.silentFrames >= hangoverFrames) {
    // Too short to be an utterance: discard rather than send a cough to the model.
    if (next.speechFrames < minSpeechFrames) {
      return { state: { ...emptyEndpointer(), noiseFloorDb, framesSeen }, utterance: null, speaking: false, reason: '' };
    }
    return release('endpoint');
  }

  return { state: next, utterance: null, speaking: isSpeech, reason: '' };
}

/** Split a stream into 20 ms frames at the configured rate. */
export function toFrames(samples: Float32Array, sampleRate = DEFAULT_ENDPOINTER.sampleRate): Float32Array[] {
  const size = Math.round((sampleRate * FRAME_MS) / 1000);
  const frames: Float32Array[] = [];
  for (let at = 0; at + size <= samples.length; at += size) frames.push(samples.subarray(at, at + size));
  return frames;
}
