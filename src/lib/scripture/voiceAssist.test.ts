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
import { parseSpokenReference } from './spokenReference';
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

  it('cannot end up with a passage that belongs to a different candidate', () => {
    /**
     * The unsafe ORDER, which the resolve-then-select test could not see: select
     * while a retrieval is in flight. The model clears the passage on selection,
     * but the panel's generation ref was only bumped by `resolve` and by a new
     * transcript — not by selecting — so the in-flight result landed on the new
     * selection. On screen the highlighted chip said 2 Timothy while the passage
     * block said 1 Timothy, and Accept applied the reading just moved away from.
     *
     * The model's half is asserted here; the panel's bump is asserted below.
     */
    let state = receiveTranscript('Timothy one seven');
    state = beginResolving(state); // retrieval for candidate 0 is now in flight
    state = selectCandidate(state, 1); // operator changes their mind
    expect(state.passage).toBeNull();
    expect(state.status).toBe('candidates');
    // A late result for candidate 0 must not be acceptable against candidate 1.
    expect(accept(state)).toBeNull();
    expect(canAccept(state)).toBe(false);
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

describe('the retrieval the panel depends on can actually complete', () => {
  /**
   * A wiring bug node tests cannot reach, so it is pinned by inspection.
   *
   * `VoiceAssistPreview` puts the hook's `cancel` in an effect dependency array so
   * that leaving the workspace mid-retrieve invalidates the request. When `cancel`
   * was a fresh closure each render, that effect tore down on EVERY render — and
   * because `lookup` sets loading state before awaiting, the teardown fired while
   * the request was in flight, bumped the request id, and made the lookup resolve
   * 'stale'. The passage never arrived; the panel said "Could not retrieve that
   * passage" every single time. Retrieve, the panel's whole purpose, never worked.
   *
   * Unwrapping any of these useCallbacks brings that back, silently.
   */
  const hook = readFileSync('src/hooks/useScriptureLookup.ts', 'utf8');

  it('returns callbacks with stable identity across renders', () => {
    // Presence anchor: if the hook is renamed or restructured, fail loudly rather
    // than silently asserting nothing.
    expect(hook).toContain('export function useScriptureLookup()');
    expect(hook).toContain("import { useCallback");

    for (const name of ['lookup', 'reset', 'cancel']) {
      expect(hook, `${name} must be memoised`).toMatch(
        new RegExp(`const ${name} = useCallback\\(`)
      );
    }
    // Memoised with no dependencies — anything else reintroduces the churn.
    expect(hook.match(/\}, \[\]\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('keeps the panel effect cleaning up on unmount only', () => {
    const panel = readFileSync('src/components/control/VoiceAssistPreview.tsx', 'utf8');
    const cleanup = panel.slice(panel.indexOf('return () => {'), panel.indexOf('}, [source, cancel]'));
    expect(cleanup).toContain('unsubscribe()');
    expect(cleanup).toContain('cancel()');
  });
});

describe('the operator is told which situation they are in', () => {
  it('distinguishes two passages heard from two readings of one reference', () => {
    /**
     * These are different problems and must not share wording. Two readings means
     * one of them is a mishearing and picking wrong airs the wrong verse. Two
     * passages means both were said and the operator is choosing what to show now.
     * The message previously counted candidates, so both said "readings".
     */
    const two = receiveTranscript('John three sixteen and Romans eight twenty eight');
    expect(two.candidates.map((c) => c.reference.canonical)).toEqual(['John 3:16', 'Romans 8:28']);
    expect(two.message).toContain('2 passages');
    expect(two.message).not.toContain('readings');

    const ambiguous = receiveTranscript('Timothy one seven');
    expect(ambiguous.candidates.length).toBeGreaterThan(1);
    expect(ambiguous.message).toContain('readings');
    expect(ambiguous.message).not.toContain('passages');

    const single = receiveTranscript('John three sixteen');
    expect(single.message).toBe('Heard John 3:16.');
  });

  it('takes its wording from the parser rather than rebuilding it', () => {
    // A second copy of this wording is what drifted. Pin them together.
    for (const text of [
      'John three sixteen',
      'Timothy one seven',
      'John three sixteen and Romans eight twenty eight',
      'Psalm one hundred and nineteen one'
    ]) {
      const parsed = parseSpokenReference(text);
      expect(parsed.ok, text).toBe(true);
      if (!parsed.ok) continue;
      expect(receiveTranscript(text).message, text).toBe(parsed.message);
    }
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

  it('carries only text and its identity across the boundary', () => {
    // No audio, no tensor, no model object, no vendor handle, no credentials —
    // that is what keeps a future ASR choice out of the parser and Program.
    expect(code).toContain('onEvent: (event: TranscriptEvent) => void');
    for (const leak of ['MediaStream', 'AudioBuffer', 'Blob', 'Float32Array', 'apiKey', 'credential', 'model:']) {
      expect(code, leak).not.toContain(leak);
    }
  });

  it('makes invalid source combinations unrepresentable', () => {
    /**
     * A discriminated union rather than optional methods: optional `start`/`stop`
     * would permit a manual source that claims to stop, and a live source with no
     * way to stop — which an operator must always have.
     */
    expect(code).toContain('export type TranscriptSource = ManualTranscriptSource | LiveTranscriptSource;');
    const manual = code.slice(code.indexOf('interface ManualTranscriptSource'), code.indexOf('interface LiveTranscriptSource'));
    expect(manual).toContain('isLive: false');
    expect(manual).toContain('submit(text: string): void');
    expect(manual).not.toContain('start(');
    expect(manual).not.toContain('stop(');

    const live = code.slice(code.indexOf('interface LiveTranscriptSource'));
    expect(live).toContain('isLive: true');
    // Required, not optional — no `?` on either.
    expect(live).toMatch(/start\(\): Promise<void>;/);
    expect(live).toMatch(/stop\(\): void;/);
    expect(live).toContain('isListening()');
    expect(live).toContain('languages: LanguageTag[]');
    expect(live).toContain('setLanguage(');
  });

  it('ships a manual adapter that emits a FINAL event and claims no listening', () => {
    expect(code).toContain("isLive: false");
    expect(code).toContain('isFinal: true');
    // Exactly one source registered in this stage, and it is the manual one.
    expect(code).toMatch(/transcriptSources: TranscriptSource\[\] = \[createManualTranscriptSource\(\)\]/);
    // No live implementation ships here.
    expect(code).not.toContain('getUserMedia');
    expect(code).not.toContain('new MediaRecorder');
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
    // Accept applies the DURABLE current passage — the one on screen — rather than
    // whatever the latest recognition attempt produced. The exit is unchanged: one
    // call to the workspace's handler, no private path to the draft.
    expect(code).toContain('onAccept(current.passage, translationId)');
    const workspace = readFileSync('src/app/workspaces/ScriptureWorkspace.tsx', 'utf8');
    // Matched across whitespace: the property is that the panel is handed the
    // workspace's `accept`, not that the JSX happens to fit on one line. Pinning
    // the formatting made this fail for a line break, which teaches the next
    // person to loosen the assertion rather than look at what it protects.
    expect(/<VoiceAssistPreview\s+onAccept=\{accept\}/.test(workspace)).toBe(true);
  });

  it('invalidates an in-flight retrieval when the selection changes', () => {
    /**
     * Without this the passage and the highlighted candidate can disagree. The
     * property is unchanged; only its location moved when choosing an alternative
     * became `chooseCandidate`, which now also retrieves the newly chosen reading
     * rather than waiting for a Retrieve press.
     */
    const choose = code.slice(code.indexOf('const chooseCandidate'));
    const bumpAt = choose.indexOf('++generation.current');
    const selectAt = choose.indexOf('selectCandidate(state, index)');
    expect(bumpAt).toBeGreaterThan(-1);
    expect(selectAt).toBeGreaterThan(-1);
    // The generation must be bumped BEFORE the new selection is resolved.
    expect(bumpAt).toBeLessThan(selectAt);
    // …and the retrieval it starts carries that generation, so a newer utterance
    // makes it stale rather than letting it overwrite the panel.
    expect(choose).toContain('resolveCandidate(next, index, mine, null)');
  });

  it('cancels the hook on unmount, so a pending retrieval cannot repopulate the cache', () => {
    /**
     * `runScriptureLookup` consults `isCurrent()` BEFORE writing the cache, so a
     * guard that only runs after the await is too late. `ScriptureLookupPanel`
     * learned this; this panel owns a second hook instance and needs the same
     * cleanup or leaving mid-retrieve then resetting local data repopulates the
     * cache the reset just cleared.
     */
    expect(code).toContain('cancel } = useScriptureLookup()');
    const cleanup = code.slice(code.indexOf('return () => {'));
    expect(cleanup).toContain('unsubscribe()');
    expect(cleanup).toContain('cancel()');
  });

  it('gates the accept button on the model, not just on the button', () => {
    /**
     * The gate now reads the DURABLE stack rather than the transient recognition
     * state, and that is a strengthening rather than a relaxation. Coupled to the
     * transient half, Accept went dead the moment the next utterance was ordinary
     * preaching: the card correctly kept showing John 3:16 and the button refused,
     * because the latest attempt had been a no-match. In continuous listening that
     * is most of the time.
     *
     * What must not change: the handler refuses on its own, and the button is
     * disabled from the model rather than by markup.
     */
    expect(code).toContain('const current = stackRef.current.current;');
    // A provisional is refused by the handler itself, not only by a disabled
    // button — a guess the final never confirmed must never reach the draft.
    expect(code).toMatch(/if \(preview \|\| !current \|\| acceptedRef === acceptIdentity\(current\)\) return;/);
    expect(code).toContain('canAccept={!preview && !!confirmed && acceptedRef !== acceptIdentity(confirmed)}');
    const card = readFileSync('src/components/control/DetectedScripture.tsx', 'utf8');
    expect(card).toContain('disabled={!canAccept}');
  });

  it('cannot accept anything the operator is not looking at', () => {
    // The card shows the provisional when there is one and the durable passage
    // otherwise; Accept only ever applies the durable one, and is refused
    // entirely while a provisional is on screen.
    expect(code).toContain('const shown = preview ?? confirmed;');
    expect(code).toContain('passage={shown.passage}');
    expect(code).not.toContain('acceptCandidate(state)');
  });

  it('never promotes a provisional into the durable stack', () => {
    /**
     * The safety defect this section exists for. `previewProvisional` used to call
     * `remember`, so a guess made from half a sentence entered the stack — and
     * since the stack is what Accept applies, a reading the final never confirmed
     * could be put into the draft.
     */
    const preview = code.slice(code.indexOf('const previewProvisional'), code.indexOf('const resolveCandidate'));
    expect(preview).toContain('setPreview(');
    expect(preview, 'a provisional must never reach the durable stack').not.toContain('remember(');
  });
});

describe('the provisional layer has its own exits', () => {
  const panel = readFileSync('src/components/control/VoiceAssistPreview.tsx', 'utf8');

  it('discards the provisional on Stop, without touching the durable stack', () => {
    const stop = panel.slice(panel.indexOf('live.stop();'), panel.indexOf('live.stop();') + 320);
    expect(stop).toContain('discardPreview()');
    expect(stop, 'Stop must never clear what was confirmed').not.toContain('forgetConfirmed()');
  });

  it('treats a source that stopped itself the same way', () => {
    // Permission refusal, or the speech service disappearing mid-utterance.
    const terminal = panel.slice(panel.indexOf("status.status === 'denied'"), panel.indexOf("status.status === 'denied'") + 420);
    expect(terminal).toContain('discardPreview()');
  });

  it('dismisses the layer on screen, not the one beneath it', () => {
    const dismiss = panel.slice(panel.indexOf('onDismiss={() => {'), panel.indexOf('provisional={provisional}'));
    // The provisional branch returns before anything durable is touched, and it
    // marks the utterance so the rest of it is ignored — clearing the preview
    // alone left the final free to promote the very reading just waved away.
    expect(dismiss).toContain('dismissedSegmentRef.current = streamRef.current.segmentId;');
    expect(dismiss).toMatch(/discardPreview\(\);[\s\S]{0,400}?return;/);
    expect(dismiss).not.toMatch(/if \(preview\)[\s\S]{0,300}?forgetConfirmed\(\)/);
    expect(dismiss).toContain('forgetConfirmed()');
  });

  it('invalidates work in flight when the attempt ends', () => {
    const discard = panel.slice(panel.indexOf('const discardPreview = () => {'), panel.indexOf('const acceptIdentity'));
    // Without the generation bump a provisional lookup already running lands
    // afterwards and puts the discarded guess straight back.
    expect(discard).toContain('generation.current += 1');
    expect(discard).toContain('forgetAgreement()');
  });
});
