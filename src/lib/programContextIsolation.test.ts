import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInstanceFromDraft, useLiveLayerStore } from '../store/useLiveLayerStore';
import { CLEAR_PROGRAM_STATE } from '../types/program';
import {
  getServiceContext,
  resetServiceContextCache,
  setServiceContext,
  stampServiceContext
} from './serviceContext';
import { parseRealtimeMessage } from './realtimeMessages';
import type { GraphicInstance } from '../types/graphics';

/**
 * AUTHORING CONTEXT IS NOT PROGRAM CONTEXT.
 *
 * The failure this whole design exists to prevent: a countdown graphic is taken
 * for the 10:30 service, the operator then sets up the 19:00 evening session,
 * and the graphic already on air silently retimes itself — because Output
 * resolved `{{countdown}}` from whatever the control surface currently believed.
 *
 * The fix is that GOING TO AIR freezes the context into the published instance.
 * Program reads that; Preview reads the live one; they are allowed to differ,
 * and the difference is the feature.
 *
 * The boundary is air, not authoring. Prepared content — a rundown item, a
 * saved graphic, the draft — carries NO context, so a rundown duplicated from
 * last week counts down to the service being run now.
 */

const store = new Map<string, string>();
/** Exactly what the setup panel does, so the test drives the real path. */
const setService = (startAt: string) => setServiceContext({ name: 'S', startAt });

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear()
  });
  resetServiceContextCache();
  useLiveLayerStore.setState({
    program: { ...CLEAR_PROGRAM_STATE },
    currentTemplateId: 'announcement-banner',
    draftValues: { headline: 'Doors at {{eventTime}} · {{countdown}}' },
    layout: {},
    durationSeconds: 6
  });
});

/** What `publishShow` does to a graphic on its way to air. */
const air = (graphic: GraphicInstance) => stampServiceContext(graphic, getServiceContext());
const draft = () => buildInstanceFromDraft(useLiveLayerStore.getState());

describe('going to air captures the context it was taken with', () => {
  it('freezes the configured start time onto the published instance', () => {
    setService('2026-08-10T10:30');
    expect(air(draft()).dynamicContext).toEqual({ eventDateTime: '2026-08-10T10:30' });
  });

  it('captures the DATETIME, never a rendered countdown', () => {
    // A resolved "00:12:04" would freeze on air. The datetime keeps ticking.
    setService('2026-08-10T10:30');
    const captured = air(draft()).dynamicContext!;
    expect(captured.eventDateTime).toBe('2026-08-10T10:30');
    expect(JSON.stringify(captured)).not.toMatch(/\d\d:\d\d:\d\d/);
  });

  it('captures nothing when no service time is configured', () => {
    setService('');
    // Not an empty object — absent, so an unconfigured Take stays unresolved.
    expect(air(draft()).dynamicContext).toBeUndefined();
  });
});

describe('changing the service afterwards cannot retime what is on air', () => {
  it('the aired instance keeps its own context when the service moves', () => {
    setService('2026-08-10T10:30');
    const onAir = air(draft());

    // The operator now prepares the evening session.
    setService('2026-08-10T19:00');

    expect(onAir.dynamicContext).toEqual({ eventDateTime: '2026-08-10T10:30' });
  });

  it('a later Take publishes the new context, as it should', () => {
    setService('2026-08-10T10:30');
    const morning = air(draft());
    setService('2026-08-10T19:00');
    const evening = air(draft());

    expect(morning.dynamicContext?.eventDateTime).toBe('2026-08-10T10:30');
    expect(evening.dynamicContext?.eventDateTime).toBe('2026-08-10T19:00');
  });

  it('editing the service never touches Program', () => {
    const before = useLiveLayerStore.getState().program;
    setService('2026-08-10T19:00');
    expect(useLiveLayerStore.getState().program).toBe(before);
  });
});

describe('preparation carries no context; only air does', () => {
  it('an authored graphic has none, whatever the service says', () => {
    // Drafts, saved graphics and presets all come from here. A context frozen
    // at save time would make a graphic reused in September still count down to
    // the service it was written for in August.
    setService('2026-08-10T10:30');
    expect(draft().dynamicContext).toBeUndefined();
  });

  it('the build path does not read the service at all', () => {
    const source = readFileSync('src/store/useLiveLayerStore.ts', 'utf8');
    const build = source.slice(source.indexOf('export function buildInstanceFromDraft'));
    expect(build.slice(0, build.indexOf('\n}'))).not.toMatch(/ServiceContext|dynamicContext:/);
  });
});

describe('a stale context on prepared content is corrected at air, never aired', () => {
  /**
   * The duplicated-rundown case. `duplicateRundown` deep-clones graphics, so if
   * one ever carried a context — from an older build, an import, a hand-edited
   * record — the copy carries it too. Neither branch may let that reach air.
   */
  const stale = { id: 'g', values: {}, dynamicContext: { eventDateTime: '2026-08-03T10:30' } } as unknown as GraphicInstance;

  it('a configured service overwrites it', () => {
    setService('2026-08-10T19:00');
    expect(air(stale).dynamicContext).toEqual({ eventDateTime: '2026-08-10T19:00' });
  });

  it('no configured service strips it rather than keeping last week’s time', () => {
    setService('');
    expect(air(stale).dynamicContext).toBeUndefined();
    expect('dynamicContext' in air(stale)).toBe(false);
  });

  it('leaves the source graphic untouched either way', () => {
    // The rundown item is preparation and must survive its own Take unchanged.
    setService('2026-08-10T19:00');
    air(stale);
    setService('');
    air(stale);
    expect(stale.dynamicContext).toEqual({ eventDateTime: '2026-08-03T10:30' });
  });
});

