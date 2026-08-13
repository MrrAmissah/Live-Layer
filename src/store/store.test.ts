import { beforeEach, describe, expect, it } from 'vitest';
import { useLiveLayerStore } from './useLiveLayerStore';
import { CLEAR_PROGRAM_STATE } from '../types/program';
import type { GraphicInstance, QuickQueueItem } from '../types/graphics';
import { templateRegistry } from '../components/templates/registry';

function makeInstance(id: string, values: Record<string, string> = {}): GraphicInstance {
  return {
    id,
    templateId: 'preacher-lower-third',
    values: { name: 'Rev. Test', ...values },
    theme: {},
    durationSeconds: 0,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z'
  };
}
function makeQueueItem(id: string, revision = 1): QuickQueueItem {
  return { ...makeInstance(id), revision };
}

beforeEach(() => {
  // Reset only the slices these tests touch, leaving the singleton otherwise intact.
  useLiveLayerStore.setState({
    program: { ...CLEAR_PROGRAM_STATE },
    quickQueue: [],
    outputs: {},
    pendingOutputAcks: []
  });
});

const store = () => useLiveLayerStore.getState();

describe('program state — Take / Clear / Fail', () => {
  it('records a draft Take as showing + unconfirmed with identity', () => {
    const snap = makeInstance('g-take');
    store().markProgramShowing({ snapshot: snap, commandId: 'cmd-1', source: { sourceType: 'draft', sourceId: null } });
    const p = store().program;
    expect(p.status).toBe('showing');
    expect(p.confirmation).toBe('unconfirmed'); // never a confident live from a publish alone
    expect(p.instanceId).toBe('g-take');
    expect(p.templateId).toBe('preacher-lower-third');
    expect(p.commandId).toBe('cmd-1');
    expect(p.sourceType).toBe('draft');
    expect(typeof p.takenAt).toBe('number');
    expect(p.clearedAt).toBeNull();
  });

  it('records a quick-queue Take with the originating item id as source', () => {
    store().markProgramShowing({
      snapshot: makeInstance('g-fresh'),
      commandId: 'cmd-2',
      source: { sourceType: 'quickQueue', sourceId: 'q-original' }
    });
    expect(store().program.sourceType).toBe('quickQueue');
    expect(store().program.sourceId).toBe('q-original');
  });

  it('Clear is pending (clearing) until the matching OUTPUT_CLEARED arrives', () => {
    store().markProgramShowing({ snapshot: makeInstance('g'), commandId: 'c', source: { sourceType: 'draft', sourceId: null } });
    store().markProgramClearing({ commandId: 'clear-1' });
    let p = store().program;
    // A published clear is a command like any other: the previous graphic may
    // still be on air, so Program may not claim empty yet.
    expect(p.status).toBe('clearing');
    expect(p.commandId).toBe('clear-1');
    expect(p.snapshot).not.toBeNull(); // kept for "Last sent" wording
    // Only the acknowledgement for THIS clear settles it.
    store().applyRealtimeMessage({
      id: 'ack-1',
      type: 'OUTPUT_CLEARED',
      payload: { commandId: 'clear-1', outputId: 'out-1' },
      timestamp: Date.now()
    });
    p = store().program;
    expect(p.status).toBe('clear');
    expect(p.instanceId).toBeNull();
    expect(p.snapshot).toBeNull();
    expect(typeof p.clearedAt).toBe('number');
  });

  it('an OUTPUT_CLEARED that beats markProgramClearing still settles the clear (ack-before-mark race)', () => {
    // Same-browser output acknowledges over BroadcastChannel before the relay
    // answers the publish POST — the ack arrives while Program still tracks
    // the SHOW. It must be buffered and consumed when the clear is recorded.
    store().markProgramShowing({ snapshot: makeInstance('g'), commandId: 'cmd-A', source: { sourceType: 'draft', sourceId: null } });
    store().applyRealtimeMessage({
      id: 'ack-early',
      type: 'OUTPUT_CLEARED',
      payload: { commandId: 'clear-1', outputId: 'out-1' },
      timestamp: Date.now()
    });
    expect(store().program.status).toBe('showing'); // refused now…
    store().markProgramClearing({ commandId: 'clear-1' });
    expect(store().program.status).toBe('clear'); // …consumed at mark time
  });

  it('an OUTPUT_APPLIED that beats markProgramShowing still confirms the Take', () => {
    store().applyRealtimeMessage({
      id: 'ack-early-2',
      type: 'OUTPUT_APPLIED',
      payload: { commandId: 'cmd-B', outputId: 'out-1', graphicId: 'g-b' },
      timestamp: Date.now()
    });
    store().markProgramShowing({ snapshot: makeInstance('g-b'), commandId: 'cmd-B', source: { sourceType: 'draft', sourceId: null } });
    expect(store().program.status).toBe('showing');
    expect(store().program.confirmation).toBe('confirmed');
  });

  it('clearing an already-clear Program stays clear instead of pending forever', () => {
    // With no output page open, a pending state over an empty air would never
    // resolve — an idle operator pressing Clear must still read "Ready".
    store().markProgramClearing({ commandId: 'clear-idle' });
    expect(store().program.status).toBe('clear');
    expect(typeof store().program.clearedAt).toBe('number');
  });

  it('publish failure marks failed and never confirmed', () => {
    store().markProgramFailed({ snapshot: makeInstance('g-fail'), commandId: 'c-fail' });
    const p = store().program;
    expect(p.status).toBe('failed');
    expect(p.confirmation).toBe('unconfirmed');
  });

  it('failed record never inherits source metadata from a previous Take', () => {
    // A successful quick-queue Take, then a later failed draft Take.
    store().markProgramShowing({
      snapshot: makeInstance('g-old'),
      commandId: 'cmd-old',
      source: { sourceType: 'quickQueue', sourceId: 'q-previous' }
    });
    store().markProgramFailed({
      snapshot: makeInstance('g-new'),
      commandId: 'cmd-new',
      source: { sourceType: 'draft', sourceId: null }
    });
    const p = store().program;
    expect(p.status).toBe('failed');
    expect(p.instanceId).toBe('g-new');
    expect(p.commandId).toBe('cmd-new');
    // The stale quickQueue source must not survive — it would wrongly mark the
    // old queue row as the failed command's origin.
    expect(p.sourceType).toBe('draft');
    expect(p.sourceId).toBeNull();
    expect(p.takenAt).toBeNull(); // nothing went to air
    expect(p.clearedAt).toBeNull();
  });

  it('failed record with no attempted source clears source fields deliberately', () => {
    store().markProgramShowing({
      snapshot: makeInstance('g-old'),
      commandId: 'cmd-old',
      source: { sourceType: 'rundown', sourceId: 'r-7' }
    });
    store().markProgramFailed();
    const p = store().program;
    expect(p.sourceType).toBeNull();
    expect(p.sourceId).toBeNull();
    expect(p.snapshot).toBeNull();
  });

  it('does not mutate the Program snapshot when the source instance is mutated later', () => {
    const snap = makeInstance('g-immut', { name: 'Original' });
    store().markProgramShowing({ snapshot: snap, commandId: 'c', source: { sourceType: 'draft', sourceId: null } });
    snap.values.name = 'Mutated after take';
    expect(store().program.snapshot?.values.name).toBe('Original');
  });
});

