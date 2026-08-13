import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  subscribeObsSourceState,
  type ObsBridgeDiagnostics,
  type ObsEventHost,
  type ObsSourceState
} from './obsSource';

/**
 * The OBS Browser binding, read through an injectable host (this suite runs in
 * node — no DOM).
 *
 * Two invariants, and the first one used to be asserted backwards. A previous
 * test here required that NO listeners were attached when `window.obsstudio`
 * was absent, which is exactly the defect that reached the OBS rig: the binding
 * arriving a moment after the React effect ran left the page deaf forever, and
 * every control surface sat on OUTPUT READY through a real service.
 *
 *  1. Listening never depends on the binding being present at subscribe time.
 *  2. A reading is `null` until OBS actually reports it — the binding existing,
 *     the page rendering, or a relay connecting may never become ACTIVE.
 */

type Listener = (event: Event) => void;

function fakeHost(binding?: Record<string, unknown>) {
  const listeners = new Map<string, Set<Listener>>();
  const host: ObsEventHost = {
    addEventListener: (type, listener) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
    ...(binding ? { obsstudio: binding } : {})
  };
  const dispatch = (type: string, detail: unknown) => {
    for (const listener of [...(listeners.get(type) ?? [])]) {
      listener({ detail } as unknown as Event);
    }
  };
  const count = () => [...listeners.values()].reduce((n, set) => n + set.size, 0);
  return { host, dispatch, count };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the subscription lifecycle', () => {
  it('attaches listeners even when the binding is absent at that instant', () => {
    // The rig failure in one line: OBS injects `obsstudio` at page creation, but
    // if this effect wins the race, giving up here means never recovering.
    const { host, count } = fakeHost();
    subscribeObsSourceState(() => undefined, host);
    expect(count()).toBe(2);
  });

  it('applies a CustomEvent that arrives while the binding is still absent', () => {
    const { host, dispatch } = fakeHost();
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push(state), host);

    dispatch('obsSourceActiveChanged', { active: false });
    expect(states[states.length - 1]).toEqual({ sourceActive: false, sourceVisible: null });

    dispatch('obsSourceVisibleChanged', { visible: false });
    expect(states[states.length - 1]).toEqual({ sourceActive: false, sourceVisible: false });
  });

  it('starts unknown and stays unknown until OBS reports something', () => {
    const { host } = fakeHost({ pluginVersion: 'x' });
    const onChange = vi.fn();
    subscribeObsSourceState(onChange, host);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ sourceActive: null, sourceVisible: null });
  });

  it('reports unknown with no host at all (node/SSR) and unsubscribes cleanly', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeObsSourceState(onChange, null);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ sourceActive: null, sourceVisible: null });
    expect(() => unsubscribe()).not.toThrow();
  });

  it('never infers activity from the binding, the page, or a connection', () => {
    // Only an OBS report may produce `true`; everything else leaves it null.
    const { host } = fakeHost({ pluginVersion: '2.18.0', getCurrentScene: () => undefined });
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push(state), host);
    expect(states).toEqual([{ sourceActive: null, sourceVisible: null }]);
  });
});

describe('reading the events', () => {
  it('tracks active true → false, and false is reported as false, not unknown', () => {
    const { host, dispatch } = fakeHost({});
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push(state), host);
    dispatch('obsSourceActiveChanged', { active: true });
    dispatch('obsSourceActiveChanged', { active: false });
    expect(states[states.length - 1]).toEqual({ sourceActive: false, sourceVisible: null });
    expect(states.some((s) => s.sourceActive === true)).toBe(true);
  });

  it('tracks visibility independently of activity', () => {
    const { host, dispatch } = fakeHost({});
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push(state), host);
    dispatch('obsSourceVisibleChanged', { visible: true });
    dispatch('obsSourceActiveChanged', { active: true });
    expect(states[states.length - 1]).toEqual({ sourceActive: true, sourceVisible: true });
  });

  it('ignores malformed event details rather than coercing them', () => {
    const { host, dispatch } = fakeHost({});
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push(state), host);
    dispatch('obsSourceActiveChanged', { active: 'yes' });
    dispatch('obsSourceActiveChanged', null);
    dispatch('obsSourceActiveChanged', {});
    expect(states).toHaveLength(1); // only the initial unknown emit
    expect(states[0]).toEqual({ sourceActive: null, sourceVisible: null });
  });

  it('unsubscribe removes both listeners', () => {
    const { host, count } = fakeHost({});
    const unsubscribe = subscribeObsSourceState(() => undefined, host);
    expect(count()).toBe(2);
    unsubscribe();
    expect(count()).toBe(0);
  });
});

