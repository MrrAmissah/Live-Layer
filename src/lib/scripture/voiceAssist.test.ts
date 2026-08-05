import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  IDLE,
  accept,
  beginResolving,
  canAccept,
  passageResolved,
  receiveTranscript,
  reject,
  resetVoiceAssist,
  resolutionFailed,
  selectCandidate,
  type VoiceAssistState
} from './voiceAssist';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { CLEAR_PROGRAM_STATE } from '../../types/program';
import type { ScriptureLookupResult } from '../../types/scripture';

/**
 * The property that matters more than the feature: **no state stages, queues or
 * airs anything.** `accept` is the only transition that yields a passage, and it
 * only does so from `review`.
 */

const passage = (reference = 'John 3:16'): ScriptureLookupResult => ({
  reference,
  text: '<<PASSAGE>>',
  translation: 'WEB',
  providerId: 'bible-api',
  fetchedAt: '2026-01-01T00:00:00.000Z'
});

beforeEach(() => {
  useLiveLayerStore.setState({ program: { ...CLEAR_PROGRAM_STATE }, quickQueue: [], recent: [] });
});

describe('the state machine', () => {
  it('starts idle and returns to idle on reset', () => {
    expect(IDLE.status).toBe('idle');
    expect(resetVoiceAssist()).toEqual(IDLE);
  });

  it('turns a transcript into candidates without retrieving anything', () => {
    const state = receiveTranscript('Timothy one seven');
    expect(state.status).toBe('candidates');
    expect(state.candidates.length).toBe(2);
    // Nothing retrieved, nothing staged.
    expect(state.passage).toBeNull();
    // The transcript is kept verbatim, not rewritten behind the operator.
    expect(state.transcript).toBe('Timothy one seven');
  });

  it('pre-selects the top reading as a convenience, not a decision', () => {
    const state = receiveTranscript('Timothy one seven');
    expect(state.selected).toBe(0);
    // Pre-selection is not acceptance: there is no passage and accept refuses.
    expect(canAccept(state)).toBe(false);
    expect(accept(state)).toBeNull();
  });

  it('reports an uninterpretable transcript as no-match, with the reason', () => {
    const state = receiveTranscript('gibberish here');
    expect(state.status).toBe('no-match');
    expect(state.problem).toBe('no-book');
    expect(state.message.length).toBeGreaterThan(10);
    expect(state.candidates).toEqual([]);
  });

  it('treats an empty transcript as idle rather than an error', () => {
    expect(receiveTranscript('   ').status).toBe('idle');
  });

  it('discards a retrieved passage when the selection changes', () => {
    // The reference on screen and the text on screen must never disagree.
    let state = receiveTranscript('Timothy one seven');
    state = passageResolved(beginResolving(state), passage('1 Timothy 1:7'));
    expect(state.passage).not.toBeNull();
    state = selectCandidate(state, 1);
    expect(state.passage).toBeNull();
    expect(state.status).toBe('candidates');
  });

  it('ignores an out-of-range selection', () => {
    const state = receiveTranscript('John three sixteen');
    expect(selectCandidate(state, 5)).toBe(state);
    expect(selectCandidate(state, -1)).toBe(state);
  });

  it('surfaces a provider failure without losing the transcript', () => {
    let state = receiveTranscript('John three sixteen');
    state = resolutionFailed(beginResolving(state), 'Could not retrieve that passage.');
    expect(state.status).toBe('provider-unavailable');
    expect(state.passage).toBeNull();
    expect(state.transcript).toBe('John three sixteen');
  });
});

describe('accept is the only exit', () => {
  const reviewed = (): VoiceAssistState =>
    passageResolved(beginResolving(receiveTranscript('John three sixteen')), passage());

  it('yields the passage only from review', () => {
    const outcome = accept(reviewed());
    expect(outcome).not.toBeNull();
    expect(outcome!.passage.reference).toBe('John 3:16');
    expect(outcome!.state.status).toBe('accepted');
  });

  it('refuses from every other state', () => {
    expect(accept(IDLE)).toBeNull();
    expect(accept(receiveTranscript('John three sixteen'))).toBeNull();
    expect(accept(beginResolving(receiveTranscript('John three sixteen')))).toBeNull();
    expect(accept(receiveTranscript('gibberish here'))).toBeNull();
    expect(accept(reject(reviewed()))).toBeNull();
  });

  it('refuses a SECOND accept, so one utterance cannot be applied twice', () => {
    /**
     * The status check is what makes this true, and this is the case that proves
     * it. Every other non-review state has a null passage anyway, so a
     * passage-only guard would look sufficient while leaving `accepted` open —
     * and a double-press would re-apply the passage to the draft.
     */
    const first = accept(reviewed());
    expect(first).not.toBeNull();
    expect(first!.state.status).toBe('accepted');
    expect(first!.state.passage).not.toBeNull(); // still carried, deliberately
    expect(accept(first!.state)).toBeNull();
    expect(canAccept(first!.state)).toBe(false);
  });

  it('cannot be forced by faking the status without a passage', () => {
    // A hand-built state that claims review but carries nothing.
    const bogus: VoiceAssistState = { ...IDLE, status: 'review', passage: null };
    expect(accept(bogus)).toBeNull();
    expect(canAccept(bogus)).toBe(false);
  });
});

