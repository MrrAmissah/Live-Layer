import { describe, expect, it, beforeEach } from 'vitest';
import { planTakeNext, describeTakeNextCue } from './takeNext';
import {
  countSkippedAfterSelection,
  getNextTakeableItem,
  createRundown,
  addItem,
  deleteItem,
  duplicateItem,
  moveItem,
  moveItemTo,
  setSelectedItem,
  setActiveItem,
  toggleItemDone,
  getRundown,
  clearAllRundowns
} from './rundownStore';
import type { GraphicInstance } from '../../types/graphics';
import type { Rundown, RundownItem } from '../../types/rundown';

const READY = { ready: true, reason: '' };
const alwaysReady = () => READY;

/** Same node-environment localStorage stub the other store suites install. */
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

/** A rundown literal, so the RULE can be tested on shapes the store cannot build. */
function rundownOf(items: { id: string; title?: string; done?: boolean }[], cursors: Partial<Rundown> = {}): Rundown {
  return {
    id: 'rd',
    name: 'Sunday',
    items: items.map((item) => ({
      id: item.id,
      title: item.title ?? item.id,
      graphic: { templateId: 'lower-third', values: {} } as unknown as GraphicInstance,
      done: item.done ?? false,
      createdAt: '',
      updatedAt: ''
    })) as RundownItem[],
    createdAt: '',
    updatedAt: '',
    ...cursors
  };
}

describe('what Take Next would send', () => {
  it('is the item after the selection', () => {
    const rundown = rundownOf([{ id: 'a' }, { id: 'b' }, { id: 'c' }], { selectedItemId: 'a' });
    expect(getNextTakeableItem(rundown)?.id).toBe('b');
  });

  it('starts at the top when nothing is selected, rather than refusing', () => {
    const rundown = rundownOf([{ id: 'a' }, { id: 'b' }]);
    expect(getNextTakeableItem(rundown)?.id).toBe('a');
  });

  it('skips items marked done', () => {
    const rundown = rundownOf([{ id: 'a' }, { id: 'b', done: true }, { id: 'c' }], { selectedItemId: 'a' });
    expect(getNextTakeableItem(rundown)?.id).toBe('c');
  });

  it('skips a run of done items, not just one', () => {
    const rundown = rundownOf(
      [{ id: 'a' }, { id: 'b', done: true }, { id: 'c', done: true }, { id: 'd' }],
      { selectedItemId: 'a' }
    );
    expect(getNextTakeableItem(rundown)?.id).toBe('d');
    expect(countSkippedAfterSelection(rundown)).toBe(2);
  });

  it('has nothing after the last item — it does not wrap to the top', () => {
    const rundown = rundownOf([{ id: 'a' }, { id: 'b' }], { selectedItemId: 'b' });
    expect(getNextTakeableItem(rundown)).toBeUndefined();
  });

  it('ignores what was last sent, so the anchor survives a Clear', () => {
    // onClear nulls activeItemId; next must be unaffected by it either way.
    const withLive = rundownOf([{ id: 'a' }, { id: 'b' }, { id: 'c' }], {
      selectedItemId: 'a',
      activeItemId: 'c'
    });
    const cleared = rundownOf([{ id: 'a' }, { id: 'b' }, { id: 'c' }], { selectedItemId: 'a' });
    expect(getNextTakeableItem(withLive)?.id).toBe('b');
    expect(getNextTakeableItem(cleared)?.id).toBe('b');
  });

  it('treats a done item under the cursor as a fine place to stand', () => {
    // Selecting a done row to un-mark it must not confuse the anchor.
    const rundown = rundownOf([{ id: 'a', done: true }, { id: 'b' }], { selectedItemId: 'a' });
    expect(getNextTakeableItem(rundown)?.id).toBe('b');
  });
});

