/**
 * The official OBS Browser Source JS binding, read defensively.
 *
 * OBS injects `window.obsstudio` into pages it hosts and dispatches
 * `obsSourceActiveChanged` / `obsSourceVisibleChanged` CustomEvents on
 * `window` (active = the source is in the program scene; visible = the eye
 * icon). That is the entire integration surface used here: no obs-websocket,
 * no credentials, no control channel back into OBS.
 *
 * Truthfulness rules, in order of importance:
 *  - No binding → both readings are `null` (UNKNOWN). A plain browser tab must
 *    never be reported as active OR inactive.
 *  - With a binding, a reading stays `null` until OBS actually dispatches the
 *    event — presence of the binding alone proves hosting, not activity.
 *  - A malformed event detail is ignored, never coerced into a boolean.
 *
 * `host` is injectable so the subscription is testable in this repo's node
 * test environment (no DOM) and so a fake `obsstudio` can be supplied.
 */
export interface ObsSourceState {
  sourceActive: boolean | null;
  sourceVisible: boolean | null;
}

export interface ObsEventHost {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  removeEventListener: (type: string, listener: (event: Event) => void) => void;
  obsstudio?: unknown;
}

function defaultHost(): ObsEventHost | null {
  if (typeof window === 'undefined') return null;
  return window as unknown as ObsEventHost;
}

function eventFlag(event: Event, key: 'active' | 'visible'): boolean | null {
  const detail = (event as { detail?: unknown }).detail;
  if (typeof detail !== 'object' || detail === null) return null;
  const value = (detail as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : null;
}

/**
 * Subscribe to the binding's source-state events. Emits the initial (unknown)
 * state once, then again on every accepted change. Returns an unsubscribe.
 */
export function subscribeObsSourceState(
  onChange: (state: ObsSourceState) => void,
  host: ObsEventHost | null = defaultHost()
): () => void {
  const state: ObsSourceState = { sourceActive: null, sourceVisible: null };
  onChange({ ...state });

  // Without the binding there will never be an event to hear; stay UNKNOWN.
  if (!host || !host.obsstudio) return () => undefined;

  /**
   * Emit only when a reading actually changes. Both the CustomEvent listeners
   * and the legacy callbacks below can report the same transition, and the real
   * OBS build — not the spec — is the compatibility target, so the two paths are
   * allowed to overlap and this is what makes that safe.
   */
  const publish = () => onChange({ ...state });
  const setActive = (active: boolean | null) => {
    if (active === null || state.sourceActive === active) return;
    state.sourceActive = active;
    publish();
  };
  const setVisible = (visible: boolean | null) => {
    if (visible === null || state.sourceVisible === visible) return;
    state.sourceVisible = visible;
    publish();
  };

  const onActive = (event: Event) => setActive(eventFlag(event, 'active'));
  const onVisible = (event: Event) => setVisible(eventFlag(event, 'visible'));

  host.addEventListener('obsSourceActiveChanged', onActive);
  host.addEventListener('obsSourceVisibleChanged', onVisible);

  /**
   * Legacy callbacks, installed defensively and only where nothing is already
   * assigned — older obs-browser builds delivered these instead of the events.
   * Assigning over an existing handler would break whoever owns it, so we do
   * not; and because both paths funnel through the de-duplicating setters, a
   * build that fires BOTH reports the transition once.
   */
  const binding = host.obsstudio as Record<string, unknown>;
  const installedLegacy: string[] = [];
  const legacy: [string, (flag: boolean | null) => void][] = [
    ['onActiveChange', setActive],
    ['onVisibilityChange', setVisible]
  ];
  for (const [key, apply] of legacy) {
    if (binding[key] !== undefined) continue;
    binding[key] = (flag: unknown) => apply(typeof flag === 'boolean' ? flag : null);
    installedLegacy.push(key);
  }

  return () => {
    host.removeEventListener('obsSourceActiveChanged', onActive);
    host.removeEventListener('obsSourceVisibleChanged', onVisible);
    // Only remove what we installed; never clear a handler we did not set.
    for (const key of installedLegacy) delete binding[key];
  };
}
