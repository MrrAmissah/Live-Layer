import { beforeEach, describe, expect, it } from 'vitest';
import { useLiveLayerStore } from '../store/useLiveLayerStore';
import { addItem, createRundown, getRundown, updateItem, clearAllRundowns } from '../lib/rundown/rundownStore';
import { resolveResetPalette, PALETTE_FIELD_IDS } from '../lib/variantPalette';
import { newestPresetsFirst } from '../components/control/DesignPresets';
import type { GraphicInstance } from '../types/graphics';

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

const FIVE = { colorBrand: '#111111', colorAccent: '#222222', colorSurface: '#333333', colorText: '#444444', colorSecondary: '#555555' };

describe('atomic palette reset — draft mode (store.setFields)', () => {
  it('writes all five palette fields in one update and preserves content', () => {
    store().setTemplate('preacher-lower-third');
    store().setField('name', 'Rev. Keep Me');
    store().setFields(FIVE);
    const d = store().draftValues;
    for (const [k, v] of Object.entries(FIVE)) expect(d[k]).toBe(v);
    expect(d.name).toBe('Rev. Keep Me'); // unrelated value preserved
  });

  it('Reset palette resolves to five fields and setFields applies them together', () => {
    store().setTemplate('preacher-lower-third');
    // Deviate every palette field, then reset in one call.
    store().setFields(FIVE);
    const reset = resolveResetPalette('preacher-lower-third', store().draftValues.variantId);
    store().setFields(reset);
    const d = store().draftValues;
    for (const field of PALETTE_FIELD_IDS) {
      if (reset[field] !== undefined) expect(d[field]).toBe(reset[field]);
    }
  });
});

describe('atomic palette reset — rundown item (one updateItem, mirrors useEditTarget.setFields)', () => {
  it('applies all five fields at once, not just the last, and keeps content', () => {
    const rundown = createRundown('Show')!;
    const graphic: GraphicInstance = {
      id: 'g-1', templateId: 'preacher-lower-third',
      values: { name: 'Item Keep', colorBrand: '#000000' },
      theme: {}, layout: {}, durationSeconds: 6,
      createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z'
    };
    const item = addItem(rundown.id, { graphic })!;

    // The FIX: one updateItem merging all fields over the current values —
    // exactly what useEditTarget.setFields does (patch({ values: {...g.values, ...patch} })).
    const source = getRundown(rundown.id)!.items[0].graphic;
    updateItem(rundown.id, item.id, { graphic: { ...source, values: { ...source.values, ...FIVE } } });

    const saved = getRundown(rundown.id)!.items[0].graphic.values;
    for (const [k, v] of Object.entries(FIVE)) expect(saved[k]).toBe(v); // all five, not only the last
    expect(saved.name).toBe('Item Keep'); // content preserved
  });

  it('demonstrates why atomicity matters: five separate writes off one stale snapshot keep only the last', () => {
    const rundown = createRundown('Show')!;
    const graphic: GraphicInstance = {
      id: 'g-2', templateId: 'preacher-lower-third',
      values: { name: 'x' }, theme: {}, layout: {}, durationSeconds: 6,
      createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z'
    };
    const item = addItem(rundown.id, { graphic })!;
    const stale = getRundown(rundown.id)!.items[0].graphic; // one snapshot, as the buggy closure held
    for (const [k, v] of Object.entries(FIVE)) {
      updateItem(rundown.id, item.id, { graphic: { ...stale, values: { ...stale.values, [k]: v } } });
    }
    const saved = getRundown(rundown.id)!.items[0].graphic.values;
    // Only the LAST field survives — the bug the atomic setFields fixes.
    expect(saved.colorSecondary).toBe('#555555');
    expect(saved.colorBrand).toBeUndefined();
  });
});

describe('newestPresetsFirst — compact list', () => {
  const p = (id: string): GraphicInstance => ({
    id, templateId: 'preacher-lower-third', presetName: id, values: {}, theme: {}, layout: {},
    durationSeconds: 6, createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z'
  });

  it('a newly saved fifth preset appears first and the list stays at four', () => {
    const presets = [p('1'), p('2'), p('3'), p('4'), p('5')]; // 5 appended last
    const shown = newestPresetsFirst(presets, 4);
    expect(shown.map((x) => x.id)).toEqual(['5', '4', '3', '2']);
    expect(shown[0].id).toBe('5'); // just-saved, at the top
  });

  it('does not mutate or reorder the persisted array', () => {
    const presets = [p('1'), p('2'), p('3'), p('4'), p('5')];
    newestPresetsFirst(presets, 4);
    expect(presets.map((x) => x.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('handles fewer than the count', () => {
    expect(newestPresetsFirst([p('1'), p('2')], 4).map((x) => x.id)).toEqual(['2', '1']);
  });
});
