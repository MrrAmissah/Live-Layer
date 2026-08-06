import { describe, expect, it, vi } from 'vitest';
import { subscribeObsSourceState, type ObsEventHost, type ObsSourceState } from './obsSource';

/**
 * The OBS Browser binding, read through an injectable host (this suite runs in
 * node — no DOM). The invariant under test: a page NOT hosted by OBS can never
 * produce an active OR inactive claim, and a hosted one claims only what OBS
 * actually dispatched.
 */

type Listener = (event: Event) => void;

function fakeHost(withBinding: boolean) {
  const listeners = new Map<string, Set<Listener>>();
  const host: ObsEventHost = {
    addEventListener: (type, listener) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
    ...(withBinding ? { obsstudio: { pluginVersion: 'x' } } : {})
  };
  const dispatch = (type: string, detail: unknown) => {
    for (const listener of listeners.get(type) ?? []) {
      listener({ detail } as unknown as Event);
    }
  };
  const count = () => [...listeners.values()].reduce((n, set) => n + set.size, 0);
  return { host, dispatch, count };
}

describe('without the binding (plain browser tab)', () => {
  it('reports unknown once and attaches nothing', () => {
    const { host, count } = fakeHost(false);
    const onChange = vi.fn();
    subscribeObsSourceState(onChange, host);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ sourceActive: null, sourceVisible: null });
    expect(count()).toBe(0);
  });

  it('reports unknown even with no host at all (node/SSR)', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeObsSourceState(onChange, null);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ sourceActive: null, sourceVisible: null });
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('with the binding', () => {
  it('stays unknown until OBS actually dispatches — hosting alone proves nothing', () => {
    const { host } = fakeHost(true);
    const onChange = vi.fn();
    subscribeObsSourceState(onChange, host);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ sourceActive: null, sourceVisible: null });
  });

  it('tracks active true → false, and false is reported as false, not unknown', () => {
    const { host, dispatch } = fakeHost(true);
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push(state), host);
    dispatch('obsSourceActiveChanged', { active: true });
    dispatch('obsSourceActiveChanged', { active: false });
    expect(states[states.length - 1]).toEqual({ sourceActive: false, sourceVisible: null });
    expect(states.some((s) => s.sourceActive === true)).toBe(true);
  });

  it('tracks visibility independently of activity', () => {
    const { host, dispatch } = fakeHost(true);
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push(state), host);
    dispatch('obsSourceVisibleChanged', { visible: true });
    dispatch('obsSourceActiveChanged', { active: true });
    expect(states[states.length - 1]).toEqual({ sourceActive: true, sourceVisible: true });
  });

  it('ignores malformed event details rather than coercing them', () => {
    const { host, dispatch } = fakeHost(true);
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push(state), host);
    dispatch('obsSourceActiveChanged', { active: 'yes' });
    dispatch('obsSourceActiveChanged', null);
    dispatch('obsSourceActiveChanged', {});
    expect(states).toHaveLength(1); // only the initial unknown emit
    expect(states[0]).toEqual({ sourceActive: null, sourceVisible: null });
  });

  it('unsubscribe removes both listeners', () => {
    const { host, count } = fakeHost(true);
    const unsubscribe = subscribeObsSourceState(() => undefined, host);
    expect(count()).toBe(2);
    unsubscribe();
    expect(count()).toBe(0);
  });
});
