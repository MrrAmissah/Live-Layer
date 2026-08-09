import { describe, expect, it, vi } from 'vitest';
import {
  subscribeObsHostDiagnostics,
  type ObsHostDiagnostics,
  type VisibilityDocument
} from './obsHostDiagnostics';
import {
  subscribeObsSourceState,
  type ObsBridgeDiagnostics,
  type ObsEventHost,
  type ObsSourceState
} from './obsSource';

/**
 * The host-signal diagnostic, which exists to answer one question about the
 * real rig: does OBS 2.26.9 deliver ANY signal to this page while its
 * source-specific bridge stays silent?
 *
 * Two things are pinned here, and the second is the important one:
 *
 *  1. The evidence survives the source coming back. The chip is read after the
 *     eye goes on again, so a live `visibilityState` alone proves nothing —
 *     the counters and the sticky `hiddenSeen` are what distinguish a delivered
 *     hide from a dead build.
 *  2. It cannot move source state. That is asserted on a SHARED event bus, not
 *     by dispatching into a fake that was never wired for the type — a fake
 *     that routes only registered types would pass by construction and prove
 *     nothing, which is exactly how a vacuous expectation gets written.
 */

type Listener = (event: Event) => void;

/**
 * One object serving as window AND document, so both subscriptions genuinely
 * share a bus: an event dispatched here reaches every listener registered for
 * that type, whichever module registered it.
 */
function fakeBus(binding?: Record<string, unknown>) {
  const listeners = new Map<string, Set<Listener>>();
  const bus = {
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
    hidden: false as unknown,
    visibilityState: 'visible' as unknown,
    ...(binding ? { obsstudio: binding } : {})
  };
  const dispatch = (type: string, detail?: unknown) => {
    for (const listener of [...(listeners.get(type) ?? [])]) {
      listener({ detail } as unknown as Event);
    }
  };
  const count = () => [...listeners.values()].reduce((n, set) => n + set.size, 0);
  return { bus, dispatch, count };
}

function hosts(bus: ReturnType<typeof fakeBus>['bus']) {
  return { win: bus, doc: bus as unknown as VisibilityDocument };
}

describe('the initial reading', () => {
  it('reports the visibility state that is already true at subscribe', () => {
    const { bus } = fakeBus();
    const reports: ObsHostDiagnostics[] = [];
    subscribeObsHostDiagnostics((d) => reports.push(d), hosts(bus));

    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual({
      visibilityState: 'visible',
      hidden: false,
      visibilityChanges: 0,
      hiddenSeen: false,
      lastVisibilityChangeAt: null,
      sceneEvents: 0,
      lastSceneName: null,
      lastSceneDetailKeys: null
    });
  });

  it('records a page that was already hidden before this page mounted', () => {
    // A source hidden at OBS start-up would otherwise look like a source that
    // was never hidden at all, and the count alone could not tell them apart.
    const { bus } = fakeBus();
    bus.hidden = true;
    bus.visibilityState = 'hidden';
    const reports: ObsHostDiagnostics[] = [];
    subscribeObsHostDiagnostics((d) => reports.push(d), hosts(bus));

    expect(reports[0]).toMatchObject({ visibilityState: 'hidden', hidden: true, hiddenSeen: true });
  });

  it('reports unknown rather than guessing when there is no document (node/SSR)', () => {
    const reports: ObsHostDiagnostics[] = [];
    const stop = subscribeObsHostDiagnostics((d) => reports.push(d), { win: null, doc: null });

    expect(reports[0]).toMatchObject({ visibilityState: null, hidden: null, hiddenSeen: false });
    expect(() => stop()).not.toThrow();
  });

  it('reads a non-boolean hidden as unknown instead of coercing it', () => {
    const { bus } = fakeBus();
    bus.hidden = 'true';
    bus.visibilityState = 7;
    const reports: ObsHostDiagnostics[] = [];
    subscribeObsHostDiagnostics((d) => reports.push(d), hosts(bus));

    expect(reports[0]).toMatchObject({ visibilityState: null, hidden: null, hiddenSeen: false });
  });
});

describe('visibilitychange', () => {
  it('counts every arrival and stamps the last one', () => {
    const { bus, dispatch } = fakeBus();
    const reports: ObsHostDiagnostics[] = [];
    const clock = vi.fn(() => 1_700_000_000_000);
    subscribeObsHostDiagnostics((d) => reports.push(d), hosts(bus), clock);

    bus.hidden = true;
    bus.visibilityState = 'hidden';
    dispatch('visibilitychange');

    expect(reports[reports.length - 1]).toMatchObject({
      visibilityState: 'hidden',
      hidden: true,
      visibilityChanges: 1,
      hiddenSeen: true,
      lastVisibilityChangeAt: 1_700_000_000_000
    });
  });

  it('keeps hiddenSeen after the source comes back, which is the whole point', () => {
    // The rig is read AFTER the eye goes on again. If the evidence did not
    // survive that, a delivered hide and a silent build would look identical.
    const { bus, dispatch } = fakeBus();
    const reports: ObsHostDiagnostics[] = [];
    subscribeObsHostDiagnostics((d) => reports.push(d), hosts(bus));

    bus.hidden = true;
    bus.visibilityState = 'hidden';
    dispatch('visibilitychange');
    bus.hidden = false;
    bus.visibilityState = 'visible';
    dispatch('visibilitychange');

    const last = reports[reports.length - 1];
    expect(last).toMatchObject({ visibilityState: 'visible', hidden: false });
    expect(last.hiddenSeen).toBe(true);
    expect(last.visibilityChanges).toBe(2);
  });

  it('leaves hiddenSeen false when the page never actually hid', () => {
    // The negative result has to be readable too, or every rig run "confirms".
    const { bus, dispatch } = fakeBus();
    const reports: ObsHostDiagnostics[] = [];
    subscribeObsHostDiagnostics((d) => reports.push(d), hosts(bus));

    dispatch('visibilitychange');
    dispatch('visibilitychange');

    expect(reports[reports.length - 1]).toMatchObject({ visibilityChanges: 2, hiddenSeen: false });
  });
});

