import { useEffect, useRef, useState } from 'react';
import { useScriptureLookup } from '../../hooks/useScriptureLookup';
import { defaultTranscriptSource, isLiveSource, type TranscriptSource } from '../../lib/scripture/transcriptSource';
import { createLiveTranscriptSource, type LiveSourceStatus } from '../../lib/scripture/liveTranscriptSource';
import {
  EMPTY_STREAM,
  applyTranscriptEvent,
  interimText,
  type TranscriptStreamState
} from '../../lib/scripture/transcriptStream';
import { Icon } from '../../lib/icons';
import InputLevelMeter from './InputLevelMeter';
import DetectedScripture from './DetectedScripture';
import { liveLatency } from '../../lib/scripture/liveLatency';
import {
  decideDisplay,
  forgetAgreement,
  NO_AGREEMENT,
  type StabilityState
} from '../../lib/scripture/provisionalStability';
import { readCorrection } from '../../lib/scripture/referenceCorrection';
import {
  EMPTY_STACK,
  promote,
  recallPrevious,
  clearStack,
  newestReference,
  type PassageStack
} from '../../lib/scripture/passageStack';
import type { CanonicalReference } from '../../lib/scripture/parseReference';
import type { SpokenCandidate } from '../../lib/scripture/spokenReference';
import {
  IDLE,
  accept as acceptCandidate,
  beginResolving,
  canAccept,
  passageResolved,
  receiveTranscript,
  reject as rejectCandidate,
  resolutionFailed,
  selectCandidate,
  type VoiceAssistState
} from '../../lib/scripture/voiceAssist';
import type { ScriptureLookupResult } from '../../types/scripture';

interface Props {
  /** Hand an accepted passage to the workspace. The ONLY way anything leaves here. */
  onAccept: (passage: ScriptureLookupResult, translationId: string) => void;
  translationId: string;
  /**
   * Whether the microphone is open, so the workspace can order itself around it.
   * Reported rather than controlled: listening is started and stopped here, and
   * the workspace only needs to know which panel the operator is using.
   */
  onListeningChange?: (listening: boolean) => void;
}

/**
 * Voice assist — transcript in, candidate references out, operator decides.
 *
 * Labelled as a preview because the transcript is **typed, not heard**: this stage
 * has no microphone and no speech provider. That is not a stub standing in for
 * missing work — it is how the transcript-to-candidate workflow gets proven before
 * a provider is chosen, and the typed path stays useful afterwards as the fallback
 * for when recognition mishears.
 *
 * Nothing here can reach air. The panel has no Take, no queue and no rundown
 * action; the single way a passage leaves is `onAccept`, which the workspace routes
 * into the ordinary Scripture draft — the same path the typed lookup uses. Program
 * is never touched.
 */