describe('rejection changes nothing', () => {
  it('drops the passage and the selection, keeping the transcript readable', () => {
    const state = reject(passageResolved(beginResolving(receiveTranscript('John three sixteen')), passage()));
    expect(state.status).toBe('rejected');
    expect(state.passage).toBeNull();
    expect(state.selected).toBe(-1);
    expect(state.transcript).toBe('John three sixteen');
    expect(state.message).toContain('unchanged');
  });
});

describe('Program is untouched by the entire flow', () => {
  it('stays byte-identical across transcript, candidates, resolve, accept and reject', () => {
    /**
     * Reference identity, not value equality: a same-value rewrite would pass
     * `toEqual` while still having replaced the object. The model is pure, so this
     * asserts it has no hidden reach into the store — including through `accept`,
     * whose job is to HAND BACK a passage, not to apply one.
     */
    const before = useLiveLayerStore.getState().program;

    let state = receiveTranscript('First Corinthians thirteen four to seven');
    state = selectCandidate(state, 0);
    state = beginResolving(state);
    state = passageResolved(state, passage('1 Corinthians 13:4-7'));
    const outcome = accept(state);
    expect(outcome).not.toBeNull();
    const rejected = reject(state);
    expect(rejected.status).toBe('rejected');

    expect(useLiveLayerStore.getState().program).toBe(before);
    expect(useLiveLayerStore.getState().program.status).toBe('clear');
    expect(useLiveLayerStore.getState().quickQueue).toHaveLength(0);
    expect(useLiveLayerStore.getState().recent).toHaveLength(0);
  });

  it('has no store, realtime or Program reference in the model at all', () => {
    const code = readFileSync('src/lib/scripture/voiceAssist.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const forbidden of ['useLiveLayerStore', 'publishCommand', 'createMessage', 'markProgram', 'setActiveItem', 'addToQuickQueue']) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });
});

describe('the transcript port stays provider-neutral', () => {
  const port = readFileSync('src/lib/scripture/transcriptSource.ts', 'utf8');
  const code = port.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('carries only a string across the boundary', () => {
    // No audio, no confidence vector, no vendor handle — that is what keeps a
    // future provider choice out of the parser and the Program path.
    expect(code).toContain('onTranscript: (transcript: string) => void');
    for (const leak of ['MediaStream', 'AudioBuffer', 'Blob', 'confidence', 'apiKey', 'token']) {
      expect(code, leak).not.toContain(leak);
    }
  });

  it('ships a manual adapter that does not claim to listen', () => {
    expect(code).toContain("id: 'manual'");
    expect(code).toContain('isLive: false');
    // Exactly one source registered in this stage.
    expect(code).toMatch(/transcriptSources: TranscriptSource\[\] = \[createManualTranscriptSource\(\)\]/);
  });

  it('persists nothing', () => {
    expect(code).not.toContain('localStorage');
    expect(code).not.toContain('sessionStorage');
  });
});

describe('the panel cannot air or stage on its own', () => {
  const panel = readFileSync('src/components/control/VoiceAssistPreview.tsx', 'utf8');
  const code = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('renders no Take or Clear and cannot publish', () => {
    expect(code).not.toMatch(/className="take-btn/);
    expect(code).not.toMatch(/className="clear-btn/);
    for (const forbidden of ['publishCommand', 'createMessage', 'markProgram', 'addToQuickQueue', 'addDraftToRundown']) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('routes an accepted passage through the workspace, not around it', () => {
    // `onAccept` is the single exit, and it is the same handler the typed lookup
    // uses — so voice cannot acquire a private path to the draft.
    expect(code).toContain('onAccept(outcome.passage, translationId)');
    const workspace = readFileSync('src/app/workspaces/ScriptureWorkspace.tsx', 'utf8');
    expect(workspace).toContain('<VoiceAssistPreview onAccept={accept}');
  });

  it('gates the accept button on the model, not just on the button', () => {
    expect(code).toContain('const outcome = acceptCandidate(state);');
    expect(code).toMatch(/if \(!outcome\) return;/);
    expect(code).toContain('disabled={!canAccept(state)}');
  });
});