describe('the plan, on states the queue UI cannot currently build', () => {
  it('refuses with no rundown at all', () => {
    const plan = planTakeNext({ rundown: undefined, readinessOf: alwaysReady });
    expect(plan.disabled).toBe(true);
    expect(plan.item).toBeUndefined();
    expect(plan.reason).toMatch(/no rundown is active/i);
  });

  it('refuses an empty rundown by name', () => {
    const plan = planTakeNext({ rundown: rundownOf([]), readinessOf: alwaysReady });
    expect(plan.disabled).toBe(true);
    expect(plan.reason).toContain('Sunday');
  });

  it('names the last item when there is nothing after it', () => {
    const rundown = rundownOf([{ id: 'a', title: 'Welcome' }, { id: 'b', title: 'Closing Prayer' }], {
      selectedItemId: 'b'
    });
    const plan = planTakeNext({ rundown, readinessOf: alwaysReady });
    expect(plan.disabled).toBe(true);
    expect(plan.reason).toContain('Closing Prayer');
    expect(plan.reason).toMatch(/nothing after it/i);
  });

  it('distinguishes "the rest are done" from "there is no rest"', () => {
    const rundown = rundownOf(
      [{ id: 'a', title: 'Welcome' }, { id: 'b', title: 'Offering', done: true }],
      { selectedItemId: 'a' }
    );
    const plan = planTakeNext({ rundown, readinessOf: alwaysReady });
    expect(plan.disabled).toBe(true);
    expect(plan.reason).toMatch(/marked done/i);
    // The operator can act on this one, so it must not read as the end of the service.
    expect(plan.reason).not.toMatch(/last item/i);
    expect(plan.skipped).toBe(1);
  });

  it('reports every item done, with nothing selected', () => {
    const rundown = rundownOf([{ id: 'a', done: true }, { id: 'b', done: true }]);
    const plan = planTakeNext({ rundown, readinessOf: alwaysReady });
    expect(plan.disabled).toBe(true);
    expect(plan.reason).toMatch(/every item is marked done/i);
  });

  it('refuses unready content and names the item the operator cannot see', () => {
    const rundown = rundownOf([{ id: 'a' }, { id: 'b', title: 'Memory Verse' }], { selectedItemId: 'a' });
    const plan = planTakeNext({
      rundown,
      readinessOf: () => ({ ready: false, reason: 'This Scripture card is empty.' })
    });
    expect(plan.disabled).toBe(true);
    expect(plan.reason).toContain('Memory Verse');
    expect(plan.reason).toContain('This Scripture card is empty.');
    expect(plan.item).toBeUndefined();
  });

  it('only judges the item it would actually send', () => {
    // The row after the selection is done and skipped; readiness must be asked
    // about the item that would air, not the one passed over.
    const rundown = rundownOf(
      [{ id: 'a' }, { id: 'b', title: 'Skipped', done: true }, { id: 'c', title: 'Sent' }],
      { selectedItemId: 'a' }
    );
    const asked: string[] = [];
    const plan = planTakeNext({
      rundown,
      readinessOf: (item) => {
        asked.push(item.title);
        return READY;
      }
    });
    expect(asked).toEqual(['Sent']);
    expect(plan.item?.title).toBe('Sent');
  });
});

describe('the plan invariant', () => {
  const cases: Rundown[] = [
    rundownOf([]),
    rundownOf([{ id: 'a' }]),
    rundownOf([{ id: 'a' }], { selectedItemId: 'a' }),
    rundownOf([{ id: 'a', done: true }]),
    rundownOf([{ id: 'a' }, { id: 'b', done: true }], { selectedItemId: 'a' }),
    rundownOf([{ id: 'a' }, { id: 'b' }], { selectedItemId: 'a', activeItemId: 'b' }),
    // A dangling selection — what a reload repairs, asserted here anyway.
    rundownOf([{ id: 'a' }, { id: 'b' }], { selectedItemId: 'gone' })
  ];

  it('never yields an item and a reason together, or neither', () => {
    for (const rundown of [...cases, undefined]) {
      const plan = planTakeNext({ rundown, readinessOf: alwaysReady });
      expect(plan.disabled, JSON.stringify(rundown?.items.map((i) => i.id))).toBe(plan.reason !== '');
      expect(Boolean(plan.item)).toBe(!plan.disabled);
    }
  });

  it('describes a refusal with its reason and a send with its item', () => {
    const blocked = planTakeNext({ rundown: rundownOf([]), readinessOf: alwaysReady });
    expect(describeTakeNextCue(blocked)).toBe(blocked.reason);

    const ok = planTakeNext({
      rundown: rundownOf([{ id: 'a', title: 'Welcome' }]),
      readinessOf: alwaysReady
    });
    expect(describeTakeNextCue(ok)).toBe('Next: Welcome');
  });

  it('says so when it is passing items over', () => {
    const rundown = rundownOf(
      [{ id: 'a' }, { id: 'b', done: true }, { id: 'c', done: true }, { id: 'd', title: 'Sermon' }],
      { selectedItemId: 'a' }
    );
    const plan = planTakeNext({ rundown, readinessOf: alwaysReady });
    expect(describeTakeNextCue(plan)).toBe('Next: Sermon — skipping 2 done items');
  });

  it('uses the singular for one skipped item', () => {
    const rundown = rundownOf([{ id: 'a' }, { id: 'b', done: true }, { id: 'c', title: 'Sermon' }], {
      selectedItemId: 'a'
    });
    expect(describeTakeNextCue(planTakeNext({ rundown, readinessOf: alwaysReady }))).toContain('1 done item');
  });
});