describe('preview-only invariant', () => {
  it('setField never changes Program', () => {
    store().markProgramShowing({ snapshot: makeInstance('g'), commandId: 'c', source: { sourceType: 'draft', sourceId: null } });
    const before = store().program;
    store().setField('name', 'Typed while live');
    expect(store().program).toBe(before); // untouched reference
  });
});

describe('draft variant selection (Design tab)', () => {
  it('merges the selected variant palette into the draft and keeps other fields', () => {
    const template = templateRegistry.find((t) => t.id === 'preacher-lower-third')!;
    const variant = template.variants!.find((v) => v.palette && Object.keys(v.palette).length > 0)!;
    store().setTemplate('preacher-lower-third');
    store().setField('name', 'Rev. Draft');
    store().setField('variantId', variant.id);
    const draft = store().draftValues;
    expect(draft.variantId).toBe(variant.id);
    for (const [k, v] of Object.entries(variant.palette!)) {
      expect(draft[k]).toBe(v);
    }
    expect(draft.name).toBe('Rev. Draft'); // content preserved through the palette merge
  });
});

describe('quick queue — reorder + update', () => {
  it('keeps item ids and count stable across reorder', () => {
    useLiveLayerStore.setState({ quickQueue: [makeQueueItem('q-a'), makeQueueItem('q-b'), makeQueueItem('q-c')] });
    store().moveInQuickQueue('q-c', -1);
    const ids = store().quickQueue.map((i) => i.id);
    expect(ids).toEqual(['q-a', 'q-c', 'q-b']);
    expect(store().quickQueue).toHaveLength(3);
  });

  it('updateQuickQueueItem changes only the target and bumps revision exactly once', () => {
    const a = makeQueueItem('q-a', 1);
    const b = makeQueueItem('q-b', 1);
    useLiveLayerStore.setState({ quickQueue: [a, b] });
    const result = store().updateQuickQueueItem({ id: 'q-a', expectedRevision: 1, values: { name: 'Edited A' } });
    expect(result.ok).toBe(true);
    const [na, nb] = store().quickQueue;
    expect(na.values.name).toBe('Edited A');
    expect(na.revision).toBe(2);
    expect(nb).toBe(b); // sibling identity untouched
  });

  it('rejects a stale update without changing state', () => {
    useLiveLayerStore.setState({ quickQueue: [makeQueueItem('q-a', 3)] });
    const snapshotBefore = store().quickQueue;
    const result = store().updateQuickQueueItem({ id: 'q-a', expectedRevision: 1, values: { name: 'Nope' } });
    expect(result).toEqual({ ok: false, reason: 'stale', current: snapshotBefore[0] });
    expect(store().quickQueue).toBe(snapshotBefore); // no mutation
  });

  it('returns not-found for an unknown id', () => {
    const result = store().updateQuickQueueItem({ id: 'missing', expectedRevision: 1 });
    expect(result).toEqual({ ok: false, reason: 'not-found' });
  });

  it('updateQuickQueueItem never touches Program (Save to Queue Item)', () => {
    store().markProgramShowing({ snapshot: makeInstance('g'), commandId: 'c', source: { sourceType: 'draft', sourceId: null } });
    useLiveLayerStore.setState({ quickQueue: [makeQueueItem('q-a', 1)] });
    const programBefore = store().program;
    store().updateQuickQueueItem({ id: 'q-a', expectedRevision: 1, values: { name: 'x' } });
    expect(store().program).toBe(programBefore);
  });
});