export default function VoiceAssistPreview({ onAccept, translationId, onListeningChange }: Props) {
  const [state, setState] = useState<VoiceAssistState>(IDLE);
  const [draftTranscript, setDraftTranscript] = useState('');
  const { lookup, cancel } = useScriptureLookup();
  /**
   * Listening is OFF until the operator turns it on, every time. There is no
   * remembered preference and no auto-start: a microphone that switches itself on
   * because it did last week is not something an operator can reason about
   * mid-service.
   */
  const [listen, setListen] = useState(false);
  /** True while the card is showing a guess from speech still in progress. */
  const [provisional, setProvisional] = useState(false);
  /**
   * A reference has been heard once and is waiting to be heard again.
   *
   * Shown as a plain sentence, never as a count. The operator does not need to
   * know that this is two passes of a recogniser agreeing — they need to know
   * that something is happening and the card has not stalled.
   */
  const [detecting, setDetecting] = useState(false);
  /**
   * The last passage that PARSED, VALIDATED and RETRIEVED — the durable half.
   *
   * Deliberately outside the reducer. `receiveTranscript` builds a fresh state for
   * every utterance, which is correct for a recognition ATTEMPT and was quietly
   * catastrophic for the passage: a preacher who said "no, verse three" lost a
   * verse that was right, because a fragment the parser refused replaced a result
   * it had already confirmed.
   *
   * Keeping it out here means no reducer path can clear it, because no reducer
   * path can reach it. That is the invariant enforced by shape rather than by
   * every future transition remembering to copy a field. It is cleared in exactly
   * two places: a successful replacement, and the operator pressing Dismiss.
   */
  const [stack, setStack] = useState<PassageStack>(EMPTY_STACK);
  /** The same value, readable inside the transcript handler without re-subscribing. */
  const stackRef = useRef<PassageStack>(EMPTY_STACK);
  const remember = (
    reference: CanonicalReference,
    passage: ScriptureLookupResult,
    heard: string,
    alternatives: SpokenCandidate[] = []
  ) => {
    stackRef.current = promote(stackRef.current, { reference, passage, heard }, alternatives);
    setStack(stackRef.current);
  };
  const forgetConfirmed = () => {
    stackRef.current = clearStack();
    setStack(stackRef.current);
  };
  const confirmed = stack.current;
  const confirmedRef = stackRef as unknown as { current: { reference: CanonicalReference } | null };
  /** Set while a correction is being retrieved, and while one has just failed. */
  const [correction, setCorrection] = useState<'' | 'working' | 'failed'>('');
  /**
   * The words that caused the passage to change.
   *
   * The human gate found this missing: the card correctly became John 3:17 and the
   * operator never saw the speech that did it. A dominant Scripture replacement
   * that appears without visible cause reads as the system changing its mind on
   * its own, which is the opposite of the reviewability this whole feature rests
   * on. Kept separate from the passage itself — one is what LiveLayer HEARD, the
   * other is what it CONCLUDED, and conflating them is how the transcript
   * disappeared behind a resolved candidate in the first place.
   */
  const [causedBy, setCausedBy] = useState('');
  const [mic, setMic] = useState<LiveSourceStatus>({ status: 'idle', detail: '', speaking: false, level: 0 });
  /**
   * Created once. Re-creating the source on a status change would tear down the
   * microphone it is reporting about — the same unstable-callback shape that once
   * cancelled every scripture lookup in flight.
   */
  /** Timeline id for the utterance currently being turned into a passage. */
  const timelineRef = useRef<number | null>(null);
  /**
   * How many consecutive revisions have named the reference now being considered.
   * A ref, not state: it is read and written inside the transcript handler, and a
   * re-render between two revisions must not lose or replay a vote.
   */
  const agreementRef = useRef<StabilityState>(NO_AGREEMENT);
  const liveRef = useRef<ReturnType<typeof createLiveTranscriptSource> | null>(null);
  if (!liveRef.current) {
    liveRef.current = createLiveTranscriptSource({
      onUtteranceTiming: (id) => {
        timelineRef.current = id;
      },
      onStatus: (status) => {
        setMic(status);
        /**
         * A live source that has STOPPED must not leave the UI in listening mode.
         * It used to: `listen` stayed true after a permission refusal, so the panel
         * showed "Type the reference instead" while the button still read "Stop
         * listening" and the operator had no working input at all.
         */
        if (status.status === 'denied' || status.status === 'unavailable' || status.status === 'stopped') {
          setListen(false);
        }
      }
    });
  }
  const live = liveRef.current;
  /**
   * The two sources are ADDITIVE, not alternatives.
   *
   * This used to be `listen ? live : manual`, with `submit` refusing when the source
   * was live — so turning the microphone on silently disabled typing, and the panel
   * could tell an operator to "type the reference instead" while Interpret did
   * nothing. Typing is the fallback the whole design rests on; it cannot be the
   * thing that switches off when the fallback is needed.
   *
   * The manual source stays subscribed for the life of the panel. The live one is
   * subscribed only while listening. They emit distinct `segmentId`s, so the
   * reducer treats them as different utterances and neither can duplicate the
   * other.
   */
  const manual = defaultTranscriptSource;

  // Generation guard: a retrieval that resolves after the operator moved on must
  // not repopulate the panel. Same rule as the typed lookup path.
  const generation = useRef(0);
  const [stream, setStream] = useState<TranscriptStreamState>(EMPTY_STREAM);
  // The reducer's input, so applying an event never depends on render timing.
  const streamRef = useRef<TranscriptStreamState>(EMPTY_STREAM);

  /**
   * The microphone must never outlive the panel that owns it. Unmounting the
   * workspace with listening on would leave a live capture with no visible
   * indicator and no way to stop it.
   */
  useEffect(() => () => live.stop(), [live]);

  // Reported, not stored twice: the workspace re-orders around this and nothing
  // else reads it.
  useEffect(() => {
    onListeningChange?.(listen);
    // `onListeningChange` is intentionally not a dependency — an inline callback
    // would re-fire this on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listen]);

  useEffect(() => {
    const interpret = (event: Parameters<Parameters<TranscriptSource['subscribe']>[0]>[0]) => {
      /**
       * Only a fresh, in-order, FINAL event is interpreted. An interim guess is
       * shown but never parsed — it is a moving target, and offering a passage the
       * speaker had not finished saying is exactly the kind of confident-wrong the
       * rest of this work removes.
       */
      /**
       * The reduction happens against a ref, not inside a `setStream` updater.
       * An updater that also calls `setState` and bumps a ref is not pure, and React
       * is free to run it more than once for one event — under StrictMode it does,
       * which would interpret the same utterance twice.
       */
      const update = applyTranscriptEvent(streamRef.current, event);
      streamRef.current = update.state;
      setStream(update.state);

      /**
       * A PROVISIONAL transcript is interpreted for PREVIEW.
       *
       * The old rule — only finals are ever parsed — existed so a moving target
       * could not be staged as though the speaker had finished. That reasoning is
       * about STAGING, and staging is still manual: nothing here accepts, queues,
       * publishes or Takes. What it cost was the whole live feeling, because every
       * useful thing waited for the endpoint. So a revisable guess now fills a card
       * labelled as updating, and the final result confirms or replaces it.
       */
      if (!event.isFinal && event.text.trim()) {
        // Words came back while the speaker is still going. This is the mark that
        // answers "does it feel like it is listening", so it is taken here —
        // before any judgement about whether those words contained a reference,
        // which for the first revision or two they usually do not.
        if (timelineRef.current !== null) liveLatency.mark(timelineRef.current, 'first-interim');
        const guess = receiveTranscript(event.text);
        if (guess.status === 'candidates' && guess.candidates.length) {
          if (timelineRef.current !== null) liveLatency.mark(timelineRef.current, 'first-candidate');
          /**
           * Heard once is not enough to fill the dominant card. `John 3:6` came
           * from a snapshot cut a moment before "sixteen" — a real verse, and not
           * the one that was said. A reference the speaker actually finished
           * survives the next revision; a fragment usually does not.
           *
           * Keyed to the segment, so the previous utterance cannot donate a vote
           * to this one, and reset by disagreement rather than decayed.
           */
          const decision = decideDisplay(agreementRef.current, {
            segmentId: event.segmentId,
            reference: guess.candidates[0].reference.canonical,
            isFinal: false
          });
          agreementRef.current = decision.state;
          // Every revision supersedes the last, so a retrieval already running for
          // a reading recognition has moved off can no longer land.
          if (decision.invalidatePending) generation.current += 1;
          if (decision.display) {
            if (timelineRef.current !== null) liveLatency.mark(timelineRef.current, 'first-stable');
            setDetecting(false);
            void previewProvisional(guess, generation.current, timelineRef.current);
          } else {
            // Something was heard that looks like a reference, and it has not been
            // confirmed yet. Say that, rather than leaving the surface blank while
            // the operator wonders whether anything is happening.
            setDetecting(true);
          }
        }
        return;
      }

      if (update.finalText !== null) {
        setProvisional(false);
        setDetecting(false);
        // The authoritative answer supersedes every provisional vote; nothing from
        // this utterance may count toward the next one.
        agreementRef.current = forgetAgreement();
        generation.current += 1;
        /**
         * A correction is tried FIRST, because a correction and a failed
         * recognition look identical to the ordinary path: both are fragments with
         * no book in them. "No, verse three" was being refused and then clearing a
         * passage that was correct.
         *
         * It only fires when a confirmed passage is already on screen, and it
         * never runs on a provisional — amending a reference that is itself still
         * a guess would compound two uncertainties into one confident answer.
         */
        const amendment = readCorrection(update.finalText, stackRef.current.current?.reference ?? null);
        if (amendment) {
          void applyCorrection(amendment, generation.current, update.finalText);
          return;
        }

        const next = receiveTranscript(update.finalText);
        /**
         * A refusal reports itself, and changes nothing else. The recognition
         * attempt is transient; the passage the operator is reading is not, and
         * an utterance that produced no reference is not evidence against it.
         */
        setState(next);
        /**
         * Retrieve the strongest reading immediately, rather than making the
         * operator press Retrieve and then wait.
         *
         * The manual step was the wrong safety boundary. What must stay manual is
         * ACCEPTING a passage into the graphic and TAKING it to air — reading the
         * Bible text is what the operator does to decide, so making them ask for it
         * first only delays the decision. This is preview automation: it fills the
         * card they are about to judge. Nothing is accepted, staged, queued or
         * published here.
         */
        if (next.status === 'candidates' && next.candidates.length) {
          setCausedBy(update.finalText);
          /**
           * One window can carry two complete references — Whisper returned
           * "John 3 16 Romans 8 28" for a single utterance, because the preacher
           * said both. They are not competing readings: the operator is on the
           * LATER one. Resolving the strongest candidate picked John and left them
           * on the verse already moved off.
           */
          const newest = newestReference(next.groups);
          const index = newest ? next.candidates.indexOf(newest.target) : 0;
          void resolveCandidate(next, Math.max(0, index), generation.current, timelineRef.current);
        } else if (timelineRef.current !== null) {
          liveLatency.refuse(timelineRef.current);
          timelineRef.current = null;
        }
      }
    };
    // Manual always; live only while listening.
    const unsubscribes = [manual.subscribe(interpret)];
    if (listen) unsubscribes.push(live.subscribe(interpret));
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
      /**
       * Stop clears the votes. Agreement is a claim about ONE utterance in ONE
       * listening session; carrying a vote across a Stop would let the last thing
       * said before the microphone was released count as the first half of the
       * agreement for the first thing said after it.
       */
      agreementRef.current = forgetAgreement();
      /**
       * Cancel the request itself, not just its continuation. `runScriptureLookup`
       * consults the hook's `isCurrent()` BEFORE writing the cache, so a guard
       * that only runs after the await is too late: leaving this workspace mid-
       * retrieve and then running "Reset all local data" let the pending response
       * repopulate the cache the reset had just cleared. `ScriptureLookupPanel`
       * learned this the same way; this panel owns a second hook instance and
       * needs the same cleanup.
       */
      cancel();
    };
  }, [manual, live, listen, cancel]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    /**
     * ALWAYS the manual source, whether or not the microphone is on. Typing is the
     * fallback every failure path points at, so it cannot depend on the state of the
     * thing that failed.
     */
    if (isLiveSource(manual)) return;
    manual.submit(draftTranscript);
  };

  /**
   * Retrieve one candidate's passage.
   *
   * `mine` is captured from the SAME generation the caller already bumped, so a
   * newer utterance arriving mid-flight makes this resolution stale and it writes
   * nothing. That rule already existed for the manual path; auto-resolution needs
   * it more, because utterances can now arrive faster than a lookup completes.
   */
  /**
   * Show a guess from speech still in progress — but only once its text is in hand.
   *
   * A half-heard reference does not merely mis-hear a number, it can invent a
   * reference that does not exist: the rehearsal produced `John 3:60` from
   * "…verse sixty" a moment before the speaker said "sixteen". That parses, so an
   * ordinary resolve would put "John 3:60" on the card and leave it sitting in
   * "Retrieving the passage…" until the final arrived — a fabricated reference,
   * displayed, with nothing to contradict it.
   *
   * So the provisional card is gated on the LOOKUP, not on the parse. Nothing is
   * published unless a real passage came back, which means a reference that cannot
   * exist is silently never shown. Finals keep the opposite rule: there the
   * operator does need to see what was heard even when retrieval fails, because
   * that is the point at which they act.
   *
   * It also never tears the card down. `beginResolving` would blank a passage the
   * operator is already reading on every revision; the previous reading simply
   * stands until a better one is ready to replace it.
   */
  const previewProvisional = async (source: VoiceAssistState, mine: number, timelineId: number | null) => {
    const candidate = source.candidates[0];
    if (!candidate) return;
    /**
     * A chapter with no verse is not shown while the speaker is still going.
     *
     * It retrieves perfectly well — and that is the problem. "…John chapter
     * three" is a complete, valid reference for the WHOLE of John 3, so the card
     * would fill with the entire chapter for a moment and then collapse to one
     * verse when "sixteen" arrived. Mid-utterance a chapter-only reading is
     * almost always a reference that has not finished being spoken: the rehearsal
     * caught it twice, in "…chapter three verse sixteen" and "…chapter four verse
     * eight", and in both the very next revision had the verse.
     *
     * Finals keep the opposite rule. "Turn to Romans eight" is a real thing an
     * operator says and means, and there is nothing further coming.
     */
    if (!candidate.reference.spans.length) return;
    if (timelineId !== null) {
      liveLatency.mark(timelineId, 'first-candidate');
      liveLatency.mark(timelineId, 'lookup-start');
    }
    const found = await lookup(candidate.reference.canonical, translationId);
    // Stale, or a reference the Bible has no such verse for. Either way, say nothing.
    if (generation.current !== mine || !found) return;
    if (timelineId !== null) {
      liveLatency.mark(timelineId, 'lookup-done');
      liveLatency.mark(timelineId, 'first-verse');
    }
    setProvisional(true);
    remember(candidate.reference, found.result, source.transcript);
    /**
     * Functional, like every other write here. `source` was captured BEFORE a
     * lookup that takes ~0.31 s when the passage is not cached, so writing it back
     * flat would undo anything the operator did in the meantime — pressing Dismiss
     * and watching the card reappear a third of a second later, mid-sentence, on
     * its own. Dismissal is a decision about this utterance, so it stands until
     * the next one.
     */
    setState((previous) => (previous.status === 'rejected' ? previous : passageResolved(source, found.result)));
  };

  const resolveCandidate = async (
    source: VoiceAssistState,
    index: number,
    mine: number,
    timelineId: number | null
  ) => {
    const candidate = source.candidates[index];
    if (!candidate) return;
    const wanted = candidate.reference.canonical;
    /**
     * Do not tear the card down to re-resolve the SAME reference.
     *
     * A later snapshot usually confirms the previous one. Re-entering `resolving`
     * would blank a passage the operator is already reading and make the surface
     * flash on every revision — the layout jump this stage exists to remove.
     */
    const alreadyShowing = source.passage?.reference === wanted;
    if (!alreadyShowing) setState((previous) => beginResolving(previous));
    if (timelineId !== null) liveLatency.mark(timelineId, 'first-candidate');
    if (timelineId !== null && !alreadyShowing) liveLatency.mark(timelineId, 'lookup-start');

    const found = await lookup(wanted, translationId);
    if (generation.current !== mine) return; // a newer revision owns the panel now
    if (!found) {
      setState((previous) =>
        resolutionFailed(previous, 'Could not retrieve that passage. Try again, or type the reference.')
      );
      return;
    }
    if (timelineId !== null) {
      liveLatency.mark(timelineId, 'lookup-done');
      liveLatency.mark(timelineId, 'first-verse');
    }
    // Durable from here: this one parsed, validated and retrieved.
    remember(candidate.reference, found.result, source.transcript, source.candidates.slice(1));
    setCorrection('');
    setState((previous) => passageResolved(previous, found.result));
  };

  /**
   * Amend the displayed reference — as a transaction, never as a clear-then-fill.
   *
   * The passage the operator is reading stays exactly where it is until a
   * REPLACEMENT has been retrieved. That ordering is the whole point: the failure
   * this fixes was a correction that emptied the card and then could not fill it,
   * leaving the operator with nothing mid-service and no way back to the verse
   * that had been right.
   */
  const applyCorrection = async (
    amendment: NonNullable<ReturnType<typeof readCorrection>>,
    mine: number,
    heard: string
  ) => {
    setCorrection('working');
    setCausedBy(heard);
    const found = await lookup(amendment.reference.canonical, translationId);
    // A newer utterance owns the panel now — this correction has been superseded
    // and must not land on top of whatever replaced it.
    if (generation.current !== mine) return;
    if (!found) {
      // Say so, and leave the good passage alone. A correction that cannot be
      // retrieved is a failed correction, not a reason to lose the verse.
      setCorrection('failed');
      return;
    }
    setCorrection('');
    setProvisional(false);
    remember(amendment.reference, found.result, heard);
    setState((previous) =>
      passageResolved(
        { ...previous, status: 'candidates', problem: null, message: '',
          candidates: [{ raw: amendment.reference.canonical, reference: amendment.reference,
            interpretation: amendment.interpretation, score: 1 }], selected: 0 },
        found.result
      )
    );
  };

  const resolveStrongest = (source: VoiceAssistState, mine: number, timelineId: number | null) =>
    resolveCandidate(source, 0, mine, timelineId);

  /** Operator picked a different reading: retrieve that one instead. */
  const chooseCandidate = (index: number) => {
    const mine = ++generation.current;
    const next = selectCandidate(state, index);
    setState(next);
    void resolveCandidate(next, index, mine, null);
  };

  const onAcceptClick = () => {
    const outcome = acceptCandidate(state);
    if (!outcome) return; // not reviewable — the model refuses, not the button alone
    setState(outcome.state);
    onAccept(outcome.passage, translationId);
  };

  const strongest = state.candidates[0];
  const chosen = state.candidates[state.selected];
  /**
   * Other readings of the CURRENT span only.
   *
   * This was every candidate except the selected one, which is how a second
   * reference the preacher actually said — "John three sixteen… Romans eight
   * twenty eight" — was offered as an alternative interpretation of the first.
   * Candidates from a different group are a different sentence, not a different
   * reading, and they belong in Previous passage or nowhere.
   */
  const spanCandidates = newestReference(state.groups)?.target
    ? state.groups[state.groups.length - 1].candidates
    : state.candidates;
  const alternatives = spanCandidates.filter(
    (candidate) => candidate.reference.canonical !== state.candidates[state.selected]?.reference.canonical
  );
  const resolving = state.status === 'resolving';
  const problem = state.status === 'no-match' || state.status === 'provider-unavailable';

  return (
    <section className="live-scripture" aria-label="Live Scripture">
      {/* --- listening: the first question an operator has mid-service is whether
          LiveLayer is hearing anything at all, so it is the top of the surface. --- */}
      <div className="live-mic" data-listening={listen || undefined}>
        <button
          type="button"
          className={`btn btn--md live-mic__toggle ${listen ? 'btn--danger' : 'btn--secondary'}`}
          aria-pressed={listen}
          onClick={() => {
            if (listen) {
              live.stop();
              setListen(false);
            } else {
              setListen(true);
              void live.start();
            }
          }}
        >
          <Icon name={listen ? 'micOff' : 'mic'} size={16} />
          {listen ? 'Stop listening' : 'Start listening'}
        </button>

        <div className="live-mic__readout">
          {/* A REAL level, not an animation: bars react to measured frame RMS, so a
              still meter means no audio is arriving and the operator can trust it. */}
          <InputLevelMeter level={mic.level} active={listen} speaking={mic.speaking} />
          <span className="live-mic__state" role="status" aria-live="polite">
            {listen
              ? mic.detail || (mic.speaking ? 'Hearing speech' : 'Listening — say a reference')
              : mic.detail || 'Microphone off'}
          </span>
        </div>
      </div>

      {/* The words we heard, subdued: the operator judges the PASSAGE, not the
          transcript, so this explains rather than competes. */}
      {/* The live transcript. Shown WHILE the speaker talks, which is the whole
          point — the operator should see LiveLayer working, not a blank panel and
          then a result. Distinct from the meter: the meter says audio is arriving,
          this says what DONDO currently thinks it heard. */}
      {interimText(stream) ? (
        <p className="live-heard live-heard--interim" aria-live="off">
          Hearing <span className="live-heard__text">“{interimText(stream)}”</span>
        </p>
      ) : state.transcript ? (
        <p className="live-heard">
          Heard <span className="live-heard__text">“{state.transcript}”</span>
        </p>
      ) : null}

      {detecting && !state.passage ? (
        <p className="live-heard live-heard--detecting" aria-live="off">
          Detecting reference…
        </p>
      ) : null}

      {problem ? (
        <p className="live-problem" role="alert">
          {state.message}
        </p>
      ) : null}

      {/*
        What LiveLayer heard, kept beside what it concluded.
        Subdued, and never a substitute for the passage — but a Scripture
        replacement must never feel like it happened on its own.
      */}
      {causedBy && (confirmed || state.passage) ? (
        <p className="live-heard live-heard--cause" aria-live="off">
          Heard <span className="live-heard__text">“{causedBy}”</span>
        </p>
      ) : null}

      {correction === 'working' ? (
        <p className="live-heard live-heard--detecting" aria-live="polite">
          Updating reference…
        </p>
      ) : null}
      {correction === 'failed' ? (
        /* Stated as its own failure, beside the passage that is still correct —
           never as a reason to take that passage away. */
        <p className="live-problem" role="alert">
          Couldn’t confirm that correction. Showing the last confirmed passage.
        </p>
      ) : null}

      {/* --- the detected passage, dominant --- */}
      {/*
        `previous` is rendered AFTER the card below, as its own compact row. It is
        history, not doubt: the passage that was dominant until the preacher named
        another one. It used to appear under "Other possible readings", which told
        the operator that the newest thing they said was an alternative
        interpretation of the oldest — false in both directions.
      */}
      {/*
        Rendered from the DURABLE half whenever the current attempt has nothing.
        `state` is a recognition attempt and is rebuilt for every utterance;
        `confirmed` is the last passage that actually parsed, validated and
        retrieved. A refusal, a failed lookup, an unstable provisional or a
        correction that could not be confirmed all leave `confirmed` untouched, so
        the operator keeps reading the verse that was right until something valid
        replaces it or they dismiss it themselves.
      */}
      {strongest || resolving || confirmed ? (
        <DetectedScripture
          reference={
            state.passage
              ? chosen?.reference.canonical ?? strongest?.reference.canonical ?? ''
              : confirmed?.reference.canonical ?? chosen?.reference.canonical ?? strongest?.reference.canonical ?? ''
          }
          interpretation={state.passage ? chosen?.interpretation ?? strongest?.interpretation ?? '' : ''}
          passage={state.passage ?? confirmed?.passage ?? null}
          resolving={resolving && !confirmed}
          accepted={state.status === 'accepted'}
          canAccept={canAccept(state)}
          onAccept={onAcceptClick}
          onDismiss={() => {
            // The operator's explicit clear — the ONE thing besides a valid
            // replacement that may remove a confirmed passage.
            forgetConfirmed();
            setCorrection('');
            setCausedBy('');
            setState((previous) => rejectCandidate(previous));
          }}
          provisional={provisional}
          onRendered={() => {
            if (timelineRef.current !== null) {
              liveLatency.mark(timelineRef.current, 'rendered');
              timelineRef.current = null;
            }
          }}
        />
      ) : null}

      {stack.previous ? (
        <div className="live-previous">
          <span className="live-previous__label">Previous passage</span>
          <button
            type="button"
            className="btn btn--ghost btn--sm live-previous__ref"
            // Recoverable, because a preacher who moves on and comes back is
            // ordinary. A swap, not a rewrite: taking it back makes what was
            // dominant the previous one.
            onClick={() => {
              stackRef.current = recallPrevious(stackRef.current);
              setStack(stackRef.current);
              setCausedBy(stackRef.current.current?.heard ?? '');
            }}
          >
            {stack.previous.reference.canonical}
          </button>
        </div>
      ) : null}

      {/* --- other readings, secondary --- */}
      {alternatives.length ? (
        <div className="live-alts">
          <span className="ll-kicker">Other possible readings</span>
          <div className="live-alts__list" role="group" aria-label="Other possible readings">
            {alternatives.map((candidate) => {
              const index = state.candidates.indexOf(candidate);
              return (
                <button
                  key={candidate.reference.canonical}
                  type="button"
                  className="live-alt"
                  onClick={() => chooseCandidate(index)}
                >
                  <span className="live-alt__ref">{candidate.reference.canonical}</span>
                  <span className="live-alt__why">{candidate.interpretation}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* --- typing: always available, whether or not the microphone is on --- */}
      <form className="live-type" onSubmit={submit}>
        <label className="live-type__field">
          <span className="field__label">Type what was said</span>
          <input
            className="field__input"
            value={draftTranscript}
            placeholder='e.g. "First Corinthians thirteen verse four to seven"'
            onChange={(event) => setDraftTranscript(event.target.value)}
          />
        </label>
        <button type="submit" className="btn btn--secondary btn--md" disabled={!draftTranscript.trim()}>
          Interpret
        </button>
      </form>
    </section>
  );
}
