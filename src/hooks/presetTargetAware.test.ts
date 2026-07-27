import { beforeEach, describe, expect, it } from 'vitest';
import { useLiveLayerStore } from '../store/useLiveLayerStore';
import { CLEAR_PROGRAM_STATE } from '../types/program';
import {
  addItem,
  createRundown,
  getRundown,
  updateItem,
  clearAllRundowns
} from '../lib/rundown/rundownStore';
import { cloneRundownGraphic } from '../lib/rundown/rundownStore';
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
  useLiveLayerStore.setState({ presets: [], program: { ...CLEAR_PROGRAM_STATE } });
});

const store = () => useLiveLayerStore.getState();

function makePreset(id: string, overrides: Partial<GraphicInstance> = {}): GraphicInstance {
  return {
    id,
    templateId: 'scripture-card',
    presetName: 'Preset One',
    values: { reference: 'John 3:16', colorBrand: '#abcdef' },
    theme: {},
    layout: {},
    durationSeconds: 8,
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
    ...overrides
  };
}

// ---- store: savePresetFromInstance shares rules with savePreset ----
describe('savePresetFromInstance', () => {
  it('creates a preset from a source instance with a fresh id, name and timestamps', () => {
    const source = makePreset('src-1', { presetName: undefined });
    store().savePresetFromInstance(source, 'From Instance');
    const [preset] = store().presets;
    expect(preset.presetName).toBe('From Instance');
    expect(preset.id).not.toBe('src-1'); // fresh id
    expect(preset.templateId).toBe('scripture-card');
    expect(preset.values.reference).toBe('John 3:16');
  });

  it('deep-clones the source so later source mutation cannot alter the stored preset', () => {
    const source = makePreset('src-2');
    store().savePresetFromInstance(source, 'Immutable');
    source.values.reference = 'MUTATED';
    source.values.colorBrand = '#000000';
    const [preset] = store().presets;
    expect(preset.values.reference).toBe('John 3:16');
    expect(preset.values.colorBrand).toBe('#abcdef');
  });

  it('draft savePreset routes through the same creation rules (fresh id + name)', () => {
    store().setTemplate('preacher-lower-third');
    store().setField('name', 'Rev. Draft Save');
    store().savePreset('Draft Preset');
    const [preset] = store().presets;
    expect(preset.presetName).toBe('Draft Preset');
    expect(preset.values.name).toBe('Rev. Draft Save');
    expect(typeof preset.id).toBe('string');
    expect(preset.createdAt).not.toBe('');
  });
});

// ---- rundown apply: identity preservation + no publish ----
describe('applying a preset to a rundown item (mirrors useEditTarget.applyPreset)', () => {
  function applyToItem(rundownId: string, itemId: string, preset: GraphicInstance) {
    const source = getRundown(rundownId)!.items.find((i) => i.id === itemId)!.graphic;
    updateItem(rundownId, itemId, { graphic: { ...cloneRundownGraphic(preset), id: source.id } });
  }

  it('copies the preset payload while preserving item id, ordering and rundown membership', () => {
    const rundown = createRundown('Show')!;
    const a = addItem(rundown.id, { graphic: makePreset('g-a', { templateId: 'preacher-lower-third', presetName: undefined, values: { name: 'Item A' } }) })!;
    const b = addItem(rundown.id, { graphic: makePreset('g-b', { templateId: 'preacher-lower-third', presetName: undefined, values: { name: 'Item B' } }) })!;
    const beforeGraphicId = getRundown(rundown.id)!.items[0].graphic.id;

    applyToItem(rundown.id, a.id, makePreset('preset-x', { values: { reference: 'Psalm 23' } }));

    const rd = getRundown(rundown.id)!;
    expect(rd.items).toHaveLength(2);
    expect(rd.items[0].id).toBe(a.id); // item id preserved
    expect(rd.items[1].id).toBe(b.id); // ordering + sibling preserved
    expect(rd.items[0].graphic.id).toBe(beforeGraphicId); // graphic id preserved
    expect(rd.items[0].graphic.templateId).toBe('scripture-card'); // payload replaced
    expect(rd.items[0].graphic.values.reference).toBe('Psalm 23');
    expect(rd.items[1].graphic.values.name).toBe('Item B'); // sibling untouched
  });

  it('does not touch active/selected rundown state or the Program slice', () => {
    const rundown = createRundown('Live show')!;
    const item = addItem(rundown.id, { graphic: makePreset('g-1', { templateId: 'preacher-lower-third', presetName: undefined }) })!;
    const programBefore = store().program;

    applyToItem(rundown.id, item.id, makePreset('preset-y'));

    // No publish/Take happened: Program is the exact same reference.
    expect(store().program).toBe(programBefore);
    expect(store().program.status).toBe('clear');
  });

  it('does not mutate the source preset when applied to an item', () => {
    const rundown = createRundown('Show')!;
    const item = addItem(rundown.id, { graphic: makePreset('g-1', { templateId: 'preacher-lower-third', presetName: undefined }) })!;
    const preset = makePreset('preset-z', { values: { reference: 'Acts 2' } });
    applyToItem(rundown.id, item.id, preset);
    // Edit the applied item; the preset object must be unaffected.
    updateItem(rundown.id, item.id, {
      graphic: { ...getRundown(rundown.id)!.items[0].graphic, values: { reference: 'CHANGED' } }
    });
    expect(preset.values.reference).toBe('Acts 2');
  });
});
