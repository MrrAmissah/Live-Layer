import { beforeEach, describe, expect, it } from 'vitest';
import { resolvePackChangeIntent } from './usePackSwitchGuard';
import { useLiveLayerStore } from '../store/useLiveLayerStore';

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
});
const store = () => useLiveLayerStore.getState();

describe('resolvePackChangeIntent — shared guard decision', () => {
  it('is a no-op when the same pack is selected (clean or dirty)', () => {
    expect(resolvePackChangeIntent('house', 'house', false)).toBe('noop');
    expect(resolvePackChangeIntent('house', 'house', true)).toBe('noop');
  });

  it('switches immediately for a different pack with a clean draft', () => {
    expect(resolvePackChangeIntent('house', 'ppc-2026', false)).toBe('switch');
  });

  it('confirms first for a different pack with an edited draft', () => {
    expect(resolvePackChangeIntent('house', 'ppc-2026', true)).toBe('confirm');
  });
});

describe('isDraftDirty — dirtiness reuses setActivePack seeding', () => {
  it('a freshly seeded draft is clean', () => {
    store().setActivePack('ppc-2026'); // re-seeds draft for the current template
    expect(store().isDraftDirty()).toBe(false);
    store().setActivePack('house');
    expect(store().isDraftDirty()).toBe(false);
  });

  it('an edited draft is dirty', () => {
    store().setActivePack('house');
    store().setField('name', 'Operator typed this');
    expect(store().isDraftDirty()).toBe(true);
  });

  it('re-seeding via a pack switch clears dirtiness', () => {
    store().setActivePack('house');
    store().setField('name', 'edited');
    expect(store().isDraftDirty()).toBe(true);
    store().setActivePack('ppc-2026'); // Confirm path re-seeds
    expect(store().isDraftDirty()).toBe(false);
  });
});

describe('guard decision composed with live dirtiness (mirrors requestPackChange)', () => {
  const intentFor = (next: string) =>
    resolvePackChangeIntent(store().activePackId, next, store().isDraftDirty());

  it('dirty draft → confirm; and NOT switching leaves pack + draft untouched (Cancel)', () => {
    store().setActivePack('house');
    store().setField('name', 'unsaved edit');
    expect(intentFor('ppc-2026')).toBe('confirm');
    // Cancel = do nothing.
    expect(store().activePackId).toBe('house');
    expect(store().draftValues.name).toBe('unsaved edit');
  });

  it('Confirm switches once and re-seeds the draft', () => {
    store().setActivePack('house');
    store().setField('name', 'unsaved edit');
    // Confirm invokes setActivePack once.
    store().setActivePack('ppc-2026');
    expect(store().activePackId).toBe('ppc-2026');
    expect(store().draftValues.name).not.toBe('unsaved edit'); // re-seeded
    expect(store().isDraftDirty()).toBe(false);
  });

  it('clean draft → switch (no confirmation needed)', () => {
    store().setActivePack('house');
    expect(intentFor('ppc-2026')).toBe('switch');
  });
});
