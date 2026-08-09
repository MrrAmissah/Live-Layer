import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORKING_DRAFT_KEY, WORKING_DRAFT_VERSION } from '../lib/workingDraft';
import { templateRegistry } from '../components/templates/registry';
import { CLEAR_PROGRAM_STATE } from '../types/program';
import type { GraphicInstance } from '../types/graphics';

/**
 * Hydration, at the only moment it actually happens: while the store's initial
 * state is being built.
 *
 * That is why every case here re-imports the module with `vi.resetModules()`
 * instead of calling a setter on the live singleton. Testing hydration on an
 * already-created store would test a function, not the behaviour an operator
 * gets from a refresh — and the defect this fixes lives precisely in what the
 * store looks like at its first render.
 *
 * The three states stay separate, and the hard direction is asserted here: a
 * restored draft must not touch Program, and Program must never become the
 * draft. Not loading the on-air graphic into the editor is correct behaviour.
 */

const TEMPLATE = 'preacher-lower-third';
const OTHER_TEMPLATE = 'scripture-card';

function makeSessionStorage(seed?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  // Counted, not just observed: "the record ended up correct" is true whether
  // the store wrote once or once per keystroke, so only a count can hold the
  // debounce honest.
  const counter = { writes: 0 };
  return {
    map,
    counter,
    api: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        counter.writes += 1;
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
      clear: () => map.clear()
    }
  };
}

function makeLocalStorage(seed?: Record<string, string>) {
  return makeSessionStorage(seed);
}

function record(draft: unknown, version: unknown = WORKING_DRAFT_VERSION) {
  return JSON.stringify({ version, draft });
}

function fullDraft(overrides: Record<string, unknown> = {}) {
  return {
    templateId: TEMPLATE,
    values: { name: 'Rev. Ama Mensah', title: 'Guest Speaker' },
    theme: { primaryColor: '#f8fafc', accentColor: '#E8B93C', backgroundColor: 'transparent' },
    layout: { size: 'large', position: 'center' },
    durationSeconds: 12,
    ...overrides
  };
}

/**
 * A store built from scratch against the given storage — one simulated control
 * client, one page load.
 */