describe('the legacy callback path', () => {
  it('reports one logical transition when a build fires BOTH paths', () => {
    /**
     * Current builds dispatch events, older ones call the callbacks, and the
     * real OBS binary is the compatibility target — so both are wired. That is
     * only safe because a repeated value publishes nothing: otherwise every eye
     * toggle would be two relay POSTs.
     */
    const binding: Record<string, unknown> = {};
    const { host, dispatch } = fakeHost(binding);
    const seen: ObsSourceState[] = [];
    subscribeObsSourceState((state) => seen.push(state), host);
    seen.length = 0; // drop the initial unknown emit

    dispatch('obsSourceVisibleChanged', { visible: false });
    (binding.onVisibilityChange as (flag: boolean) => void)(false);

    expect(seen).toEqual([{ sourceActive: null, sourceVisible: false }]);
  });

  it('chains a pre-existing handler instead of refusing to install', () => {
    // The old rule — skip if the property is anything but undefined — meant a
    // placeholder from any other owner silenced LiveLayer completely.
    const calls: unknown[] = [];
    const existing = (flag: unknown) => calls.push(flag);
    const binding: Record<string, unknown> = { onVisibilityChange: existing };
    const { host } = fakeHost(binding);
    const seen: ObsSourceState[] = [];
    const stop = subscribeObsSourceState((state) => seen.push(state), host);
    seen.length = 0;

    expect(binding.onVisibilityChange).not.toBe(existing);
    (binding.onVisibilityChange as (flag: boolean) => void)(false);

    expect(calls).toEqual([false]); // the original owner still heard it
    expect(seen).toEqual([{ sourceActive: null, sourceVisible: false }]);

    stop();
    expect(binding.onVisibilityChange).toBe(existing); // and gets its slot back
  });

  it('still updates state when a chained foreign handler throws', () => {
    const binding: Record<string, unknown> = {
      onActiveChange: () => {
        throw new Error('someone else exploded');
      }
    };
    const { host } = fakeHost(binding);
    const seen: ObsSourceState[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    subscribeObsSourceState((state) => seen.push(state), host);
    seen.length = 0;

    expect(() => (binding.onActiveChange as (flag: boolean) => void)(true)).not.toThrow();
    expect(seen).toEqual([{ sourceActive: true, sourceVisible: null }]);
    warn.mockRestore();
  });

  it('removes only the handlers it installed', () => {
    const binding: Record<string, unknown> = {};
    const { host } = fakeHost(binding);
    const stop = subscribeObsSourceState(() => undefined, host);
    expect(typeof binding.onActiveChange).toBe('function');
    stop();
    expect('onActiveChange' in binding).toBe(false);
  });

  it('leaves a handler alone if something else replaced ours after install', () => {
    const binding: Record<string, unknown> = {};
    const { host } = fakeHost(binding);
    const stop = subscribeObsSourceState(() => undefined, host);
    const laterOwner = () => undefined;
    binding.onActiveChange = laterOwner;
    stop();
    expect(binding.onActiveChange).toBe(laterOwner);
  });

  it('ignores a non-boolean from a legacy callback', () => {
    const binding: Record<string, unknown> = {};
    const { host } = fakeHost(binding);
    const seen: ObsSourceState[] = [];
    subscribeObsSourceState((state) => seen.push(state), host);
    seen.length = 0;
    (binding.onActiveChange as (flag: unknown) => void)('true');
    expect(seen).toEqual([]);
  });
});

describe('a binding that arrives late', () => {
  it('acquires the legacy handlers without the page remounting', () => {
    vi.useFakeTimers();
    const { host } = fakeHost();
    const stop = subscribeObsSourceState(() => undefined, host);
    expect((host as { obsstudio?: unknown }).obsstudio).toBeUndefined();

    const binding: Record<string, unknown> = { pluginVersion: '2.18.0' };
    (host as { obsstudio?: unknown }).obsstudio = binding;
    vi.advanceTimersByTime(600);

    expect(typeof binding.onActiveChange).toBe('function');
    expect(typeof binding.onVisibilityChange).toBe('function');
    stop();
    expect('onActiveChange' in binding).toBe(false);
  });

  it('gives up waiting rather than polling for the life of the service', () => {
    vi.useFakeTimers();
    const { host } = fakeHost();
    const stop = subscribeObsSourceState(() => undefined, host);

    vi.advanceTimersByTime(60_000); // long past the bounded window
    const binding: Record<string, unknown> = {};
    (host as { obsstudio?: unknown }).obsstudio = binding;
    vi.advanceTimersByTime(5_000);

    expect('onActiveChange' in binding).toBe(false);
    // The CustomEvent path is unaffected — that is what makes stopping safe.
    stop();
  });

  it('stops waiting when unsubscribed', () => {
    vi.useFakeTimers();
    const { host } = fakeHost();
    const stop = subscribeObsSourceState(() => undefined, host);
    stop();

    const binding: Record<string, unknown> = {};
    (host as { obsstudio?: unknown }).obsstudio = binding;
    vi.advanceTimersByTime(5_000);
    expect('onActiveChange' in binding).toBe(false);
  });
});

describe('a global scene change is not source telemetry', () => {
  /**
   * `obsSceneChanged` is the ONE OBS-specific event the real rig delivers — 3
   * observed, last scene `PPC · Live` — while every source-specific event and
   * both legacy callbacks stayed silent. It is a global: it names the scene OBS
   * switched to and says nothing about whether THIS source is in that scene or
   * whether its eye is on. Deriving a reading from it would be a guess wearing
   * a measurement's clothes, and the operator would be told something no one
   * checked.
   *
   * Asserted on a PROMISCUOUS bus, which hands every dispatch to every listener
   * this module registered. A type-routed fake would pass this by declining to
   * deliver an unregistered type — true by construction of the fake, not of the
   * code, and worth nothing.
   */
  function promiscuousHost(binding: Record<string, unknown>) {
    const attached: Listener[] = [];
    const host: ObsEventHost = {
      addEventListener: (_type, listener) => {
        attached.push(listener);
      },
      removeEventListener: (_type, listener) => {
        const at = attached.indexOf(listener);
        if (at >= 0) attached.splice(at, 1);
      },
      obsstudio: binding
    };
    const dispatchToEveryone = (detail: unknown) => {
      for (const listener of [...attached]) listener({ detail } as unknown as Event);
    };
    return { host, dispatchToEveryone };
  }

  it('leaves both readings UNKNOWN, however many scenes come and go', () => {
    const { host, dispatchToEveryone } = promiscuousHost({ pluginVersion: '2.26.9' });
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push(state), host);

    dispatchToEveryone({ name: 'PPC · Live' });
    dispatchToEveryone({ name: 'Worship' });
    dispatchToEveryone({ name: 'PPC · Live' });

    // Only the initial unknown emit: no scene name became a boolean.
    expect(states).toEqual([{ sourceActive: null, sourceVisible: null }]);
  });

  it('does not record a scene change as a source event in the diagnostics either', () => {
    const { host, dispatchToEveryone } = promiscuousHost({ pluginVersion: '2.26.9' });
    const reports: ObsBridgeDiagnostics[] = [];
    subscribeObsSourceState(() => undefined, host, (d) => reports.push(d));

    dispatchToEveryone({ name: 'PPC · Live' });

    expect(reports[reports.length - 1]).toMatchObject({
      activeEvent: null,
      visibleEvent: null,
      lastPath: 'none'
    });
  });

  it('reproduces the tested rig: bridge alive, source telemetry absent, state UNKNOWN', () => {
    /**
     * obs-browser 2.26.9 on macOS, eye toggled on the Browser Source itself.
     * The binding is present and its version reads back, the global event
     * arrives, and nothing source-specific ever does. The correct outcome is
     * that both readings stay UNKNOWN — which is what keeps every control
     * surface truthfully at OUTPUT READY instead of inventing a state.
     */
    const { host, dispatchToEveryone } = promiscuousHost({ pluginVersion: '2.26.9' });
    const states: ObsSourceState[] = [];
    const reports: ObsBridgeDiagnostics[] = [];
    subscribeObsSourceState((state) => states.push(state), host, (d) => reports.push(d));

    dispatchToEveryone({ name: 'PPC · Live' });

    expect(reports[reports.length - 1]).toEqual({
      binding: 'present',
      pluginVersion: '2.26.9',
      activeEvent: null,
      visibleEvent: null,
      lastPath: 'none'
    });
    expect(states).toEqual([{ sourceActive: null, sourceVisible: null }]);
  });

  it('still reads a real source event on that same bus, so the tests above are not silent', () => {
    // Positive anchor: the promiscuous bus DOES reach this module's listeners.
    // Without it, a subscription that had stopped attaching anything would make
    // every assertion above pass for entirely the wrong reason.
    const { host, dispatchToEveryone } = promiscuousHost({ pluginVersion: '2.26.9' });
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push(state), host);

    dispatchToEveryone({ active: true });

    expect(states[states.length - 1]).toEqual({ sourceActive: true, sourceVisible: null });
  });
});