describe('obsSceneChanged', () => {
  it('counts the event and names the scene', () => {
    const { bus, dispatch } = fakeBus();
    const reports: ObsHostDiagnostics[] = [];
    subscribeObsHostDiagnostics((d) => reports.push(d), hosts(bus));

    dispatch('obsSceneChanged', { name: 'Worship' });

    expect(reports[reports.length - 1]).toMatchObject({
      sceneEvents: 1,
      lastSceneName: 'Worship',
      lastSceneDetailKeys: null
    });
  });

  it('separates "arrived, shaped differently" from "never arrived"', () => {
    // If this build reads the wrong key, the keys OBS DID send are the finding.
    // Reporting that as a null name would read as silence and end the enquiry.
    const { bus, dispatch } = fakeBus();
    const reports: ObsHostDiagnostics[] = [];
    subscribeObsHostDiagnostics((d) => reports.push(d), hosts(bus));

    dispatch('obsSceneChanged', { sceneName: 'Worship', width: 1920 });

    expect(reports[reports.length - 1]).toMatchObject({
      sceneEvents: 1,
      lastSceneName: null,
      lastSceneDetailKeys: ['sceneName', 'width']
    });
  });

  it('still counts an event that carries no detail at all', () => {
    const { bus, dispatch } = fakeBus();
    const reports: ObsHostDiagnostics[] = [];
    subscribeObsHostDiagnostics((d) => reports.push(d), hosts(bus));

    dispatch('obsSceneChanged');

    expect(reports[reports.length - 1]).toMatchObject({
      sceneEvents: 1,
      lastSceneName: null,
      lastSceneDetailKeys: null
    });
  });

  it('does not let a consumer mutate the recorded keys', () => {
    const { bus, dispatch } = fakeBus();
    const reports: ObsHostDiagnostics[] = [];
    subscribeObsHostDiagnostics((d) => reports.push(d), hosts(bus));

    dispatch('obsSceneChanged', { sceneName: 'Worship' });
    reports[reports.length - 1].lastSceneDetailKeys?.push('injected');
    dispatch('obsSceneChanged', { sceneName: 'Worship' });

    expect(reports[reports.length - 1].lastSceneDetailKeys).toEqual(['sceneName']);
  });
});

describe('cleanup', () => {
  it('removes both listeners and stops reporting', () => {
    const { bus, dispatch, count } = fakeBus();
    const reports: ObsHostDiagnostics[] = [];
    const stop = subscribeObsHostDiagnostics((d) => reports.push(d), hosts(bus));
    expect(count()).toBe(2);

    stop();
    expect(count()).toBe(0);

    reports.length = 0;
    dispatch('visibilitychange');
    dispatch('obsSceneChanged', { name: 'Worship' });
    expect(reports).toEqual([]);
  });
});

describe('the boundary this diagnostic must not cross', () => {
  it('cannot move source state or its bridge diagnostics, on one shared bus', () => {
    /**
     * Both subscriptions are given the SAME event target, so every event really
     * is offered to both. The assertion is that the source bridge stayed at
     * UNKNOWN through a hide, a show and a scene change — page visibility is
     * not source visibility, and this pass may not quietly make it so.
     *
     * This goes red the moment anyone wires `visibilitychange` or
     * `obsSceneChanged` into `sourceVisible`/`sourceActive`.
     */
    const { bus, dispatch } = fakeBus({ pluginVersion: '2.26.9' });
    const states: ObsSourceState[] = [];
    const bridge: ObsBridgeDiagnostics[] = [];
    subscribeObsSourceState(
      (state) => states.push(state),
      bus as unknown as ObsEventHost,
      (d) => bridge.push(d)
    );
    subscribeObsHostDiagnostics(() => undefined, hosts(bus));

    bus.hidden = true;
    dispatch('visibilitychange');
    dispatch('obsSceneChanged', { name: 'Worship' });
    bus.hidden = false;
    dispatch('visibilitychange');

    // Exactly the one initial unknown emit: no OUTPUT_STATUS-bearing change.
    expect(states).toEqual([{ sourceActive: null, sourceVisible: null }]);
    expect(bridge[bridge.length - 1]).toMatchObject({
      activeEvent: null,
      visibleEvent: null,
      lastPath: 'none'
    });
  });

  it('reports the host signals on that same bus, so the test above is not silent', () => {
    // Positive anchor for the boundary test: the events it dispatches DO reach
    // the diagnostic. Without this, a diagnostic that had stopped listening
    // entirely would make the boundary assertion pass for the wrong reason.
    const { bus, dispatch } = fakeBus({ pluginVersion: '2.26.9' });
    const reports: ObsHostDiagnostics[] = [];
    subscribeObsSourceState(() => undefined, bus as unknown as ObsEventHost);
    subscribeObsHostDiagnostics((d) => reports.push(d), hosts(bus));

    bus.hidden = true;
    dispatch('visibilitychange');
    dispatch('obsSceneChanged', { name: 'Worship' });

    expect(reports[reports.length - 1]).toMatchObject({
      visibilityChanges: 1,
      hiddenSeen: true,
      sceneEvents: 1,
      lastSceneName: 'Worship'
    });
  });
});