async function bootStore(options: { session?: Record<string, string>; local?: Record<string, string> } = {}) {
  vi.resetModules();
  const session = makeSessionStorage(options.session);
  const local = makeLocalStorage(options.local);
  vi.stubGlobal('sessionStorage', session.api);
  vi.stubGlobal('localStorage', local.api);
  const module = await import('./useLiveLayerStore');
  return { store: module.useLiveLayerStore, writer: module.workingDraftWriter, session, local };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('restoring what the operator was preparing', () => {
  it('restores the exact template, not the pack default', () => {
    // The reported defect in one assertion: prepare on a non-default template,
    // refresh, and be handed a different template with Take right there.
    expect(templateRegistry[0].id).not.toBe(OTHER_TEMPLATE); // guard: a real difference
    return bootStore({ session: { [WORKING_DRAFT_KEY]: record(fullDraft({ templateId: OTHER_TEMPLATE })) } }).then(
      ({ store }) => {
        expect(store.getState().currentTemplateId).toBe(OTHER_TEMPLATE);
      }
    );
  });

  it('restores the values', async () => {
    const { store } = await bootStore({ session: { [WORKING_DRAFT_KEY]: record(fullDraft()) } });
    expect(store.getState().draftValues).toEqual({ name: 'Rev. Ama Mensah', title: 'Guest Speaker' });
  });

  it('restores the layout', async () => {
    const { store } = await bootStore({ session: { [WORKING_DRAFT_KEY]: record(fullDraft()) } });
    expect(store.getState().layout).toEqual({ size: 'large', position: 'center' });
  });

  it('restores the duration', async () => {
    const { store } = await bootStore({ session: { [WORKING_DRAFT_KEY]: record(fullDraft()) } });
    expect(store.getState().durationSeconds).toBe(12);
  });

  it('restores the graphic theme WITHOUT redefining the brand default', async () => {
    /**
     * The draft theme is the current graphic's, exactly as a loaded preset's is.
     * If restoring it also moved brandTheme, every graphic made afterwards would
     * silently inherit the colour of whatever happened to be in the editor when
     * the page was last refreshed.
     */
    const { store } = await bootStore({
      session: {
        [WORKING_DRAFT_KEY]: record(
          fullDraft({ theme: { primaryColor: '#ffffff', accentColor: '#E8B93C', backgroundColor: 'transparent' } })
        )
      },
      local: { 'livelayer.brand': JSON.stringify({ accentColor: '#0d2095' }) }
    });
    const state = store.getState();
    expect(state.theme.accentColor).toBe('#E8B93C');
    expect(state.brandTheme.accentColor).toBe('#0d2095');
    expect(state.explicitBrandKeys).toEqual([]);
  });
});

describe('falling back to the seed', () => {
  const seeded = async (session: Record<string, string> | undefined) => {
    const { store } = await bootStore({ session });
    return store.getState();
  };

  it('seeds when nothing is stored', async () => {
    const state = await seeded(undefined);
    expect(state.currentTemplateId).toBe(templateRegistry[0].id);
    expect(Object.keys(state.draftValues).length).toBeGreaterThan(0);
  });

  it('seeds on corrupt JSON', async () => {
    const state = await seeded({ [WORKING_DRAFT_KEY]: '{"version":1,"draft":{' });
    expect(state.currentTemplateId).toBe(templateRegistry[0].id);
  });

  it('seeds on an unsupported schema version', async () => {
    const state = await seeded({ [WORKING_DRAFT_KEY]: record(fullDraft(), 99) });
    expect(state.currentTemplateId).toBe(templateRegistry[0].id);
  });

  it('seeds on a template this build does not have', async () => {
    const state = await seeded({ [WORKING_DRAFT_KEY]: record(fullDraft({ templateId: 'no-such-template' })) });
    expect(state.currentTemplateId).toBe(templateRegistry[0].id);
  });

  it('seeds on an invalid layout, rather than restoring the good half', async () => {
    /**
     * The anti-partial-trust rule, asserted against the seed itself rather than
     * against absence: the record's template and values are perfectly valid, so
     * "restore what we can" would have produced the operator's name here. The
     * result must instead be indistinguishable from having no record at all.
     */
    const pureSeed = await seeded(undefined);
    const state = await seeded({ [WORKING_DRAFT_KEY]: record(fullDraft({ layout: { size: 'enormous' } })) });

    expect(state.currentTemplateId).toBe(templateRegistry[0].id);
    expect(state.draftValues.name).not.toBe('Rev. Ama Mensah');
    expect(state.draftValues).toEqual(pureSeed.draftValues);
    expect(state.layout).toEqual({});
    expect(state.durationSeconds).toBe(pureSeed.durationSeconds);
  });

  it('seeds on an invalid duration', async () => {
    const state = await seeded({ [WORKING_DRAFT_KEY]: record(fullDraft({ durationSeconds: -3 })) });
    expect(state.currentTemplateId).toBe(templateRegistry[0].id);
    expect(state.durationSeconds).toBeGreaterThan(0);
  });
});

describe('hydration cannot touch Program', () => {
  const programRecord = (snapshot: GraphicInstance) =>
    JSON.stringify({ status: 'showing', snapshot, commandId: 'cmd-9', instanceId: snapshot.id, takenAt: 1 });

  const onAir: GraphicInstance = {
    id: 'g-on-air',
    templateId: OTHER_TEMPLATE,
    values: { reference: 'Psalm 23:1', body: 'The Lord is my shepherd' },
    theme: { primaryColor: '#fff', accentColor: '#000', backgroundColor: 'transparent' },
    durationSeconds: 0,
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z'
  };

  it('restores Program and the draft independently, and neither becomes the other', async () => {
    const { store } = await bootStore({
      session: { [WORKING_DRAFT_KEY]: record(fullDraft()) },
      local: { 'livelayer.program': programRecord(onAir) }
    });
    const state = store.getState();

    // Program came back on its own terms (a reload cannot confirm output).
    expect(state.program.status).toBe('recovering');
    expect(state.program.snapshot?.id).toBe('g-on-air');
    // ...and the editor is what the operator was PREPARING, not what is on air.
    expect(state.currentTemplateId).toBe(TEMPLATE);
    expect(state.draftValues).toEqual({ name: 'Rev. Ama Mensah', title: 'Guest Speaker' });
  });

  it('never turns the Program snapshot into the working draft', async () => {
    // No stored draft at all: the editor seeds. It must NOT helpfully load the
    // graphic that is on air — Program and Preview stay separate.
    const { store } = await bootStore({ local: { 'livelayer.program': programRecord(onAir) } });
    const state = store.getState();
    expect(state.program.snapshot?.id).toBe('g-on-air');
    expect(state.currentTemplateId).toBe(templateRegistry[0].id);
    expect(state.draftValues.reference).toBeUndefined();
    expect(state.draftValues.body).toBeUndefined();
  });

  it('leaves outputStatus and pending acks alone', async () => {
    const { store } = await bootStore({ session: { [WORKING_DRAFT_KEY]: record(fullDraft()) } });
    const state = store.getState();
    expect(state.outputStatus).toBeNull();
    expect(state.pendingOutputAcks).toEqual([]);
  });

  it('a restored draft does not write Program storage', async () => {
    const { store, local } = await bootStore({ session: { [WORKING_DRAFT_KEY]: record(fullDraft()) } });
    expect(store.getState().currentTemplateId).toBe(TEMPLATE); // hydration happened
    expect(local.map.has('livelayer.program')).toBe(false);
  });
});

describe('realtime traffic cannot move the draft', () => {
  it('remote commands and output acks leave the working draft untouched', async () => {
    const { store } = await bootStore({ session: { [WORKING_DRAFT_KEY]: record(fullDraft()) } });
    const before = store.getState();

    store.getState().applyRealtimeMessage({
      id: 'm-1',
      type: 'SHOW_GRAPHIC',
      timestamp: Date.now(),
      payload: {
        id: 'remote-graphic',
        templateId: OTHER_TEMPLATE,
        values: { reference: 'Romans 8:28' },
        theme: { primaryColor: '#fff', accentColor: '#000', backgroundColor: 'transparent' },
        durationSeconds: 5,
        createdAt: '2026-08-09T00:00:00.000Z',
        updatedAt: '2026-08-09T00:00:00.000Z'
      }
    } as never);
    store.getState().applyRealtimeMessage({
      id: 'm-2',
      type: 'OUTPUT_STATUS',
      timestamp: Date.now(),
      payload: { outputId: 'out-1', sourceActive: true, sourceVisible: true }
    } as never);

    const after = store.getState();
    expect(after.currentTemplateId).toBe(before.currentTemplateId);
    expect(after.draftValues).toBe(before.draftValues); // same reference: no write at all
    expect(after.theme).toBe(before.theme);
    expect(after.layout).toBe(before.layout);
    expect(after.durationSeconds).toBe(before.durationSeconds);
  });
});

describe('persisting what the operator does next', () => {
  it('persists an edit, once, after the debounce', async () => {
    vi.useFakeTimers();
    const { store, session } = await bootStore();
    store.getState().setField('name', 'Rev. Ama');
    store.getState().setField('name', 'Rev. Ama Mensah');
    expect(session.map.has(WORKING_DRAFT_KEY)).toBe(false); // nothing mid-burst

    vi.advanceTimersByTime(500);
    const stored = JSON.parse(session.map.get(WORKING_DRAFT_KEY) ?? '{}');
    expect(stored.version).toBe(WORKING_DRAFT_VERSION);
    expect(stored.draft.values.name).toBe('Rev. Ama Mensah');
  });

  it('coalesces a name typed at human speed into ONE storage write', async () => {
    /**
     * The keystrokes are spaced by a realistic typing cadence rather than fired
     * back-to-back, because a burst inside a single tick is coalesced by any
     * delay at all — including a zero one, which would still write once per
     * keystroke in a real browser. Counting writes across spaced edits is what
     * pins the store to an actual debounce window.
     */
    vi.useFakeTimers();
    const { store, session } = await bootStore();

    for (const name of ['R', 'Re', 'Rev', 'Rev.', 'Rev. A']) {
      store.getState().setField('name', name);
      vi.advanceTimersByTime(60); // ~16 characters a second, inside one window
    }
    expect(session.counter.writes).toBe(0); // still nothing, mid-word

    vi.advanceTimersByTime(500);
    expect(session.counter.writes).toBe(1);
    expect(JSON.parse(session.map.get(WORKING_DRAFT_KEY) ?? '{}').draft.values.name).toBe('Rev. A');
  });

  it('keeps writing at a bounded cadence while typing continues, rather than waiting for a pause', async () => {
    /**
     * The window opens on the first change and is NOT restarted by later ones.
     * A true trailing debounce would write nothing at all while an operator
     * typed a long verse without pausing, and a refresh mid-sentence would lose
     * the lot. This bounds the loss to one window instead — and still costs far
     * fewer writes than one per keystroke, which is the point of debouncing.
     */
    vi.useFakeTimers();
    const { store, session } = await bootStore();

    for (let index = 0; index < 40; index += 1) {
      store.getState().setField('body', 'x'.repeat(index + 1));
      vi.advanceTimersByTime(60); // 2.4 seconds of unbroken typing
    }
    vi.advanceTimersByTime(500);

    expect(session.counter.writes).toBeGreaterThan(1); // it did not wait for a pause
    expect(session.counter.writes).toBeLessThanOrEqual(8); // ~one per 400ms window, not 40
    expect(JSON.parse(session.map.get(WORKING_DRAFT_KEY) ?? '{}').draft.values.body).toBe('x'.repeat(40));
  });

  it('an explicit template choice after hydration replaces the restored draft', async () => {
    // Contract: the library must not silently replace a restored draft on mount,
    // but an explicit choice still starts a new graphic, as it always has.
    vi.useFakeTimers();
    const { store, session } = await bootStore({ session: { [WORKING_DRAFT_KEY]: record(fullDraft()) } });
    expect(store.getState().currentTemplateId).toBe(TEMPLATE);

    store.getState().setTemplate(OTHER_TEMPLATE);
    vi.advanceTimersByTime(500);

    expect(store.getState().currentTemplateId).toBe(OTHER_TEMPLATE);
    expect(store.getState().draftValues.name).toBeUndefined();
    expect(JSON.parse(session.map.get(WORKING_DRAFT_KEY) ?? '{}').draft.templateId).toBe(OTHER_TEMPLATE);
  });

  it('persists the draft a loaded preset produces', async () => {
    vi.useFakeTimers();
    const { store, session } = await bootStore();
    store.getState().loadGraphicInstance({
      id: 'preset-1',
      templateId: OTHER_TEMPLATE,
      presetName: 'Opening verse',
      values: { reference: 'John 1:1', body: 'In the beginning was the Word' },
      theme: { primaryColor: '#ffffff', accentColor: '#E8B93C', backgroundColor: 'transparent' },
      layout: { size: 'small' },
      durationSeconds: 9,
      createdAt: '2026-08-09T00:00:00.000Z',
      updatedAt: '2026-08-09T00:00:00.000Z'
    });
    vi.advanceTimersByTime(500);

    const stored = JSON.parse(session.map.get(WORKING_DRAFT_KEY) ?? '{}').draft;
    expect(stored.templateId).toBe(OTHER_TEMPLATE);
    expect(stored.values.reference).toBe('John 1:1');
    expect(stored.layout).toEqual({ size: 'small' });
    expect(stored.durationSeconds).toBe(9);
    // ...and it is still not a brand decision.
    expect(store.getState().brandTheme.accentColor).not.toBe('#E8B93C');
  });

  it('persists a pack switch and a layout change', async () => {
    vi.useFakeTimers();
    const { store, session } = await bootStore();
    store.getState().setLayout({ density: 'bold' });
    vi.advanceTimersByTime(500);
    expect(JSON.parse(session.map.get(WORKING_DRAFT_KEY) ?? '{}').draft.layout).toEqual({ density: 'bold' });

    store.getState().setActivePack('house');
    vi.advanceTimersByTime(500);
    expect(session.map.has(WORKING_DRAFT_KEY)).toBe(true);
  });

  it('does not write on Program traffic alone', async () => {
    vi.useFakeTimers();
    const { store, session } = await bootStore();
    store.getState().markProgramShowing({
      snapshot: {
        id: 'g-1',
        templateId: TEMPLATE,
        values: {},
        theme: { primaryColor: '#fff', accentColor: '#000', backgroundColor: 'transparent' },
        durationSeconds: 0,
        createdAt: '2026-08-09T00:00:00.000Z',
        updatedAt: '2026-08-09T00:00:00.000Z'
      },
      commandId: 'cmd-1',
      source: { sourceType: 'draft', sourceId: null }
    });
    vi.advanceTimersByTime(500);
    expect(session.map.has(WORKING_DRAFT_KEY)).toBe(false);
  });
});

describe('reset all local data', () => {
  it('removes the persisted draft and does not let a pending write resurrect it', async () => {
    /**
     * The race worth naming: `setState` notifies subscribers synchronously, so
     * the reset's own fresh default is scheduled for writing before
     * `clearLocalData` returns. Without the cancel, that write lands a moment
     * later and re-creates the record the reset just removed.
     */
    vi.useFakeTimers();
    const { store, session } = await bootStore();
    store.getState().setField('name', 'Rev. Ama Mensah');
    vi.advanceTimersByTime(500);
    expect(session.map.has(WORKING_DRAFT_KEY)).toBe(true);

    store.getState().clearLocalData();
    expect(session.map.has(WORKING_DRAFT_KEY)).toBe(false);

    vi.advanceTimersByTime(2000); // any pending write would land in here
    expect(session.map.has(WORKING_DRAFT_KEY)).toBe(false);
  });

  it('returns the in-memory editor to the clean default', async () => {
    const { store } = await bootStore({
      session: { [WORKING_DRAFT_KEY]: record(fullDraft({ templateId: OTHER_TEMPLATE })) }
    });
    expect(store.getState().currentTemplateId).toBe(OTHER_TEMPLATE);

    store.getState().clearLocalData();
    const state = store.getState();
    expect(state.currentTemplateId).toBe(templateRegistry[0].id);
    expect(state.layout).toEqual({});
    expect(state.activePackId).toBe('house');
    expect(state.program).toEqual({ ...CLEAR_PROGRAM_STATE });
  });

  it('a flush after reset still writes nothing', async () => {
    vi.useFakeTimers();
    const { store, session, writer } = await bootStore();
    store.getState().setField('name', 'typed');
    store.getState().clearLocalData();
    writer.flush(); // what the pagehide listener does
    vi.advanceTimersByTime(2000);
    expect(session.map.has(WORKING_DRAFT_KEY)).toBe(false);
  });
});