describe('the ?debug=1 diagnostics', () => {
  it('reports waiting, then present, without touching source state', () => {
    vi.useFakeTimers();
    const { host } = fakeHost();
    const reports: ObsBridgeDiagnostics[] = [];
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push(state), host, (d) => reports.push(d));

    expect(reports[0]).toEqual({
      binding: 'waiting',
      pluginVersion: null,
      activeEvent: null,
      visibleEvent: null,
      lastPath: 'none'
    });

    (host as { obsstudio?: unknown }).obsstudio = { pluginVersion: '2.18.0' };
    vi.advanceTimersByTime(600);

    expect(reports[reports.length - 1]).toMatchObject({ binding: 'present', pluginVersion: '2.18.0' });
    // Diagnostics are display-only: the readings are still unknown.
    expect(states).toEqual([{ sourceActive: null, sourceVisible: null }]);
  });

  it('names which bridge delivered the last event', () => {
    const binding: Record<string, unknown> = {};
    const { host, dispatch } = fakeHost(binding);
    const reports: ObsBridgeDiagnostics[] = [];
    subscribeObsSourceState(() => undefined, host, (d) => reports.push(d));

    dispatch('obsSourceActiveChanged', { active: true });
    expect(reports[reports.length - 1]).toMatchObject({ activeEvent: true, lastPath: 'custom' });

    (binding.onVisibilityChange as (flag: boolean) => void)(false);
    expect(reports[reports.length - 1]).toMatchObject({ visibleEvent: false, lastPath: 'legacy' });
  });

  it('records a repeated report even though the state does not publish again', () => {
    // This is the difference between "no event arrived" and "the event arrived
    // and said the same thing" — the whole point of reading it off the rig.
    const { host, dispatch } = fakeHost({});
    const reports: ObsBridgeDiagnostics[] = [];
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push(state), host, (d) => reports.push(d));
    states.length = 0;
    reports.length = 0;

    dispatch('obsSourceActiveChanged', { active: true });
    dispatch('obsSourceActiveChanged', { active: true });

    expect(states).toHaveLength(1);
    expect(reports).toHaveLength(2);
  });

  it('costs nothing when no diagnostic callback is given', () => {
    const { host, dispatch } = fakeHost({});
    const states: ObsSourceState[] = [];
    expect(() => {
      subscribeObsSourceState((state) => states.push(state), host);
      dispatch('obsSourceActiveChanged', { active: true });
    }).not.toThrow();
    expect(states[states.length - 1]).toEqual({ sourceActive: true, sourceVisible: null });
  });
});

