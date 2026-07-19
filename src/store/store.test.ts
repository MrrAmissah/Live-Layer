import { beforeEach, describe, expect, it } from 'vitest';
import { useLiveLayerStore } from './useLiveLayerStore';
import { CLEAR_PROGRAM_STATE } from '../types/program';
import type { GraphicInstance, QuickQueueItem } from '../types/graphics';

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
  useLiveLayerStore.setState({ program: { ...CLEAR_PROGRAM_STATE }, quickQueue: [] });
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

  it('Clear resets to clear with a clearedAt and no snapshot', () => {
    store().markProgramShowing({ snapshot: makeInstance('g'), commandId: 'c', source: { sourceType: 'draft', sourceId: null } });
    store().markProgramClear();
    const p = store().program;
    expect(p.status).toBe('clear');
    expect(p.instanceId).toBeNull();
    expect(p.snapshot).toBeNull();
    expect(typeof p.clearedAt).toBe('number');
  });

  it('publish failure marks failed and never confirmed', () => {
    store().markProgramFailed({ snapshot: makeInstance('g-fail'), commandId: 'c-fail' });
    const p = store().program;
    expect(p.status).toBe('failed');
    expect(p.confirmation).toBe('unconfirmed');
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
