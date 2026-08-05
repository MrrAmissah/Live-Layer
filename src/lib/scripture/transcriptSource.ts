/**
 * The transcript boundary — the smallest thing a future speech source must satisfy.
 *
 * The whole point is that **only a string crosses it**. No audio, no confidence
 * vector, no provider handle, no vendor type. That is what keeps a later choice of
 * speech provider from reaching into the Scripture parser or the Program path: the
 * parser takes words, the port produces words, and nothing else is shared.
 *
 * Deliberately NOT here, and not in this PR:
 *
 *  - microphone permission, `getUserMedia`, `MediaRecorder`
 *  - the Web Speech API, or any hosted speech-to-text SDK
 *  - API keys, credentials or network calls
 *  - transcript persistence — nothing written to storage
 *  - automatic acceptance, staging, queueing or Take
 *
 * `isLive` is the only capability flag, because it is the only thing the UI must
 * know to be honest: a live source needs a visible listening state and an
 * immediate stop, and a manual one must not pretend to have either. The one
 * adapter shipped here is manual.
 *
 * What a real source would add at THIS boundary, without touching anything else:
 * `start()`/`stop()` returning a disposer, and `isLive: true` so the workspace
 * renders a listening indicator. The candidate model and the parser would not
 * change, which is the property being bought now rather than later.
 */

export interface TranscriptSource {
  /** Stable id for the UI and for tests. */
  id: string;
  /** Shown to the operator, so the origin of a transcript is never a mystery. */
  label: string;
  /**
   * True when this source captures audio. A live source MUST show a listening
   * state and offer an immediate stop; a manual one must claim neither.
   */
  isLive: boolean;
  /**
   * Subscribe to transcripts. Returns a disposer. A manual source calls back only
   * when the operator submits text.
   */
  subscribe(onTranscript: (transcript: string) => void): () => void;
  /** Push a transcript. Present on manual/test sources; absent on capture sources. */
  submit?(transcript: string): void;
}

/**
 * Operator-typed transcripts. This is not a placeholder for missing
 * functionality — it is how the transcript-to-candidate workflow is proven
 * correct before any provider decision, and it stays useful afterwards as the
 * fallback when recognition mishears and the operator types what was said.
 */
export function createManualTranscriptSource(): TranscriptSource {
  const listeners = new Set<(transcript: string) => void>();
  return {
    id: 'manual',
    label: 'Typed transcript',
    isLive: false,
    subscribe(onTranscript) {
      listeners.add(onTranscript);
      return () => {
        listeners.delete(onTranscript);
      };
    },
    submit(transcript) {
      for (const listener of listeners) listener(transcript);
    }
  };
}

/** Every source available now. A capture source would be registered here. */
export const transcriptSources: TranscriptSource[] = [createManualTranscriptSource()];
export const defaultTranscriptSource = transcriptSources[0];
