import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addItem, createRundown, duplicateRundown, getRundown, listRundowns, setSelectedItem, updateItem } from './rundownStore';
import type { GraphicInstance } from '../../types/graphics';

/**
 * Starting next week's service from last week's.
 *
 * The line that matters is between PREPARATION and HISTORY. Items and their
 * graphics are preparation and travel whole. `activeItemId` and
 * `selectedItemId` are a record of this service being RUN, and a fresh rundown
 * that opens claiming something was already sent is making a claim about air
 * that never happened.
 */

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear()
  });
});

const graphic = (over: Partial<GraphicInstance> = {}): GraphicInstance => ({
  id: 'g-src', templateId: 'announcement-banner',
  values: { headline: 'Service on {{date}} at {{eventTime}}', logoAssetId: 'asset-1', personId: 'p-ama' },
  theme: { accentColor: '#E8B93C' }, layout: { size: 'large' }, assetRefs: { logo: 'asset-1' },
  personId: 'p-ama', durationSeconds: 12,
  createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
  ...over
});

const seed = () => {
  const source = createRundown('Sunday Service')!;
  addItem(source.id, { graphic: graphic(), source: { type: 'draft' as const } });
  addItem(source.id, { graphic: graphic({ id: 'g-2', values: { headline: 'Second' } }), source: { type: 'draft' as const } });
  const withItems = getRundown(source.id)!;
  setSelectedItem(source.id, withItems.items[0].id);
  return getRundown(source.id)!;
};

describe('what the copy keeps', () => {
  it('keeps order, content, assets, people, theme, layout and duration', () => {
    const source = seed();
    const copy = duplicateRundown(source.id)!;
    expect(copy.items).toHaveLength(2);
    const first = copy.items[0].graphic;
    expect(first.templateId).toBe('announcement-banner');
    expect(first.values.logoAssetId).toBe('asset-1');
    expect(first.values.personId).toBe('p-ama');
    expect(first.assetRefs).toEqual({ logo: 'asset-1' });
    expect(first.theme).toEqual({ accentColor: '#E8B93C' });
    expect(first.layout).toEqual({ size: 'large' });
    expect(first.durationSeconds).toBe(12);
    expect(copy.items[1].graphic.values.headline).toBe('Second');
  });

  it('keeps dynamic tokens RAW rather than freezing last week into them', () => {
    const source = seed();
    const copy = duplicateRundown(source.id)!;
    expect(copy.items[0].graphic.values.headline).toBe('Service on {{date}} at {{eventTime}}');
  });

  it('copies asset IDs, never blobs', () => {
    const copy = duplicateRundown(seed().id)!;
    const serialised = JSON.stringify(copy);
    expect(serialised).toContain('asset-1');
    expect(serialised).not.toMatch(/data:|blob:/);
  });
});

describe('what the copy drops', () => {
  it('drops the last-sent cursor — it never went to air', () => {
    const source = seed();
    updateItem(source.id, getRundown(source.id)!.items[0].id, {});
    const withActive = { ...getRundown(source.id)! };
    // Simulate the source having been run.
    store.set('livelayer.rundowns', JSON.stringify({
      version: 1,
      activeRundownId: source.id,
      rundowns: listRundowns().map((r) => (r.id === source.id ? { ...r, activeItemId: withActive.items[0].id } : r))
    }));
    const copy = duplicateRundown(source.id)!;
    expect(copy.activeItemId).toBeUndefined();
  });

  it('drops the selection cursor', () => {
    const source = seed();
    expect(getRundown(source.id)!.selectedItemId).toBeDefined();
    expect(duplicateRundown(source.id)!.selectedItemId).toBeUndefined();
  });

  it('resets done, which records a service being run', () => {
    const source = seed();
    const id = getRundown(source.id)!.items[0].id;
    updateItem(source.id, id, { done: true });
    expect(duplicateRundown(source.id)!.items[0].done).toBe(false);
  });
});

describe('the copy is genuinely independent', () => {
  it('gets a new rundown id and new item ids', () => {
    const source = seed();
    const copy = duplicateRundown(source.id)!;
    expect(copy.id).not.toBe(source.id);
    for (const item of copy.items) {
      expect(source.items.some((s) => s.id === item.id)).toBe(false);
      expect(source.items.some((s) => s.graphic.id === item.graphic.id)).toBe(false);
    }
  });

  it('editing the copy does not change the source', () => {
    const source = seed();
    const copy = duplicateRundown(source.id)!;
    updateItem(copy.id, copy.items[0].id, { title: 'Changed in the copy' });
    const sourceAfter = getRundown(source.id)!;
    expect(sourceAfter.items[0].title).not.toBe('Changed in the copy');
    expect(getRundown(copy.id)!.items[0].title).toBe('Changed in the copy');
  });

  it('leaves the source rundown otherwise untouched', () => {
    const source = seed();
    const before = JSON.stringify(getRundown(source.id));
    duplicateRundown(source.id);
    expect(JSON.stringify(getRundown(source.id))).toBe(before);
  });

  it('names the copy, and accepts an operator name', () => {
    const source = seed();
    expect(duplicateRundown(source.id)!.name).toBe('Sunday Service (copy)');
    expect(duplicateRundown(source.id, 'Sunday 17 August')!.name).toBe('Sunday 17 August');
  });

  it('refuses an unknown source rather than inventing one', () => {
    expect(duplicateRundown('no-such-rundown')).toBeUndefined();
  });
});