describe('next survives the operations that reshape a rundown', () => {
  const graphic = { templateId: 'lower-third', values: { name: 'X' } } as unknown as GraphicInstance;
  let id: string;

  beforeEach(() => {
    (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
    clearAllRundowns();
    id = createRundown('Service')!.id;
  });

  const add = (title: string) => addItem(id, { graphic, title })!;
  const next = () => getNextTakeableItem(getRundown(id));

  it('follows the item, not the position, after a reorder', () => {
    const a = add('A');
    const b = add('B');
    add('C');
    setSelectedItem(id, a.id);
    expect(next()?.title).toBe('B');
    // Move B behind C. Next is recomputed from the new order, and the selection
    // still points at A because cursors are ids.
    moveItem(id, b.id, 'down');
    expect(next()?.title).toBe('C');
    expect(getRundown(id)?.selectedItemId).toBe(a.id);
  });

  it('offers a duplicate as the next item, since a copy is new work', () => {
    const a = add('A');
    add('B');
    setSelectedItem(id, a.id);
    duplicateItem(id, a.id);
    expect(next()?.title).toBe('A (copy)');
  });

  it('keeps a duplicate of a DONE item sendable', () => {
    const a = add('A');
    setSelectedItem(id, a.id);
    toggleItemDone(id, a.id);
    const copy = duplicateItem(id, a.id)!;
    expect(copy.done).toBe(false);
    expect(next()?.id).toBe(copy.id);
  });

  it('does not re-aim at the top when the selected item is deleted mid-service', () => {
    const a = add('Opening');
    const b = add('Notices');
    const c = add('Sermon');
    setSelectedItem(id, b.id);
    setActiveItem(id, b.id);
    deleteItem(id, b.id);
    // The regression this guards: clearing the selection made the anchor -1, so
    // Next became the FIRST item and the opening graphic sat one press from air.
    expect(getRundown(id)?.selectedItemId).toBe(a.id);
    expect(next()?.id).toBe(c.id);
    // Nothing may claim a deleted item is still on air.
    expect(getRundown(id)?.activeItemId).toBeUndefined();
  });

  it('clears the selection only when the deleted item was the first', () => {
    const a = add('Opening');
    const b = add('Notices');
    setSelectedItem(id, a.id);
    deleteItem(id, a.id);
    expect(getRundown(id)?.selectedItemId).toBeUndefined();
    // Anchor -1 genuinely means "start from the top" now that the top is gone.
    expect(next()?.id).toBe(b.id);
  });

  it('leaves a selection elsewhere alone when another item is deleted', () => {
    const a = add('A');
    const b = add('B');
    const c = add('C');
    setSelectedItem(id, a.id);
    deleteItem(id, c.id);
    expect(getRundown(id)?.selectedItemId).toBe(a.id);
    expect(next()?.id).toBe(b.id);
  });

  it('reorders to an absolute position without disturbing what was sent', () => {
    const a = add('A');
    const b = add('B');
    const c = add('C');
    setSelectedItem(id, a.id);
    setActiveItem(id, b.id);
    // Drag C to the top.
    moveItemTo(id, c.id, 0);
    expect(getRundown(id)?.items.map((i) => i.title)).toEqual(['C', 'A', 'B']);
    // Order is operational now, so these are live-service guarantees: dragging a
    // row rewrites neither the record of what aired nor the operator's cursor.
    expect(getRundown(id)?.activeItemId).toBe(b.id);
    expect(getRundown(id)?.selectedItemId).toBe(a.id);
    // Next follows the new order, computed from the same anchor.
    expect(next()?.title).toBe('B');
  });

  it('clamps a drag that lands past either end instead of refusing it', () => {
    const a = add('A');
    add('B');
    moveItemTo(id, a.id, 99);
    expect(getRundown(id)?.items.map((i) => i.title)).toEqual(['B', 'A']);
    moveItemTo(id, a.id, -5);
    expect(getRundown(id)?.items.map((i) => i.title)).toEqual(['A', 'B']);
  });

  it('leaves a rundown alone when the dragged item is not in it', () => {
    add('A');
    moveItemTo(id, 'not-an-item', 0);
    expect(getRundown(id)?.items.map((i) => i.title)).toEqual(['A']);
  });

  it('is unchanged by taking the same item twice', () => {
    const a = add('A');
    const b = add('B');
    setSelectedItem(id, a.id);
    setActiveItem(id, a.id);
    const first = next()?.id;
    setActiveItem(id, a.id); // taken again
    expect(next()?.id).toBe(first);
    expect(b.id).toBe(first);
  });
});