/**
 * THE EVENT THAT ARRIVED BEFORE ANYONE WAS LISTENING.
 *
 * Reported from the field: after restarting OBS with the scene already live,
 * the desk went back to OUTPUT READY and stayed there. Nothing was wrong with
 * the scene — `obsSourceActiveChanged` fires as the source is created, which is
 * while this module is still being fetched, so the one report OBS ever sends
 * for an already-active source was dispatched to nobody.
 *
 * `index.html` now keeps it at parse time. These pin that it is read, and that
 * reading it invents nothing.
 */
describe('readings that arrived before the module did', () => {
  const hostWith = (early: unknown) => {
    const listeners = new Map<string, ((event: Event) => void)[]>();
    return {
      host: {
        __llObsSourceEarly: early,
        addEventListener: (type: string, fn: (event: Event) => void) => {
          listeners.set(type, [...(listeners.get(type) ?? []), fn]);
        },
        removeEventListener: () => {}
      } as unknown as ObsEventHost,
      fire: (type: string, detail: unknown) => {
        for (const fn of listeners.get(type) ?? []) fn({ type, detail } as unknown as Event);
      }
    };
  };

  it('opens with what OBS already reported', () => {
    const { host } = hostWith({ sourceActive: true, sourceVisible: true });
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push({ ...state }), host);
    expect(states[0]).toEqual({ sourceActive: true, sourceVisible: true });
  });

  it('carries a hidden reading through too', () => {
    const { host } = hostWith({ sourceActive: true, sourceVisible: false });
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push({ ...state }), host);
    expect(states[0]).toEqual({ sourceActive: true, sourceVisible: false });
  });

  it('invents nothing from a buffer that says nothing', () => {
    // The rule the rest of this module lives by: absence is UNKNOWN, and the
    // buffer's mere existence is not a reading.
    for (const early of [undefined, null, {}, 'nonsense', { sourceActive: 'yes' }, { sourceActive: 1 }]) {
      const { host } = hostWith(early);
      const states: ObsSourceState[] = [];
      subscribeObsSourceState((state) => states.push({ ...state }), host);
      expect(states[0], JSON.stringify(early)).toEqual({ sourceActive: null, sourceVisible: null });
    }
  });

  it('lets a later event overrule what it opened with', () => {
    // The buffer is a starting point, not a latch: the source going inactive
    // after the page loaded must still be reported.
    const { host, fire } = hostWith({ sourceActive: true, sourceVisible: true });
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push({ ...state }), host);
    fire('obsSourceActiveChanged', { active: false });
    expect(states[states.length - 1].sourceActive).toBe(false);
  });

  it('does not re-announce a value it already opened with', () => {
    // The module drops non-changes; seeding must not defeat that, or every
    // duplicate event would post another OUTPUT_STATUS to the relay.
    const { host, fire } = hostWith({ sourceActive: true, sourceVisible: true });
    const states: ObsSourceState[] = [];
    subscribeObsSourceState((state) => states.push({ ...state }), host);
    const before = states.length;
    fire('obsSourceActiveChanged', { active: true });
    expect(states.length).toBe(before);
  });
});

/** The parse-time listener is in a file no bundler rewrites — pin it there. */
describe('the parse-time listener', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

  it('runs before the module that would otherwise miss the event', () => {
    expect(html.indexOf('__llObsSourceEarly')).toBeLessThan(html.indexOf('src/main.tsx'));
  });

  it('listens for both readings and believes only booleans', () => {
    expect(html).toContain("addEventListener('obsSourceActiveChanged'");
    expect(html).toContain("addEventListener('obsSourceVisibleChanged'");
    expect(html).toContain("typeof value === 'boolean'");
  });

  it('is inline, because anything imported is too late', () => {
    expect(html).toMatch(/<script>\s*\n\s*\(function \(\)/);
  });
});
