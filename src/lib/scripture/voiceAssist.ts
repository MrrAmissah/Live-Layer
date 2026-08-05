import type { ScriptureLookupResult } from '../../types/scripture';
import { parseSpokenReference, type SpokenCandidate, type SpokenProblem } from './spokenReference';

/**
 * The voice-assist review model: transcript → candidates → operator decision.
 *
 * Two properties this exists to guarantee, both of which matter more than the
 * feature itself:
 *
 * 1. **Nothing reaches the graphic without an explicit accept.** Every state below
 *    is inert. There is no state from which a passage stages, queues or airs on
 *    its own, and `accept` is the only transition that hands anything back to the
 *    caller. A transcript arriving does not change the draft; a candidate being
 *    found does not change the draft; retrieving a passage does not change the
 *    draft.
 * 2. **It is provider-neutral.** Nothing here knows where a transcript came from —
 *    a textarea, the Web Speech API, a hosted recogniser. The only thing crossing
 *    the boundary is a string, so choosing a speech provider later cannot reach
 *    into the Scripture parser or the Program path.
 *
 * There is deliberately no `listening` state and no audio concept: this stage has
 * no microphone. A real capture source adds that at the port, not here.
 */

export type VoiceAssistStatus =
  /** Nothing submitted yet. */
  | 'idle'
  /** A transcript has been received but not yet interpreted. */
  | 'transcript'
  /** Interpreted; one or more candidate references to choose from. */
  | 'candidates'
  /** A candidate is selected and its passage is being retrieved. */
  | 'resolving'
  /** The passage is retrieved and awaiting an explicit accept. */
  | 'review'
  /** The operator accepted it. The caller applies it; this state records the fact. */
  | 'accepted'
  /** The operator dismissed it. Nothing changed. */
  | 'rejected'
  /** Interpreted, but nothing survived validation. */
  | 'no-match'
  /** The passage provider could not be reached. */
  | 'provider-unavailable';

export interface VoiceAssistState {
  status: VoiceAssistStatus;
  /** Exactly what was transcribed. Never normalised behind the operator. */
  transcript: string;
  candidates: SpokenCandidate[];
  /** Index into `candidates`, or -1. */
  selected: number;
  /** The retrieved passage awaiting review. */
  passage: ScriptureLookupResult | null;
  /** Operator-facing detail. Empty when there is nothing to say. */
  message: string;
  /** Set when interpretation failed, for the UI to explain precisely. */
  problem: SpokenProblem | null;
}

export const IDLE: VoiceAssistState = {
  status: 'idle',
  transcript: '',
  candidates: [],
  selected: -1,
  passage: null,
  message: '',
  problem: null
};

/**
 * Interpret a transcript. Pure: same transcript, same state.
 *
 * Note what this does NOT do — retrieve anything, or touch the draft. It turns
 * words into choices and stops.
 */
export function receiveTranscript(transcript: string): VoiceAssistState {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return { ...IDLE, status: 'idle' };
  }

  const parsed = parseSpokenReference(trimmed);
  if (!parsed.ok) {
    return {
      ...IDLE,
      status: 'no-match',
      transcript: trimmed,
      message: parsed.message,
      problem: parsed.problem
    };
  }

  return {
    ...IDLE,
    status: 'candidates',
    transcript: trimmed,
    candidates: parsed.candidates,
    // Pre-selecting the top reading is a convenience for the eye, NOT a decision:
    // `review` still requires retrieval and `accepted` still requires a press.
    selected: 0,
    message:
      parsed.candidates.length > 1
        ? `${parsed.candidates.length} readings — choose one.`
        : `Heard ${parsed.candidates[0].reference.canonical}.`
  };
}

export function selectCandidate(state: VoiceAssistState, index: number): VoiceAssistState {
  if (index < 0 || index >= state.candidates.length) return state;
  // Changing the selection discards any passage retrieved for the previous one, so
  // the reference on screen and the text on screen can never disagree.
  return { ...state, selected: index, status: 'candidates', passage: null, message: '' };
}

export function beginResolving(state: VoiceAssistState): VoiceAssistState {
  if (state.selected < 0 || !state.candidates[state.selected]) return state;
  return {
    ...state,
    status: 'resolving',
    passage: null,
    message: `Looking up ${state.candidates[state.selected].reference.canonical}…`
  };
}

export function passageResolved(state: VoiceAssistState, passage: ScriptureLookupResult): VoiceAssistState {
  return {
    ...state,
    status: 'review',
    passage,
    message: `${passage.reference} — review, then accept to use it.`
  };
}

export function resolutionFailed(state: VoiceAssistState, message: string): VoiceAssistState {
  return { ...state, status: 'provider-unavailable', passage: null, message };
}

/**
 * The ONLY transition that yields something the caller may apply. Returns null
 * unless there is a reviewed passage, so an accept cannot be forced from an
 * earlier state.
 */
export function accept(state: VoiceAssistState): { state: VoiceAssistState; passage: ScriptureLookupResult } | null {
  if (state.status !== 'review' || !state.passage) return null;
  return {
    state: { ...state, status: 'accepted', message: `${state.passage.reference} accepted.` },
    passage: state.passage
  };
}

/** Dismiss. Leaves the transcript visible so the operator can re-read it. */
export function reject(state: VoiceAssistState): VoiceAssistState {
  return {
    ...state,
    status: 'rejected',
    passage: null,
    selected: -1,
    message: 'Dismissed — the current graphic is unchanged.'
  };
}

export function resetVoiceAssist(): VoiceAssistState {
  return { ...IDLE };
}

/** True only in the one state from which an accept is possible. */
export const canAccept = (state: VoiceAssistState): boolean => state.status === 'review' && state.passage !== null;
