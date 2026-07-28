import { beforeEach, describe, expect, it } from 'vitest';
import { addItem, createRundown, getRundown, updateItem, clearAllRundowns } from '../lib/rundown/rundownStore';
import { applyVariantSelection } from '../lib/variantPalette';
import { templateRegistry } from '../components/templates/registry';
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

const preacher = templateRegistry.find((t) => t.id === 'preacher-lower-third')!;
const withPalette = preacher.variants!.find((v) => v.palette && Object.keys(v.palette).length > 0)!;

function baseGraphic(): GraphicInstance {
  return {
    id: 'g-item',
    templateId: 'preacher-lower-third',
    values: { name: 'Rev. Rundown', title: 'Guest', colorBrand: '#000000' },
    theme: {},
    layout: {},
    durationSeconds: 6,
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z'
  };
}

/**
 * The rundown-item variant path (useEditTarget) routes variant selection
 * through the SAME applyVariantSelection helper as the draft path and persists
 * it via updateItem. This exercises that exact composition end to end on the
 * rundown store, so the item's palette follows the chosen variant while its
 * other content survives.
 */
describe('rundown item variant selection', () => {
  it('merges the signature palette and preserves other values', () => {
    const rundown = createRundown('Palette test')!;
    const item = addItem(rundown.id, { graphic: baseGraphic() })!;

    // Mirror useEditTarget's rundown setField('variantId', …) exactly.
    const source = getRundown(rundown.id)!.items.find((i) => i.id === item.id)!.graphic;
    updateItem(rundown.id, item.id, {
      graphic: { ...source, values: applyVariantSelection(source.values, source.templateId, withPalette.id) }
    });

    const saved = getRundown(rundown.id)!.items.find((i) => i.id === item.id)!.graphic;
    expect(saved.values.variantId).toBe(withPalette.id);
    for (const [k, v] of Object.entries(withPalette.palette!)) {
      expect(saved.values[k]).toBe(v); // palette followed the variant
    }
    expect(saved.values.name).toBe('Rev. Rundown'); // content preserved
    expect(saved.values.title).toBe('Guest');
  });
});
