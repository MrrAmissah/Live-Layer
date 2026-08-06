import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_STREAM,
  applyTranscriptEvent,
  interimText,
  resetTranscriptStream,
  stopTranscriptStream
} from './transcriptStream';
import { createManualTranscriptSource, isLiveSource, type TranscriptEvent } from './transcriptSource';

/**
 * A live recogniser revises, so events arrive interim-then-final, sometimes late and
 * out of order. Three impossibilities are the point of this module: an interim guess
 * is never interpreted, a stale revision never replaces a newer one, and stopping is
 * immediate.
 */

const ev = (over: Partial<TranscriptEvent> = {}): TranscriptEvent => ({
  text: 'John three sixteen',
  isFinal: true,
  segmentId: 's1',
  sequence: 0,
  language: 'en',
  sourceId: 'test',
  ...over
});

describe('interim text is never released for interpretation', () => {
  it('yields no final text for an interim event', () => {
    const update = applyTranscriptEvent(EMPTY_STREAM, ev({ isFinal: false, text: 'John three' }));
    expect(update.finalText).toBeNull();
    expect(update.ignored).toBe('');
    // It is still recorded for display — that is what makes a live source feel live.
    expect(update.state.text).toBe('John three');
    expect(interimText(update.state)).toBe('John three');
  });

  it('releases text only when the segment settles', () => {
    let state = EMPTY_STREAM;
    for (const [seq, text] of [[0, 'John'], [1, 'John three'], [2, 'John three six']] as const) {
      const update = applyTranscriptEvent(state, ev({ isFinal: false, sequence: seq, text }));
      expect(update.finalText, text).toBeNull();
      state = update.state;
    }
    const settled = applyTranscriptEvent(state, ev({ isFinal: true, sequence: 3, text: 'John three sixteen' }));
    expect(settled.finalText).toBe('John three sixteen');
    // And once settled there is no interim text left to show.
    expect(interimText(settled.state)).toBe('');
  });
});

describe('a stale segment cannot replace a newer final', () => {
  it('ignores a lower sequence within the same segment', () => {
    const first = applyTranscriptEvent(EMPTY_STREAM, ev({ isFinal: false, sequence: 5, text: 'newer' }));
    const late = applyTranscriptEvent(first.state, ev({ isFinal: false, sequence: 2, text: 'older' }));
    expect(late.ignored).toBe('stale-sequence');
    expect(late.state.text).toBe('newer');
    expect(late.finalText).toBeNull();
  });

  it('refuses to reopen a segment that already settled', () => {
    const settled = applyTranscriptEvent(EMPTY_STREAM, ev({ segmentId: 's1', isFinal: true, text: 'final one' }));
    expect(settled.finalText).toBe('final one');
    // A late revision of s1 — even with a higher sequence — must not be applied.
    const late = applyTranscriptEvent(settled.state, ev({ segmentId: 's1', sequence: 99, text: 'zombie' }));
    expect(late.ignored).toBe('settled-segment');
    expect(late.finalText).toBeNull();
    expect(late.state.text).toBe('final one');
  });

  it('does not let an older utterance overwrite a newer one', () => {
    /**
     * The concrete hazard: s1 settles, s2 settles, and then a straggler for s1
     * arrives. Without the settled memory it would be parsed and staged — the
     * operator would be offered the passage from the utterance before last.
     */
    let state = applyTranscriptEvent(EMPTY_STREAM, ev({ segmentId: 's1', isFinal: true, text: 'first' })).state;
    const second = applyTranscriptEvent(state, ev({ segmentId: 's2', isFinal: true, text: 'second' }));
    expect(second.finalText).toBe('second');
    state = second.state;

    const straggler = applyTranscriptEvent(state, ev({ segmentId: 's1', sequence: 7, isFinal: true, text: 'first again' }));
    expect(straggler.finalText).toBeNull();
    expect(straggler.ignored).toBe('settled-segment');
    expect(straggler.state.text).toBe('second');
  });

  it('refuses a still-OPEN older segment once a newer utterance has started', () => {
    /**
     * The case a per-segment sequence check cannot see. Both segments are open, so
     * neither has settled; `sequence` is only monotonic WITHIN a segment, so s1's 7
     * says nothing about s2's 0. Only arrival order can tell which utterance is
     * current — and without it "s1 interim, s2 interim, s1 final" released s1 and
     * the operator was offered the passage from the sentence before the one being
     * spoken. Ordinary recogniser behaviour, not an adversarial order.
     */
    let state = applyTranscriptEvent(EMPTY_STREAM, ev({ segmentId: 's1', sequence: 0, isFinal: false, text: 's1' })).state;
    state = applyTranscriptEvent(state, ev({ segmentId: 's2', sequence: 0, isFinal: false, text: 's2' })).state;

    const late = applyTranscriptEvent(state, ev({ segmentId: 's1', sequence: 7, isFinal: true, text: 'stale s1' }));
    expect(late.finalText).toBeNull();
    expect(late.ignored).toBe('stale-segment');
    expect(late.state.text).toBe('s2');

    // The current segment is still perfectly revisable.
    const settles = applyTranscriptEvent(state, ev({ segmentId: 's2', sequence: 1, isFinal: true, text: 's2 final' }));
    expect(settles.finalText).toBe('s2 final');
  });

  it('remembers each segment’s own sequence, not one shared counter', () => {
    /**
     * A single scalar `sequence` belonged to whichever segment arrived last, so
     * interleaving reset it: s1 reached 5, s2 started at 0, and a stale s1 revision
     * at 2 then looked NEWER than the 0 on record and was applied.
     */
    let state = applyTranscriptEvent(EMPTY_STREAM, ev({ segmentId: 's1', sequence: 5, isFinal: false, text: 's1 newer' })).state;
    state = applyTranscriptEvent(state, ev({ segmentId: 's2', sequence: 0, isFinal: false, text: 's2' })).state;

    const late = applyTranscriptEvent(state, ev({ segmentId: 's1', sequence: 2, isFinal: true, text: 's1 older' }));
    expect(late.finalText).toBeNull();
    expect(late.ignored).toBe('stale-sequence');
    expect(late.state.text).toBe('s2');
  });

  it('accepts a genuinely new segment', () => {
    const state = applyTranscriptEvent(EMPTY_STREAM, ev({ segmentId: 's1', isFinal: true })).state;
    const next = applyTranscriptEvent(state, ev({ segmentId: 's2', sequence: 0, isFinal: true, text: 'Romans eight one' }));
    expect(next.finalText).toBe('Romans eight one');
  });
});

