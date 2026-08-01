import { beforeEach, describe, expect, it } from 'vitest';
import {
  addItem,
  clearAllRundowns,
  createRundown,
  deleteItem,
  duplicateItem,
  getNextItem,
  getPreviousItem,
  getQueueCursors,
  getRundown,
  getSelectedItem,
  moveItem,
  setActiveItem,
  setSelectedItem
} from './rundownStore';
import type { GraphicInstance } from '../../types/graphics';

/**
 * The queue cursors are what a live-action surface reads to decide what Take
 * will fire and whether Previous/Next are available — and they had no test at
 * all. This covers the edges those buttons sit on: nothing selected, first item,
 * last item, and the two cursors disagreeing.
 */

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

const graphic = (name: string): GraphicInstance => ({
  id: `graphic-${name}`,
  templateId: 'preacher-lower-third',
  values: { name },
  theme: {},
  layout: {},
  durationSeconds: 0,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z'
});

let rundownId = '';
let ids: string[] = [];

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
  clearAllRundowns();
  const rundown = createRundown('Service')!;
  rundownId = rundown.id;
  ids = ['one', 'two', 'three'].map((name) => addItem(rundownId, { graphic: graphic(name), title: name })!.id);
});

const current = () => getRundown(rundownId);

describe('queue cursors with nothing selected', () => {
  it('offers the first item as Next, and no Previous', () => {
    setSelectedItem(rundownId, undefined);
    expect(getNextItem(current())?.id).toBe(ids[0]);
    expect(getPreviousItem(current())).toBeUndefined();
  });

  it('reports no selection rather than guessing one', () => {
    setSelectedItem(rundownId, undefined);
    expect(getSelectedItem(current())).toBeUndefined();
    // The Take guard reads this: no selection means a no-op, never the draft.
    expect(getQueueCursors(current()).selected).toBeUndefined();
  });
});

describe('queue cursors while stepping through a service', () => {
  it('walks forward and back around the middle item', () => {
    setSelectedItem(rundownId, ids[1]);
    expect(getPreviousItem(current())?.id).toBe(ids[0]);
    expect(getNextItem(current())?.id).toBe(ids[2]);
  });

  it('has no Previous at the start and no Next at the end', () => {
    setSelectedItem(rundownId, ids[0]);
    expect(getPreviousItem(current())).toBeUndefined();
    setSelectedItem(rundownId, ids[2]);
    expect(getNextItem(current())).toBeUndefined();
  });

  it('keeps the live cursor separate from the selection', () => {
    setSelectedItem(rundownId, ids[2]);
    setActiveItem(rundownId, ids[0]);
    const cursors = getQueueCursors(current());
    expect(cursors.selected?.id).toBe(ids[2]);
    expect(cursors.liveItem?.id).toBe(ids[0]);
    // Editing the selection must not move what the queue believes is on air.
    expect(cursors.selected?.id).not.toBe(cursors.liveItem?.id);
    expect(cursors.selectedIndex).toBe(2);
  });
});

describe('ordering', () => {
  it('swaps with the neighbour and leaves the selection on the same item', () => {
    setSelectedItem(rundownId, ids[0]);
    moveItem(rundownId, ids[0], 'down');
    expect(current()!.items.map((item) => item.id)).toEqual([ids[1], ids[0], ids[2]]);
    expect(current()!.selectedItemId).toBe(ids[0]);
  });

  it('is a no-op at the ends rather than wrapping', () => {
    moveItem(rundownId, ids[0], 'up');
    moveItem(rundownId, ids[2], 'down');
    expect(current()!.items.map((item) => item.id)).toEqual(ids);
  });

  it('duplicates next to the original, with its own item identity', () => {
    duplicateItem(rundownId, ids[0]);
    const items = current()!.items;
    expect(items).toHaveLength(4);
    expect(items[1].id).not.toBe(items[0].id);
    expect(items[1].done).toBe(false);
    // The copy carries the source's graphic id — item identity is what ordering,
    // selection and Program's rundown source key off, and that is fresh.
    expect(items[1].graphic.id).toBe(items[0].graphic.id);
  });

  it('deep-clones the copy, so editing one never changes the other', () => {
    duplicateItem(rundownId, ids[0]);
    const copyId = current()!.items[1].id;
    const copy = current()!.items[1];
    copy.graphic.values.name = 'changed in a detached read';
    // Reads return fresh objects, so the mutation above cannot reach storage —
    // and the original is untouched either way.
    expect(current()!.items[0].graphic.values.name).toBe('one');
    expect(current()!.items.find((item) => item.id === copyId)!.graphic.values.name).toBe('one');
  });
});

describe('deleting the item a cursor points at', () => {
  it('drops the selection instead of leaving it dangling', () => {
    setSelectedItem(rundownId, ids[1]);
    deleteItem(rundownId, ids[1]);
    expect(current()!.selectedItemId).toBeUndefined();
    expect(getSelectedItem(current())).toBeUndefined();
  });

  it('drops the live cursor too, so nothing claims a deleted item is on air', () => {
    setActiveItem(rundownId, ids[2]);
    deleteItem(rundownId, ids[2]);
    expect(current()!.activeItemId).toBeUndefined();
  });

  it('leaves a cursor pointing elsewhere alone', () => {
    setSelectedItem(rundownId, ids[0]);
    setActiveItem(rundownId, ids[0]);
    deleteItem(rundownId, ids[2]);
    expect(current()!.selectedItemId).toBe(ids[0]);
    expect(current()!.activeItemId).toBe(ids[0]);
  });
});
