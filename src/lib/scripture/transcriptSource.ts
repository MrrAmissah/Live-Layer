/**
 * The transcript boundary — the smallest thing a future speech source must satisfy.
 *
 * Only plain text and its identity cross it. No audio, no tensors, no model
 * object, no vendor handle, no credentials. That is what keeps a later choice of
 * ASR service from reaching into the Scripture parser or the Program path: the
 * parser takes words, the port produces words, and nothing else is shared.
 *
 * The first version carried a bare `string`, which is too narrow for live
 * recognition. A live recogniser revises: it emits interim guesses and then a final
 * result for the same utterance, so a consumer needs to know **whether a piece of
 * text is final**, **which utterance it belongs to**, and **whether it supersedes
 * what came before**. Without that, an interim guess can be parsed and staged as
 * though it were what the speaker said, and a slow revision of an old utterance can
 * overwrite a newer one.
 *
 * Sources are a discriminated union rather than one shape with optional methods,
 * because optional methods permit states that cannot exist: a manual source with a
 * `stop()`, or a live source with no way to stop. `isLive` is the discriminant, and
 * it is the only capability flag the UI genuinely needs — a live source must show a
 * listening state and offer an immediate stop; a manual one must claim neither.
 *
 * Deliberately NOT here, and not in this PR: microphone permission, `getUserMedia`,
 * `MediaRecorder`, the Web Speech API, any hosted ASR SDK, API keys, network calls,
 * transcript persistence, automatic acceptance, staging, queueing or Take.
 */

/** BCP-47-style tag. A plain string so no provider's enum leaks across. */
export type LanguageTag = string;

export interface TranscriptEvent {
  /** The text as the source currently believes it. */
  text: string;
  /**
   * False for a revisable guess, true for the source's settled result. Only a
   * final event may be interpreted as a reference — an interim one is a moving
   * target, and parsing it would stage a passage the speaker had not finished
   * saying.
   */
  isFinal: boolean;
  /**
   * Identity of the utterance being revised. Interim events and their final share
   * one id; a new utterance gets a new one.
   */
  segmentId: string;
  /**
   * Monotonic within a segment. A lower sequence arriving late is a stale revision
   * and must be discarded rather than applied.
   */
  sequence: number;
  /** The language the source was configured for when this was produced. */
  language: LanguageTag;
  /** Which source produced it, so a transcript's origin is never a mystery. */
  sourceId: string;
}

interface TranscriptSourceBase {
  /** Stable id, used in events and by the UI. */
  id: string;
  /** Shown to the operator. */
  label: string;
  /** Subscribe to events. Returns a disposer. */
  subscribe(onEvent: (event: TranscriptEvent) => void): () => void;
}

/**
 * Operator-typed transcripts. Not a placeholder for missing functionality — it is
 * how the transcript-to-candidate workflow is proven before any provider decision,
 * and it stays useful afterwards as the fallback when recognition mishears and the
 * operator types what was actually said.
 */
export interface ManualTranscriptSource extends TranscriptSourceBase {
  isLive: false;
  /** Push a final transcript. Manual text is never interim — it is typed, not guessed. */
  submit(text: string): void;
}

/**
 * A capture source. Shape declared now so adding one later does not reshape the
 * parser or the candidate model; **no implementation ships in this PR.**
 */
export interface LiveTranscriptSource extends TranscriptSourceBase {
  isLive: true;
  /** Begin capturing. Required — a live source that cannot start is not one. */
  start(): Promise<void>;
  /** Stop immediately. Required: an operator must always be able to stop listening. */
  stop(): void;
  /** Whether audio is being captured right now, for the visible listening state. */
  isListening(): boolean;
  /**
   * Language modes this source can transcribe, and the selected one. Explicit
   * because a multilingual recogniser generally cannot identify the language on
   * its own — the operator declares it, and a wrong declaration is a wrong
   * transcript rather than a silent degradation.
   */
  languages: LanguageTag[];
  language: LanguageTag;
  setLanguage(tag: LanguageTag): void;
}

export type TranscriptSource = ManualTranscriptSource | LiveTranscriptSource;

export const isLiveSource = (source: TranscriptSource): source is LiveTranscriptSource => source.isLive;

/** The language a manual source declares. Operator-typed text is already text. */
export const MANUAL_LANGUAGE: LanguageTag = 'und';

export function createManualTranscriptSource(id = 'manual'): ManualTranscriptSource {
  const listeners = new Set<(event: TranscriptEvent) => void>();
  let segment = 0;
  return {
    id,
    label: 'Typed transcript',
    isLive: false,
    subscribe(onEvent) {
      listeners.add(onEvent);
      return () => {
        listeners.delete(onEvent);
      };
    },
    submit(text) {
      // Each submission is its own settled utterance: a new segment, sequence 0,
      // final immediately. There is nothing to revise.
      segment += 1;
      const event: TranscriptEvent = {
        text,
        isFinal: true,
        segmentId: `${id}-${segment}`,
        sequence: 0,
        language: MANUAL_LANGUAGE,
        sourceId: id
      };
      for (const listener of listeners) listener(event);
    }
  };
}

/** Every source available now. A capture source would be registered here. */
export const transcriptSources: TranscriptSource[] = [createManualTranscriptSource()];
export const defaultTranscriptSource = transcriptSources[0];
