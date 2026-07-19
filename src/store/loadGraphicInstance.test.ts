import { beforeEach, describe, expect, it } from 'vitest';
import { useLiveLayerStore } from './useLiveLayerStore';
import { CLEAR_PROGRAM_STATE } from '../types/program';
import type { QuickQueueItem } from '../types/graphics';

/**
 * The store half of the queue "Edit" route: loading a queue entry into the
 * editor must populate the draft while leaving Program and the stored queue
 * entry untouched. The view switch itself lives in ControlPage and is covered
 * by the browser walkthrough.
 */
function makeQueueItem(id: string): QuickQueueItem {
  return {
    id,
    templateId: 'preacher-lower-third',
    presetName: 'Queued speaker',
    values: { name: 'Rev. Queue Entry', title: 'Guest Minister' },
    theme: {},
    layout: {},
    durationSeconds: 9,
    revision: 3,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z'
  };
}

const store = () => useLiveLayerStore.getState();

beforeEach(() => {
  useLiveLayerStore.setState({ program: { ...CLEAR_PROGRAM_STATE }, quickQueue: [] });
});

describe('loadGraphicInstance — queue Edit routing', () => {
  it('loads the entry into the editable draft', () => {
    const item = makeQueueItem('q-edit-1');
    useLiveLayerStore.setState({ quickQueue: [item] });
    store().loadGraphicInstance(item);
    expect(store().currentTemplateId).toBe('preacher-lower-third');
    expect(store().draftValues.name).toBe('Rev. Queue Entry');
    expect(store().draftValues.title).toBe('Guest Minister');
  });

  it('does not change Program state', () => {
    const item = makeQueueItem('q-edit-2');
    useLiveLayerStore.setState({ quickQueue: [item] });
    const before = store().program;
    store().loadGraphicInstance(item);
    expect(store().program).toBe(before); // untouched reference
    expect(store().program.status).toBe('clear');
  });

  it('leaves the stored queue entry unchanged, including its revision', () => {
    const item = makeQueueItem('q-edit-3');
    useLiveLayerStore.setState({ quickQueue: [item] });
    store().loadGraphicInstance(item);
    const [stored] = store().quickQueue;
    expect(stored.id).toBe('q-edit-3');
    expect(stored.revision).toBe(3);
    expect(stored.values.name).toBe('Rev. Queue Entry');
  });

  it('editing the draft afterwards does not mutate the queued entry', () => {
    const item = makeQueueItem('q-edit-4');
    useLiveLayerStore.setState({ quickQueue: [item] });
    store().loadGraphicInstance(item);
    store().setField('name', 'Edited in the editor');
    expect(store().quickQueue[0].values.name).toBe('Rev. Queue Entry');
  });
});