describe('stopping invalidates late events', () => {
  it('drops everything that arrives after stop', () => {
    const running = applyTranscriptEvent(EMPTY_STREAM, ev({ isFinal: false, text: 'partial' })).state;
    const stopped = stopTranscriptStream(running);

    for (const late of [ev({ segmentId: 's9', isFinal: true, text: 'after stop' }), ev({ isFinal: false, sequence: 9 })]) {
      const update = applyTranscriptEvent(stopped, late);
      expect(update.ignored).toBe('stopped');
      expect(update.finalText).toBeNull();
      expect(update.state).toBe(stopped);
    }
    // And no interim text lingers on a stopped stream.
    expect(interimText(stopped)).toBe('');
  });

  it('resets cleanly for a fresh session', () => {
    expect(resetTranscriptStream()).toEqual(EMPTY_STREAM);
    const reset = resetTranscriptStream();
    expect(applyTranscriptEvent(reset, ev()).finalText).toBe('John three sixteen');
  });
});

describe('the manual source stays fully usable', () => {
  it('emits one final event per submission, with a fresh segment each time', () => {
    const source = createManualTranscriptSource('manual');
    const seen: TranscriptEvent[] = [];
    const off = source.subscribe((event) => seen.push(event));

    source.submit('John three sixteen');
    source.submit('Romans eight twenty eight');

    expect(seen).toHaveLength(2);
    for (const event of seen) {
      expect(event.isFinal).toBe(true);
      expect(event.sequence).toBe(0);
      expect(event.sourceId).toBe('manual');
    }
    // Distinct segments, so the second is never mistaken for a revision of the first.
    expect(seen[0].segmentId).not.toBe(seen[1].segmentId);

    // Both are released for interpretation, in order.
    let state = EMPTY_STREAM;
    const released: string[] = [];
    for (const event of seen) {
      const update = applyTranscriptEvent(state, event);
      if (update.finalText) released.push(update.finalText);
      state = update.state;
    }
    expect(released).toEqual(['John three sixteen', 'Romans eight twenty eight']);

    off();
    source.submit('ignored after unsubscribe');
    expect(seen).toHaveLength(2);
  });

  it('is not a live source, and the type guard says so', () => {
    const source = createManualTranscriptSource();
    expect(isLiveSource(source)).toBe(false);
    expect(source.isLive).toBe(false);
    // No listening claim to make, so no start/stop to call.
    expect('start' in source).toBe(false);
    expect('stop' in source).toBe(false);
  });

  it('delivers to every subscriber and stops on dispose', () => {
    const source = createManualTranscriptSource();
    const a = vi.fn();
    const b = vi.fn();
    const offA = source.subscribe(a);
    source.subscribe(b);
    source.submit('one');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    source.submit('two');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });
});

describe('no capture, ASR, AI or credentials enter this boundary', () => {
  it('has none of them in code', () => {
    for (const file of ['src/lib/scripture/transcriptSource.ts', 'src/lib/scripture/transcriptStream.ts']) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const forbidden of [
        'getUserMedia',
        'MediaRecorder',
        'SpeechRecognition',
        'AudioContext',
        'mediaDevices',
        'openai',
        'anthropic',
        'whisper',
        'deepgram',
        'assemblyai',
        'apiKey',
        'localStorage',
        'sessionStorage',
        'fetch('
      ]) {
        expect(code, `${file}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('adds no dependency', () => {
    // The boundary is types and a Set; nothing to install.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      expect(name).not.toMatch(/whisper|deepgram|assembly|speech|asr|openai|anthropic|vosk|gladia|soniox|rev-ai|riva|coqui|wav2vec|dondo/i);
    }
  });
});