describe('every path to air is stamped, because there is only one door', () => {
  const control = readFileSync('src/app/ControlPage.tsx', 'utf8');
  const publish = control.slice(control.indexOf('const publishShow ='));

  it('publishShow stamps before it builds the message or touches Program', () => {
    // Stamping later would let the wire payload and Program’s snapshot disagree
    // about what actually aired.
    const stamp = publish.indexOf('stampServiceContext(');
    expect(stamp).toBeGreaterThan(-1);
    for (const after of ["createMessage('SHOW_GRAPHIC'", 'markProgramShowing(', 'markProgramFailed(']) {
      expect(publish.indexOf(after), after).toBeGreaterThan(stamp);
    }
  });

  it('the rundown and quick-queue takes go through it unstamped', () => {
    // If either stamped for itself, the two would drift. They hand over the
    // prepared graphic and let the one door do it.
    expect(control).toMatch(/publishShow\(cloneRundownGraphic\(item\.graphic\)/);
    expect(control).toMatch(/publishShow\(instance, \{ sourceType: 'quickQueue'/);
    expect(control.split('stampServiceContext(').length - 1).toBe(1);
  });

  it('nothing else publishes a SHOW_GRAPHIC', () => {
    // The stamp is only complete if this is the sole producer.
    const sources = readFileSync('src/app/OutputPage.tsx', 'utf8');
    expect(sources).not.toContain("createMessage('SHOW_GRAPHIC'");
  });
});

describe('one authority: what the operator sees is what goes to air', () => {
  it('uses the live service even when the device refuses to store it', () => {
    /**
     * Re-reading storage at Take would freeze 10:30 into the graphic while the
     * setup bar and the preview both showed 19:00 — silently, because a failed
     * write looks like nothing at all.
     */
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
      clear: () => undefined
    });
    resetServiceContextCache();
    setService('2026-08-10T19:00');
    expect(air(draft()).dynamicContext).toEqual({ eventDateTime: '2026-08-10T19:00' });
  });

  it('a reset drops the service, so the next Take captures nothing', () => {
    setService('2026-08-10T10:30');
    store.clear(); // what `clearAllData` does to the key...
    resetServiceContextCache(); // ...and what `clearLocalData` must do to the cache.
    expect(air(draft()).dynamicContext).toBeUndefined();
  });

  it('the reset path is actually wired to do that', () => {
    // The in-memory copy outliving a wipe is the same leak the Scripture draft
    // had; this is the line that closes it.
    const source = readFileSync('src/store/useLiveLayerStore.ts', 'utf8');
    expect(source).toMatch(/clearLocalData:[\s\S]*?resetServiceContextCache\(\)/);
  });
});

describe('Output reads the captured context, Preview reads the live one', () => {
  it('Output resolves from the graphic, structurally', () => {
    const output = readFileSync('src/app/OutputPage.tsx', 'utf8');
    expect(output).toMatch(/useDynamicValues\(\s*activeGraphic\?\.values[\s\S]*?activeGraphic\?\.dynamicContext/);
    // It must not reach for authoring state at all.
    expect(output).not.toMatch(/useServiceContext|loadServiceContext|getServiceContext/);
  });

  it('Preview resolves from the live service context', () => {
    const preview = readFileSync('src/components/templates/TemplatePreview.tsx', 'utf8');
    expect(preview).toContain('useServiceDynamicContext()');
  });
});

describe('the context survives the wire, and older messages still work', () => {
  const instance = (extra: Record<string, unknown> = {}) => ({
    id: 'g1', templateId: 'announcement-banner', values: { headline: 'x' }, theme: {},
    durationSeconds: 6, createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
    ...extra
  });
  const message = (payload: unknown) => JSON.stringify({ id: 'm1', type: 'SHOW_GRAPHIC', timestamp: 1, payload });

  it('carries the captured context across the relay', () => {
    const parsed = parseRealtimeMessage(JSON.parse(message(instance({ dynamicContext: { eventDateTime: '2026-08-10T10:30' } }))));
    expect((parsed?.payload as { dynamicContext?: unknown })?.dynamicContext).toEqual({ eventDateTime: '2026-08-10T10:30' });
  });

  it('accepts a graphic authored before service context existed', () => {
    expect(parseRealtimeMessage(JSON.parse(message(instance())))).not.toBeNull();
  });

  it('rejects a malformed context rather than coercing it', () => {
    // A bad datetime reaching Output renders as garbage on air.
    for (const bad of [{ eventDateTime: 5 }, [], 'x']) {
      expect(parseRealtimeMessage(JSON.parse(message(instance({ dynamicContext: bad })))), JSON.stringify(bad)).toBeNull();
    }
  });
});
