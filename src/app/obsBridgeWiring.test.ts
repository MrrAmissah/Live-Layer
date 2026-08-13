import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const controlPage = read('src/app/ControlPage.tsx');

const publishShow = controlPage.slice(
  controlPage.indexOf('const publishShow'),
  controlPage.indexOf('const publishClear')
);

/**
 * The OBS scene bridge: Live Layer takes a graphic, OBS follows.
 *
 * The bridge itself lives in the other repo and can be restarted, swapped or
 * killed mid-service. This half is six lines, and every property that keeps it
 * safe is a WIRING property — the kind a refactor drops while every unit test
 * stays green, because there is no pure function to test. Hence source reading.
 *
 * The failure this guards against is specific and bad: a scene switch firing
 * for something that never went to air, or a wedged bridge stalling a Take
 * mid-service.
 */
describe('the OBS bridge hook', () => {
  it('lives inside publishShow — the one publish door', () => {
    // `takeNextWiring.test.ts` forbids a second createMessage/publishCommand
    // path so a Take cannot happen anywhere else. A scene switch that could
    // fire without one would reintroduce exactly that split.
    expect(publishShow).toContain('OBS_BRIDGE');
    expect(publishShow).toContain('/goto?name=');
    const others = controlPage.replace(publishShow, '');
    expect(others).not.toContain('/goto?name=');
  });

  it('fires only after the take is recorded, never before', () => {
    // A scene switch for a Take that failed to publish would put the segment
    // card on air with nothing on it.
    expect(publishShow.indexOf('markProgramShowing(')).toBeLessThan(publishShow.indexOf('OBS_BRIDGE &&'));
  });

  it('fires only for rundown items', () => {
    // The draft and the quick queue carry no segment name. A stray auto-derived
    // title would push OBS somewhere unrelated in the middle of a service.
    expect(publishShow).toContain("source.sourceType === 'rundown'");
  });

  it('is fire-and-forget: never awaited, always caught', () => {
    const hook = publishShow.slice(publishShow.indexOf('if (OBS_BRIDGE'));
    // `fetch` rejects on connection refused — a bridge that is not running.
    expect(hook).toContain('.catch(() => {})');
    // Awaiting would let a wedged bridge stall a Take.
    expect(hook).not.toMatch(/await\s+fetch/);
  });

  it('does not touch what publishShow returns', () => {
    // The return expression drives the live cursor, and the hook sits above it.
    const tail = publishShow.slice(publishShow.lastIndexOf('return '));
    expect(tail).toContain('return outcome.addRecent && outcome.advanceLiveCursor;');
    expect(publishShow.indexOf('if (OBS_BRIDGE')).toBeLessThan(publishShow.lastIndexOf('return '));
  });

  it('never marks the program failed when the bridge does', () => {
    const hook = publishShow.slice(publishShow.indexOf('if (OBS_BRIDGE'));
    // The graphic reached air; only the mirror did not.
    expect(hook).not.toContain('markProgramFailed');
    expect(hook).not.toContain('setLastAction');
  });

  it('is off unless a bridge is configured on this machine', () => {
    // No OBS, no bridge, no behaviour change — which is every machine but one.
    expect(controlPage).toContain("localStorage.getItem('livelayer.obsBridge') ?? ''");
    expect(publishShow).toMatch(/if \(OBS_BRIDGE &&/);
  });

  it('holds no OBS credentials', () => {
    // The bridge reads the websocket password from its environment. Live Layer
    // never talks to OBS directly and must never carry it.
    expect(controlPage).not.toMatch(/OBS_PASSWORD|obs-?password/i);
    expect(controlPage).not.toContain('4455');
  });
});

/**
 * The cue an operator writes, and why it is not just the title.
 *
 * Rundown titles are AUTO-DERIVED from the graphic — "Psalm 90:1", "Rev.
 * Emmanuel Mensah" — none of which is a scene name, so an untouched rundown
 * simply never fires. An `obs:` line in the item's notes lets the on-screen
 * title stay human while still naming a scene.
 */
describe('the notes cue', () => {
  const obsCueFor = (item: { title?: string; notes?: string } | undefined): string | undefined => {
    const cue = /(?:^|\n)\s*obs:\s*(.+)/i.exec(item?.notes ?? '')?.[1]?.trim();
    return cue || item?.title || undefined;
  };

  it('is the source of truth in ControlPage, not a copy', () => {
    // This test re-implements the regex; if the two drift the test is theatre.
    expect(controlPage).toContain("/(?:^|\\n)\\s*obs:\\s*(.+)/i");
  });

  it('prefers the cue over the title', () => {
    expect(obsCueFor({ title: 'Rev. Mensah — Welcome', notes: 'obs: The Word' })).toBe('The Word');
  });

  it('finds a cue on any line, and ignores case and spacing', () => {
    expect(obsCueFor({ title: 'x', notes: 'mic 2 is hot\nOBS:  Offering  \nremember the lights' })).toBe(
      'Offering'
    );
  });

  it('falls back to the title when there is no cue', () => {
    expect(obsCueFor({ title: 'Praise', notes: 'nothing to see' })).toBe('Praise');
    expect(obsCueFor({ title: 'Praise' })).toBe('Praise');
  });

  it('names nothing when there is nothing to name', () => {
    // No label means no fetch, which is how an unnamed item stays inert rather
    // than switching OBS to whatever it guesses.
    expect(obsCueFor(undefined)).toBeUndefined();
    expect(obsCueFor({ title: '', notes: '' })).toBeUndefined();
  });

  it('does not read "obs:" out of the middle of a sentence', () => {
    expect(obsCueFor({ title: 'Praise', notes: 'ask the obs: operator about this' })).toBe('Praise');
  });
});
