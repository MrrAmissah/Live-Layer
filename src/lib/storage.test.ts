import { beforeEach, describe, expect, it } from 'vitest';
import { loadProgram, saveProgram, loadQuickQueue, saveQuickQueue } from './storage';
import { CLEAR_PROGRAM_STATE, type ProgramState } from '../types/program';
import type { GraphicInstance, QuickQueueItem } from '../types/graphics';

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

function makeInstance(overrides: Partial<GraphicInstance> = {}): GraphicInstance {
  return {
    id: 'g1',
    templateId: 'preacher-lower-third',
    values: { name: 'Rev. Test' },
    theme: {},
    durationSeconds: 0,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
    ...overrides
  };
}

describe('program persistence + recovery', () => {
  it('reloads an explicit clear as clear', () => {
    saveProgram({ ...CLEAR_PROGRAM_STATE, status: 'clear', clearedAt: 1234 });
    const loaded = loadProgram();
    expect(loaded.status).toBe('clear');
    expect(loaded.clearedAt).toBe(1234);
  });

  it('reloads a previously showing program as recovering, never confident live', () => {
    const showing: ProgramState = {
      ...CLEAR_PROGRAM_STATE,
      status: 'showing',
      confirmation: 'unconfirmed',
      instanceId: 'g1',
      templateId: 'preacher-lower-third',
      snapshot: makeInstance(),
      takenAt: 999
    };
    saveProgram(showing);
    const loaded = loadProgram();
    expect(loaded.status).toBe('recovering');
    expect(loaded.confirmation).toBe('unconfirmed');
    expect(loaded.snapshot?.id).toBe('g1');
  });

  it('resets to clear when nothing is persisted', () => {
    expect(loadProgram().status).toBe('clear');
  });

  it('resets malformed persisted state safely to clear', () => {
    localStorage.setItem('livelayer.program', '{ not valid json');
    expect(loadProgram().status).toBe('clear');
    localStorage.setItem('livelayer.program', JSON.stringify({ nope: true }));
    expect(loadProgram().status).toBe('clear');
  });

  it('reloads a showing state with no valid snapshot as clear', () => {
    saveProgram({ ...CLEAR_PROGRAM_STATE, status: 'showing', snapshot: null });
    expect(loadProgram().status).toBe('clear');
  });
});

describe('quick-queue revision normalization', () => {
  it('normalizes legacy items without a revision to 1', () => {
    // Write a raw item lacking `revision`, as older builds stored it.
    const legacy = makeInstance({ id: 'q-legacy' });
    localStorage.setItem('livelayer.quickQueue', JSON.stringify([legacy]));
    const [item] = loadQuickQueue();
    expect(item.revision).toBe(1);
  });

  it('preserves an existing revision on load', () => {
    const item: QuickQueueItem = { ...makeInstance({ id: 'q-1' }), revision: 4 };
    saveQuickQueue([item]);
    expect(loadQuickQueue()[0].revision).toBe(4);
  });
});
