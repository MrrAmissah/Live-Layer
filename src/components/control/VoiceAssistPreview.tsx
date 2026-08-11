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
export default function VoiceAssistPreview({ onAccept, translationId }: Props) {
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
  const [mic, setMic] = useState<LiveSourceStatus>({ status: 'idle', detail: '', speaking: false });
  /**
   * Created once. Re-creating the source on a status change would tear down the
   * microphone it is reporting about — the same unstable-callback shape that once
   * cancelled every scripture lookup in flight.
   */
  const liveRef = useRef<ReturnType<typeof createLiveTranscriptSource> | null>(null);
  if (!liveRef.current) {
    liveRef.current = createLiveTranscriptSource({
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
      if (update.finalText !== null) {
        generation.current += 1;
        setState(receiveTranscript(update.finalText));
      }
    };
    // Manual always; live only while listening.
    const unsubscribes = [manual.subscribe(interpret)];
    if (listen) unsubscribes.push(live.subscribe(interpret));
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
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

  const resolve = async () => {
    const candidate = state.candidates[state.selected];
    if (!candidate) return;
    const mine = ++generation.current;
    setState((previous) => beginResolving(previous));

    const found = await lookup(candidate.reference.canonical, translationId);
    if (generation.current !== mine) return; // stale
    if (!found) {
      setState((previous) => resolutionFailed(previous, 'Could not retrieve that passage. Try again, or type it in.'));
      return;
    }
    setState((previous) => passageResolved(previous, found.result));
  };

  const onAcceptClick = () => {
    const outcome = acceptCandidate(state);
    if (!outcome) return; // not reviewable — the model refuses, not the button alone
    setState(outcome.state);
    onAccept(outcome.passage, translationId);
  };

  const chosen = state.candidates[state.selected];

  return (
    <section className="voice-assist" aria-label="Voice assist preview">
      <header className="voice-assist__head">
        <span className="ll-kicker">Voice assist · preview</span>
        {/* Honest about what this is. A manual source must not imply listening. */}
        <span className="ll-tag">{listen ? live.label : manual.label}</span>
      </header>
      <p className="voice-assist__note">
        Nothing reaches the graphic until you accept a reading, and Take is a second, separate press. Typing works
        whether or not the microphone is on.
      </p>

      {/* Explicit start and stop, every time. The label says which action the press
          performs, not which state the app is in — "Listening…" on a button is a
          status pretending to be a verb. */}
      <div className="voice-assist__mic" data-listening={listen || undefined}>
        <button
          type="button"
          className={`btn btn--md ${listen ? 'btn--danger' : 'btn--secondary'}`}
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
          {listen ? 'Stop listening' : 'Start listening'}
        </button>
        <span className="voice-assist__mic-state" role="status" aria-live="polite">
          {listen ? (
            <>
              <span
                className="voice-assist__mic-dot"
                data-speaking={mic.speaking || undefined}
                aria-hidden
              />
              {mic.detail || (mic.speaking ? 'Hearing you…' : 'Listening — say a reference')}
            </>
          ) : (
            mic.detail || 'Microphone off.'
          )}
        </span>
      </div>
      {/* Interim text is displayed for responsiveness and never parsed. A manual
          source produces none, so this is inert today by construction. */}
      {interimText(stream) ? (
        <p className="voice-assist__interim" aria-live="off">
          Hearing: {interimText(stream)}
        </p>
      ) : null}

      <form className="voice-assist__form" onSubmit={submit}>
        <label className="voice-assist__field">
          <span className="field__label">Transcript</span>
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

      <p className="field__hint voice-assist__status" role="status" aria-live="polite">
        {state.status === 'no-match' || state.status === 'provider-unavailable' ? '' : state.message}
      </p>
      <p className="field__hint field__hint--error voice-assist__status" role="alert">
        {state.status === 'no-match' || state.status === 'provider-unavailable' ? state.message : ''}
      </p>

      {state.candidates.length ? (
        <div className="voice-assist__candidates" role="group" aria-label="Reference candidates">
          {state.candidates.map((candidate, index) => (
            <button
              key={candidate.reference.canonical}
              type="button"
              className={`voice-cand${index === state.selected ? ' voice-cand--active' : ''}`}
              aria-pressed={index === state.selected}
              onClick={() => {
                /**
                 * Bump the generation, or a retrieval already in flight for the
                 * PREVIOUS candidate lands afterwards and is written onto this
                 * one — leaving the highlighted chip saying 2 Timothy while the
                 * passage block says 1 Timothy, and Accept applying the reading
                 * the operator had just moved away from.
                 */
                generation.current += 1;
                setState((previous) => selectCandidate(previous, index));
              }}
            >
              <span className="voice-cand__ref">{candidate.reference.canonical}</span>
              {/* Why this reading — the operator is choosing between interpretations,
                  so the reasoning has to be visible, not just the answer. */}
              <span className="voice-cand__why">{candidate.interpretation}</span>
            </button>
          ))}
        </div>
      ) : null}

      {chosen ? (
        <div className="voice-assist__actions">
          <button
            type="button"
            className="btn btn--secondary btn--md"
            onClick={() => void resolve()}
            disabled={state.status === 'resolving'}
          >
            {state.status === 'resolving' ? 'Looking up…' : `Retrieve ${chosen.reference.canonical}`}
          </button>
        </div>
      ) : null}

      {state.passage ? (
        <div className="voice-assist__passage">
          <header className="voice-assist__passage-head">
            <h4 className="voice-assist__ref">{state.passage.reference}</h4>
            <span className="ll-tag">{state.passage.translation}</span>
          </header>
          <p className="voice-assist__text">{state.passage.text}</p>
          {state.passage.attribution ? (
            <p className="voice-assist__attribution">{state.passage.attribution}</p>
          ) : null}
          <div className="voice-assist__actions">
            {/* Accept is the only exit. Dismiss changes nothing at all. */}
            <button type="button" className="btn btn--md" onClick={onAcceptClick} disabled={!canAccept(state)}>
              Accept into Scripture draft
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--md"
              onClick={() => setState((previous) => rejectCandidate(previous))}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
