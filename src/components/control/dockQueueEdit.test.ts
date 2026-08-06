import { beforeEach, describe, expect, it } from 'vitest';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import {
  addItem,
  clearAllRundowns,
  createRundown,
  getRundown,
  updateItem,
  MAX_ITEMS_PER_RUNDOWN
} from '../../lib/rundown/rundownStore';
import { filterRundownItems } from '../../lib/rundown/queueSearch';
import { templateLabel } from '../../lib/graphicTitle';
import type { GraphicInstance } from '../../types/graphics';
import type { RundownItem } from '../../types/rundown';

/**
 * Stage 2 behaviour, tested against the real stores (node + MemStorage — the
 * repo's established pattern):
 *
 *  1. EDITING NEVER TOUCHES PROGRAM. The Quick Edit tab writes through
 *     `useEditTarget`, whose two write paths are the store's draft setters and
 *     `updateItem` on the rundown store. Both must leave the Program slice
 *     REFERENTIALLY unchanged (`toBe`, not `toEqual`) — Program only moves on
 *     the normal Take/Clear path.
 *
 *  2. QUEUE SEARCH IS REAL. `filterRundownItems` genuinely filters over what
 *     the rows display (title + type label) and keeps original indices, so the
 *     printed running order never renumbers under a filter.
 *
 *  3. THE CAP REFUSES. `addItem` returns undefined at MAX_ITEMS_PER_RUNDOWN —
 *     the contract the Queue tab's "Rundown is full" message stands on.
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

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
  clearAllRundowns();
});

const store = () => useLiveLayerStore.getState();

function makeGraphic(templateId: string, values: Record<string, string> = {}): GraphicInstance {
  return {
    id: `g-${Math.random().toString(36).slice(2, 8)}`,
    templateId,
    values,
    theme: {},
    layout: {},
    durationSeconds: 6,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z'
  };
}

describe('editing never touches Program', () => {
  it('draft writes leave the Program slice referentially unchanged', () => {
    const before = store().program;
    store().setField('name', 'Edited Mid-Service');
    store().setFields({ title: 'Guest Speaker', subtitle: 'Visiting' });
    store().setLayout({ size: 'small' });
    store().setDurationSeconds(10);
    store().setTheme({ accentColor: '#123456' }); // the brand-swatch draft path
    expect(store().program).toBe(before);
  });

  it('rundown-item writes (the useEditTarget path) leave Program referentially unchanged', () => {
    const rundown = createRundown('Sunday Service')!;
    const item = addItem(rundown.id, { graphic: makeGraphic('preacher-lower-third', { name: 'Original' }) })!;

    const before = store().program;
    // Exactly what useEditTarget.setField performs for a selected item: one
    // updateItem merging over the current graphic.
    const current = getRundown(rundown.id)!.items[0].graphic;
    updateItem(rundown.id, item.id, {
      graphic: { ...current, values: { ...current.values, name: 'Edited Mid-Service' } }
    });

    expect(getRundown(rundown.id)!.items[0].graphic.values.name).toBe('Edited Mid-Service');
    expect(store().program).toBe(before);
  });
});

describe('queue search (filterRundownItems)', () => {
  const items = (): RundownItem[] => {
    const rundown = createRundown('Service')!;
    addItem(rundown.id, { graphic: makeGraphic('preacher-lower-third'), title: 'Rev. Ishmael K. Awotwe' });
    addItem(rundown.id, { graphic: makeGraphic('preacher-lower-third'), title: 'Mass Choir' });
    addItem(rundown.id, { graphic: makeGraphic('scripture-card'), title: 'John 3:16 (KJV)' });
    return getRundown(rundown.id)!.items;
  };

  it('matches titles case-insensitively', () => {
    const hits = filterRundownItems(items(), 'mass');
    expect(hits.map(({ item }) => item.title)).toEqual(['Mass Choir']);
  });

  it('matches the displayed type label too', () => {
    // Search by whatever label the rows actually print for scripture-card.
    const label = templateLabel('scripture-card');
    const hits = filterRundownItems(items(), label.toUpperCase());
    expect(hits).toHaveLength(1);
    expect(hits[0].item.title).toBe('John 3:16 (KJV)');
  });

  it('keeps ORIGINAL queue indices under a filter — rows never renumber', () => {
    const hits = filterRundownItems(items(), 'john');
    expect(hits).toHaveLength(1);
    expect(hits[0].index).toBe(2); // third in the running order, filtered or not
  });

  it('returns everything, in order, for an empty or whitespace query', () => {
    const all = items();
    for (const query of ['', '   ']) {
      const hits = filterRundownItems(all, query);
      expect(hits.map(({ item }) => item.id)).toEqual(all.map((item) => item.id));
      expect(hits.map(({ index }) => index)).toEqual([0, 1, 2]);
    }
  });

  it('returns no rows when nothing matches', () => {
    expect(filterRundownItems(items(), 'zzz-no-such-item')).toEqual([]);
  });
});

describe('the item cap refuses instead of silently dropping', () => {
  it('addItem returns undefined at MAX_ITEMS_PER_RUNDOWN', () => {
    const rundown = createRundown('Big Event')!;
    for (let i = 0; i < MAX_ITEMS_PER_RUNDOWN; i += 1) {
      expect(addItem(rundown.id, { graphic: makeGraphic('preacher-lower-third'), title: `Item ${i + 1}` })).toBeDefined();
    }
    expect(getRundown(rundown.id)!.items).toHaveLength(MAX_ITEMS_PER_RUNDOWN);
    // The refusal the Queue tab's guardAdd surfaces:
    expect(addItem(rundown.id, { graphic: makeGraphic('preacher-lower-third'), title: 'One too many' })).toBeUndefined();
    expect(getRundown(rundown.id)!.items).toHaveLength(MAX_ITEMS_PER_RUNDOWN);
  });
});
