import { useEffect, useRef, useState } from 'react';
import { useScriptureLookup } from '../../hooks/useScriptureLookup';
import { defaultTranscriptSource, isLiveSource } from '../../lib/scripture/transcriptSource';
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
  const source = defaultTranscriptSource;

  // Generation guard: a retrieval that resolves after the operator moved on must
  // not repopulate the panel. Same rule as the typed lookup path.
  const generation = useRef(0);
  const [stream, setStream] = useState<TranscriptStreamState>(EMPTY_STREAM);
  // The reducer's input, so applying an event never depends on render timing.
  const streamRef = useRef<TranscriptStreamState>(EMPTY_STREAM);

  useEffect(() => {
    const unsubscribe = source.subscribe((event) => {
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
    });
    return () => {
      unsubscribe();
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
  }, [source, cancel]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    /**
     * Narrowed, not optional-chained. `submit` exists only on a manual source and
     * `start`/`stop` only on a live one — the union makes the invalid combinations
     * unrepresentable, so the call site has to say which kind it is holding rather
     * than hoping a method is there.
     *
     * What the union does NOT do is make this component handle a live source: there
     * is no capture UI here, and registering one as the default would make Interpret
     * inert. Only a manual source exists today, and adding a live one is a change to
     * this panel as well as to the port.
     */
    if (isLiveSource(source)) return;
    source.submit(draftTranscript);
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
        <span className="ll-tag">{source.label}</span>
      </header>
      <p className="voice-assist__note">
        No microphone and no speech provider yet. Type what was said to check how it would be interpreted — nothing
        reaches the graphic until you accept a reading.
      </p>
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
