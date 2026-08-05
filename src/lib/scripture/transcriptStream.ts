import type { TranscriptEvent } from './transcriptSource';

/**
 * Which transcript events may be acted on — stated as a rule so it can be tested
 * with interleaved and out-of-order arrivals.
 *
 * A live recogniser revises. It emits interim guesses and then a settled result for
 * the same utterance, and those can arrive late, out of order, or after the
 * operator has stopped listening. Three things must therefore be impossible:
 *
 *  1. **An interim guess must never be interpreted as a reference.** It is a moving
 *     target; parsing it would offer a passage the speaker had not finished saying.
 *  2. **A stale revision must never replace a newer one.** A lower sequence in the
 *     same segment, or an older segment arriving after a newer one has settled, is
 *     out of date by definition.
 *  3. **Stopping must be immediate and final.** Once stopped, events already in
 *     flight are not the operator's intent and are dropped.
 *
 * Interim text is still *shown* — it is what makes a live source feel responsive —
 * but only `finalText` is ever handed to the parser.
 */

export interface TranscriptStreamState {
  /** The segment currently being revised, or null before anything arrives. */
  segmentId: string | null;
  /** Highest sequence seen for `segmentId`. */
  sequence: number;
  /** Latest text for the current segment, interim or final. Display only. */
  text: string;
  /** True once the current segment has settled. */
  isFinal: boolean;
  /** Segments already settled, so an older one cannot reopen. */
  settled: string[];
  /** True after `stop()`; every later event is ignored. */
  stopped: boolean;
}

export const EMPTY_STREAM: TranscriptStreamState = {
  segmentId: null,
  sequence: -1,
  text: '',
  isFinal: false,
  settled: [],
  stopped: false
};

/** Bounded so a long service cannot grow this without limit. */
const SETTLED_MEMORY = 32;

export interface TranscriptStreamUpdate {
  state: TranscriptStreamState;
  /**
   * Text to hand the parser, or null. Non-null ONLY for a fresh, in-order, final
   * event — which is the whole safety property of this module.
   */
  finalText: string | null;
  /** Why an event was ignored. Empty when it was applied. */
  ignored: '' | 'stopped' | 'stale-sequence' | 'settled-segment';
}

export function applyTranscriptEvent(
  state: TranscriptStreamState,
  event: TranscriptEvent
): TranscriptStreamUpdate {
  if (state.stopped) {
    return { state, finalText: null, ignored: 'stopped' };
  }

  // A segment that already settled cannot be revised or reopened.
  if (state.settled.includes(event.segmentId)) {
    return { state, finalText: null, ignored: 'settled-segment' };
  }

  const sameSegment = state.segmentId === event.segmentId;
  if (sameSegment && event.sequence <= state.sequence) {
    return { state, finalText: null, ignored: 'stale-sequence' };
  }

  const settled = event.isFinal ? [event.segmentId, ...state.settled].slice(0, SETTLED_MEMORY) : state.settled;

  const next: TranscriptStreamState = {
    segmentId: event.segmentId,
    sequence: event.sequence,
    text: event.text,
    isFinal: event.isFinal,
    settled,
    stopped: false
  };

  // The one place text is released for interpretation.
  return { state: next, finalText: event.isFinal ? event.text : null, ignored: '' };
}

/** Stop listening. Later events are ignored rather than raced. */
export function stopTranscriptStream(state: TranscriptStreamState): TranscriptStreamState {
  return { ...state, stopped: true, isFinal: false };
}

export function resetTranscriptStream(): TranscriptStreamState {
  return { ...EMPTY_STREAM };
}

/** Interim text for display. Never for the parser. */
export const interimText = (state: TranscriptStreamState): string =>
  state.isFinal || state.stopped ? '' : state.text;
