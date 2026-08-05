import { useEffect, useRef, useState } from 'react';
import { useScriptureLookup } from '../../hooks/useScriptureLookup';
import { defaultTranscriptSource } from '../../lib/scripture/transcriptSource';
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
  const { lookup } = useScriptureLookup();
  const source = defaultTranscriptSource;

  // Generation guard: a retrieval that resolves after the operator moved on must
  // not repopulate the panel. Same rule as the typed lookup path.
  const generation = useRef(0);

  useEffect(() => {
    const unsubscribe = source.subscribe((transcript) => {
      generation.current += 1;
      setState(receiveTranscript(transcript));
    });
    return unsubscribe;
  }, [source]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    source.submit?.(draftTranscript);
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
              onClick={() => setState((previous) => selectCandidate(previous, index))}
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
