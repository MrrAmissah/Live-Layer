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
 *  2. **A stale revision must never replace a newer one.** That means two things,
 *     and an earlier version of this module only enforced the first: a lower
 *     sequence *within* a segment, AND any event for an *older segment* once a newer
 *     one has been seen. Because `sequence` is only monotonic within a segment
 *     (`TranscriptEvent.sequence`), comparing sequences across segments is
 *     meaningless — so segments are ordered by when they first arrived, and an
 *     event for an older one is refused whether or not it had settled. Without that,
 *     "s1 interim, s2 interim, s1 final" released s1's text and the operator was
 *     offered the passage from the utterance *before* the one being spoken.
 *  3. **Stopping must be immediate and final.** Once stopped, events already in
 *     flight are not the operator's intent and are dropped.
 *
 * Interim text is still *shown* — it is what makes a live source feel responsive —
 * but only `finalText` is ever handed to the parser.
 *
 * The one bound worth stating plainly: segment memory is capped (`SEGMENT_MEMORY`).
 * A straggler for a segment evicted from that window is indistinguishable from a
 * genuinely new utterance, because segment ids are opaque, so it is treated as new.
 * That needs the cap's worth of newer utterances to arrive first, but it is a real
 * limit rather than a guarantee.
 */

interface SegmentRecord {
  id: string;
  /** Arrival rank. Higher means more recent; this is the cross-segment ordering. */
  order: number;
  /** Highest sequence seen for this segment. */
  sequence: number;
  settled: boolean;
}

export interface TranscriptStreamState {
  /** The segment currently being revised, or null before anything arrives. */
  segmentId: string | null;
  /** Highest sequence seen for `segmentId`. */
  sequence: number;
  /** Latest text for the current segment, interim or final. Display only. */
  text: string;
  /** True once the current segment has settled. */
  isFinal: boolean;
  /** Recently seen segments, newest first, so an older one cannot supersede. */
  history: SegmentRecord[];
  /** Highest arrival rank issued so far. */
  order: number;
  /** True after `stop()`; every later event is ignored. */
  stopped: boolean;
}

export const EMPTY_STREAM: TranscriptStreamState = {
  segmentId: null,
  sequence: -1,
  text: '',
  isFinal: false,
  history: [],
  order: 0,
  stopped: false
};

/** Bounded so a long service cannot grow this without limit. */
const SEGMENT_MEMORY = 64;

export interface TranscriptStreamUpdate {
  state: TranscriptStreamState;
  /**
   * Text to hand the parser, or null. Non-null ONLY for a fresh, in-order, final
   * event — which is the whole safety property of this module.
   */
  finalText: string | null;
  /** Why an event was ignored. Empty when it was applied. */
  ignored: '' | 'stopped' | 'stale-sequence' | 'settled-segment' | 'stale-segment';
}

export function applyTranscriptEvent(
  state: TranscriptStreamState,
  event: TranscriptEvent
): TranscriptStreamUpdate {
  if (state.stopped) {
    return { state, finalText: null, ignored: 'stopped' };
  }

  const known = state.history.find((entry) => entry.id === event.segmentId);

  if (known) {
    // A segment that already settled cannot be revised or reopened.
    if (known.settled) {
      return { state, finalText: null, ignored: 'settled-segment' };
    }
    if (event.sequence <= known.sequence) {
      return { state, finalText: null, ignored: 'stale-sequence' };
    }
    /**
     * Still open, but a newer utterance has started since. Its sequence says
     * nothing about this one's, so recency is decided by arrival order — otherwise
     * a slow final for the previous sentence lands on top of the current one.
     */
    if (known.order < state.order) {
      return { state, finalText: null, ignored: 'stale-segment' };
    }
  }

  const order = known ? known.order : state.order + 1;
  const record: SegmentRecord = {
    id: event.segmentId,
    order,
    sequence: event.sequence,
    settled: event.isFinal
  };

  const history = [record, ...state.history.filter((entry) => entry.id !== event.segmentId)].slice(
    0,
    SEGMENT_MEMORY
  );

  const next: TranscriptStreamState = {
    segmentId: event.segmentId,
    sequence: event.sequence,
    text: event.text,
    isFinal: event.isFinal,
    history,
    order: Math.max(order, state.order),
    stopped: false
  };

  // The one place text is released for interpretation.
  return { state: next, finalText: event.isFinal ? event.text : null, ignored: '' };
}

/** Stop listening. Later events are ignored rather than raced. */
export function stopTranscriptStream(state: TranscriptStreamState): TranscriptStreamState {
  return { ...state, stopped: true };
}

export function resetTranscriptStream(): TranscriptStreamState {
  return { ...EMPTY_STREAM };
}

/** Interim text for display. Never for the parser. */
export const interimText = (state: TranscriptStreamState): string =>
  state.isFinal || state.stopped ? '' : state.text;
