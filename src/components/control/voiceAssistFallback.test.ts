import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createManualTranscriptSource, isLiveSource } from '../../lib/scripture/transcriptSource';
import { applyTranscriptEvent, EMPTY_STREAM } from '../../lib/scripture/transcriptStream';

const panel = readFileSync(join(process.cwd(), 'src/components/control/VoiceAssistPreview.tsx'), 'utf8');

/**
 * Typing is the fallback every failure path in the speech assist points at — "type
 * the reference instead" is what the operator is told when the microphone is
 * refused, absent, or the local service is down.
 *
 * It was not true. The panel selected ONE source (`listen ? live : manual`) and
 * `submit` returned early when that source was live, so turning the microphone on
 * silently disabled Interpret. The failure paths made it worse: `listen` stayed
 * true after a permission refusal, so the panel told the operator to type while the
 * only input control did nothing.
 *
 * These pin the fix at the seam a component test cannot reach without a DOM
 * renderer, which this project does not have.
 */

describe('typing and listening are additive, not alternatives', () => {
  it('subscribes the manual source unconditionally', () => {
    // Not inside a conditional, and not swapped for the live one.
    expect(panel).toMatch(/const unsubscribes = \[manual\.subscribe\(interpret\)\]/);
    expect(panel).not.toMatch(/listen \? live : defaultTranscriptSource/);
  });

  it('adds the live source only while listening', () => {
    expect(panel).toMatch(/if \(listen\) unsubscribes\.push\(live\.subscribe\(interpret\)\)/);
  });

  it('submits typed text through the manual source, whatever the microphone is doing', () => {
    // The old code narrowed on the SWITCHED source and returned when it was live.
    expect(panel).toContain('manual.submit(draftTranscript)');
    expect(panel).not.toMatch(/if \(isLiveSource\(source\)\) return/);
  });

  it('leaves listening mode when live capture stops for any reason', () => {
    // Otherwise the button reads "Stop listening" over a source that is already
    // dead, and the panel's own fallback advice contradicts its state.
    expect(panel).toMatch(/status === 'denied' \|\| status\.status === 'unavailable' \|\| status\.status === 'stopped'/);
    expect(panel).toMatch(/setListen\(false\)/);
  });

  it('still stops the microphone when the panel unmounts', () => {
    expect(panel).toMatch(/useEffect\(\(\) => \(\) => live\.stop\(\), \[live\]\)/);
  });
});

describe('the manual source itself is unchanged', () => {
  it('produces a final event per submission, as it always did', () => {
    const manual = createManualTranscriptSource();
    const events: { text: string; isFinal: boolean }[] = [];
    manual.subscribe((e) => events.push({ text: e.text, isFinal: e.isFinal }));
    manual.submit('John three sixteen');
    expect(events).toEqual([{ text: 'John three sixteen', isFinal: true }]);
    expect(isLiveSource(manual)).toBe(false);
  });

  it('gives each submission its own segment, so two typed lines both interpret', () => {
    const manual = createManualTranscriptSource();
    let update = { state: EMPTY_STREAM, finalText: null as string | null, ignored: '' as string };
    const released: string[] = [];
    manual.subscribe((event) => {
      update = applyTranscriptEvent(update.state, event) as typeof update;
      if (update.finalText) released.push(update.finalText);
    });
    manual.submit('Romans eight one');
    manual.submit('Psalm twenty three one');
    expect(released).toEqual(['Romans eight one', 'Psalm twenty three one']);
  });

  it('interleaves with a live source without either being swallowed', () => {
    // Both feed one reducer. Distinct segment ids are what keep them apart; the
    // panel relies on this to let an operator type while the microphone is on.
    const manual = createManualTranscriptSource('manual');
    const liveish = createManualTranscriptSource('dondo-local');
    let update = { state: EMPTY_STREAM, finalText: null as string | null, ignored: '' as string };
    const released: string[] = [];
    const handle = (event: Parameters<Parameters<typeof manual.subscribe>[0]>[0]) => {
      update = applyTranscriptEvent(update.state, event) as typeof update;
      if (update.finalText) released.push(update.finalText);
    };
    manual.subscribe(handle);
    liveish.subscribe(handle);
    liveish.submit('heard from the microphone');
    manual.submit('typed while listening');
    expect(released).toEqual(['heard from the microphone', 'typed while listening']);
  });
});

describe('the panel no longer claims to be typed-only', () => {
  it('does not still say there is no microphone', () => {
    expect(panel).not.toMatch(/No microphone and no speech provider yet/);
  });

  it('says typing works whether or not the microphone is on', () => {
    expect(panel).toMatch(/Typing works\s*\n?\s*whether or not the microphone is on/);
  });
});
