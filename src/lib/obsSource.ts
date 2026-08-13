/**
 * The official OBS Browser Source JS binding, read defensively.
 *
 * OBS injects `window.obsstudio` into pages it hosts and dispatches
 * `obsSourceActiveChanged` / `obsSourceVisibleChanged` CustomEvents on
 * `window` (active = the source is in the program scene; visible = the eye
 * icon). Older builds delivered `obsstudio.onActiveChange` /
 * `onVisibilityChange` callbacks instead. That is the entire integration
 * surface used here: no obs-websocket, no credentials, no control channel back
 * into OBS.
 *
 * **Listening never depends on the binding being present.** An earlier version
 * returned before attaching anything when `window.obsstudio` was missing at the
 * instant the React effect ran, so a binding that arrived a moment later could
 * never be noticed: no listener, no recovery, both readings `null` forever, and
 * every control surface stuck on OUTPUT READY through a real service. In an
 * embedded CEF host, "not there yet" is not the same as "not coming".
 *
 * Truthfulness rules, in order of importance:
 *  - A reading stays `null` (UNKNOWN) until OBS actually reports it. Neither the
 *    binding's presence, nor the page having rendered, nor a relay connection
 *    may be turned into `sourceActive: true`. A fresh Browser Source legitimately
 *    sits at OUTPUT READY until OBS says otherwise.
 *  - A malformed event detail is ignored, never coerced into a boolean.
 *  - The two delivery paths overlap by design, so a build that fires BOTH
 *    reports one logical transition, not two.
 *
 * An `obsSourceActiveChanged` event is itself proof of an OBS host — stronger
 * proof than the object's presence — so an arriving event is believed on its
 * own terms. Whether the binding was also present is recorded in the
 * diagnostics instead, where it can be read off `/output?debug=1` rather than
 * silently changing what the operator is told.
 *
 * WHAT THE TESTED RIG SHOWED, and why this module still ends at UNKNOWN there.
 * On obs-browser 2.26.9 / macOS, with the Browser Source's own eye toggled: the
 * binding was present, its `pluginVersion` read back, and the GLOBAL
 * `obsSceneChanged` arrived (3 events, last scene `PPC · Live`) — while
 * `obsSourceActiveChanged`, `obsSourceVisibleChanged`, both legacy callbacks and
 * even the page's own `visibilitychange` never did. The general JS bridge works
 * there; source-specific telemetry does not. That is a finding about that
 * configuration, not a claim about obs-browser at large.
 *
 * The correct outcome is the one this module already produces: both readings
 * stay UNKNOWN, and every control surface sits truthfully at OUTPUT READY —
 * "the output page received and applied the graphic", which the page proves by
 * itself. OUTPUT ACTIVE / SOURCE HIDDEN / SOURCE INACTIVE are opportunistic: a
 * real source-specific reading produces them, and nothing else may. A scene
 * name says which scene OBS switched to, never whether THIS source is in it, so
 * it is diagnostics only (`lib/obsHostDiagnostics.ts`) and cannot reach here.
 *
 * `host` is injectable so the subscription is testable in this repo's node test
 * environment (no DOM) and so a fake `obsstudio` can be supplied.
 */
export interface ObsSourceState {
  sourceActive: boolean | null;
  sourceVisible: boolean | null;
}

/** Display-only. Never sent over the wire, never part of Program truth. */
export interface ObsBridgeDiagnostics {
  binding: 'present' | 'waiting';
  pluginVersion: string | null;
  /** `null` = no such event has arrived yet. */
  activeEvent: boolean | null;
  visibleEvent: boolean | null;
  lastPath: 'custom' | 'legacy' | 'none';
}

export interface ObsEventHost {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  removeEventListener: (type: string, listener: (event: Event) => void) => void;
  obsstudio?: unknown;
  /**
   * What OBS said BEFORE this module could listen — filled by the inline script
   * in `index.html`. See `earlyReadings` below for why it has to exist.
   */
  __llObsSourceEarly?: unknown;
}

type DeliveryPath = 'custom' | 'legacy';

/**
 * Compatibility support only: the CustomEvent path is already listening from
 * the first tick, so this exists solely to hand the legacy callbacks to a
 * binding that shows up late. Bounded — an OBS Browser Source injects the
 * binding at page creation, so if it has not appeared within this window it is
 * not that kind of host, and a page sharing a CPU with an encoder must not keep
 * checking forever.
 */
const LATE_BINDING_INTERVAL_MS = 500;
const LATE_BINDING_ATTEMPTS = 40; // 20 seconds

const LEGACY_KEYS = ['onActiveChange', 'onVisibilityChange'] as const;

function defaultHost(): ObsEventHost | null {
  if (typeof window === 'undefined') return null;
  return window as unknown as ObsEventHost;
}

/**
 * The readings OBS reported before this module existed.
 *
 * THE BUG THIS FIXES. `obsSourceActiveChanged` fires when a source becomes
 * active, and on an OBS restart that happens as the page is created — while
 * this module is still being fetched. The event was dispatched to nobody, the
 * reading stayed UNKNOWN, and the desk sat at OUTPUT READY through a live scene
 * until an operator switched scenes and back. The scene WAS live; nothing was
 * wrong except that the one report had already been thrown away.
 *
 * The parse-time listener in `index.html` keeps it. This reads it once, on
 * subscribe, and applies the same rule as every other path here: a value is
 * believed only if OBS actually sent a boolean. Nothing is inferred from the
 * buffer's existence, and an absent or malformed buffer leaves both readings
 * UNKNOWN exactly as before.
 */
function earlyReadings(host: ObsEventHost | null): Partial<ObsSourceState> {
  const buffer = host?.__llObsSourceEarly;
  if (typeof buffer !== 'object' || buffer === null) return {};
  const record = buffer as Record<string, unknown>;
  const reading: Partial<ObsSourceState> = {};
  if (typeof record.sourceActive === 'boolean') reading.sourceActive = record.sourceActive;
  if (typeof record.sourceVisible === 'boolean') reading.sourceVisible = record.sourceVisible;
  return reading;
}

function eventFlag(event: Event, key: 'active' | 'visible'): boolean | null {
  const detail = (event as { detail?: unknown }).detail;
  if (typeof detail !== 'object' || detail === null) return null;
  const value = (detail as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : null;
}

/**
 * Subscribe to the binding's source-state events. Emits the initial (unknown)
 * state once, then again on every accepted *change*. `onDiagnostics`, if given,
 * additionally reports every arriving event and the binding's appearance — pass
 * it only for `?debug=1`, so normal output does no extra work. Returns an
 * unsubscribe that removes exactly what this installed and nothing else.
 */
export function subscribeObsSourceState(
  onChange: (state: ObsSourceState) => void,
  host: ObsEventHost | null = defaultHost(),
  onDiagnostics?: (diagnostics: ObsBridgeDiagnostics) => void
): () => void {
  // Seeded from whatever OBS reported before this module could listen. An
  // arriving event still wins later; this only stops the first one being lost.
  const early = earlyReadings(host);
  const state: ObsSourceState = {
    sourceActive: early.sourceActive ?? null,
    sourceVisible: early.sourceVisible ?? null
  };
  const seen = {
    active: early.sourceActive ?? null,
    visible: early.sourceVisible ?? null,
    lastPath: 'none' as ObsBridgeDiagnostics['lastPath']
  };

  // Read live every time: a binding captured once at subscribe would defeat the
  // late-binding support this whole module exists for.
  const binding = (): Record<string, unknown> | null => {
    const value = host?.obsstudio;
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  };

  const publishDiagnostics = () => {
    if (!onDiagnostics) return;
    const current = binding();
    const version = current?.pluginVersion;
    onDiagnostics({
      binding: current ? 'present' : 'waiting',
      pluginVersion: typeof version === 'string' ? version : null,
      activeEvent: seen.active,
      visibleEvent: seen.visible,
      lastPath: seen.lastPath
    });
  };

  onChange({ ...state });
  publishDiagnostics();

  // No window at all (node/SSR): there is nothing to listen to, and nothing
  // will ever arrive. Everything stays UNKNOWN, which is the truth.
  if (!host) return () => undefined;

  /**
   * Emit only when a reading actually changes, so the CustomEvent and legacy
   * paths reporting the same transition publish once — each publish is a relay
   * POST. Diagnostics still record every arrival, which is how `?debug=1` can
   * show that a bridge is delivering even when the value did not move.
   */
  const apply = (key: 'active' | 'visible', flag: boolean | null, path: DeliveryPath) => {
    if (flag === null) return; // malformed: ignored, never coerced
    seen[key] = flag;
    seen.lastPath = path;
    const field = key === 'active' ? 'sourceActive' : 'sourceVisible';
    if (state[field] !== flag) {
      state[field] = flag;
      onChange({ ...state });
    }
    publishDiagnostics();
  };

  const onActiveEvent = (event: Event) => apply('active', eventFlag(event, 'active'), 'custom');
  const onVisibleEvent = (event: Event) => apply('visible', eventFlag(event, 'visible'), 'custom');

  host.addEventListener('obsSourceActiveChanged', onActiveEvent);
  host.addEventListener('obsSourceVisibleChanged', onVisibleEvent);

  /**
   * Legacy callbacks. obs-browser expects the page to assign these, and a build
   * that uses them will call whatever is on the property — so refusing to touch
   * an occupied slot (the previous behaviour) meant a placeholder installed by
   * anything else silenced LiveLayer entirely. Chain instead: call the previous
   * handler first so its owner keeps working, then read our own value.
   */
  type Installed = { key: string; ours: (flag: unknown) => void; previous: unknown; hadOwn: boolean };
  const installed: Installed[] = [];

  const installLegacy = (): boolean => {
    const current = binding();
    if (!current) return false;
    for (const key of LEGACY_KEYS) {
      if (installed.some((entry) => entry.key === key)) continue;
      const previous = current[key];
      const hadOwn = Object.prototype.hasOwnProperty.call(current, key);
      const field = key === 'onActiveChange' ? 'active' : 'visible';
      const ours = (flag: unknown) => {
        if (typeof previous === 'function') {
          // A foreign handler that throws must not cost us the state update.
          try {
            (previous as (value: unknown) => void).call(current, flag);
          } catch (error) {
            console.warn('[LiveLayer] an existing OBS callback threw; continuing', error);
          }
        }
        apply(field, typeof flag === 'boolean' ? flag : null, 'legacy');
      };
      current[key] = ours;
      installed.push({ key, ours, previous, hadOwn });
    }
    return true;
  };

  let lateBindingTimer: ReturnType<typeof setInterval> | null = null;
  const stopWaiting = () => {
    if (lateBindingTimer === null) return;
    clearInterval(lateBindingTimer);
    lateBindingTimer = null;
  };

  if (!installLegacy()) {
    let attempts = 0;
    lateBindingTimer = setInterval(() => {
      attempts += 1;
      if (installLegacy()) {
        stopWaiting();
        publishDiagnostics(); // the binding appeared; say so on ?debug=1
        return;
      }
      if (attempts >= LATE_BINDING_ATTEMPTS) stopWaiting();
    }, LATE_BINDING_INTERVAL_MS);
  }

  return () => {
    host.removeEventListener('obsSourceActiveChanged', onActiveEvent);
    host.removeEventListener('obsSourceVisibleChanged', onVisibleEvent);
    stopWaiting();
    const current = binding();
    if (!current) return;
    for (const entry of installed) {
      // Restore by identity: if something replaced our handler after we
      // installed it, that owner is now responsible and we leave it alone.
      if (current[entry.key] !== entry.ours) continue;
      if (entry.hadOwn) current[entry.key] = entry.previous;
      else delete current[entry.key];
    }
  };
}

/**
 * Is this page hosted by OBS at all?
 *
 * NOT a source reading, and it must never become one — the truthfulness rules
 * at the top of this module still hold, and the binding's presence is exactly
 * the thing they forbid turning into `sourceActive: true`.
 *
 * What it is for is telling two identical-looking states apart. Both report
 * UNKNOWN and both land the desk on OUTPUT READY, and only one of them is
 * worth a second thought:
 *
 *  - a plain browser tab, which cannot measure a source and never will;
 *  - an OBS Browser Source whose build does not send source-specific events,
 *    which the tested rig genuinely did (see the module comment).
 *
 * Without this the operator sees OUTPUT READY on a live scene and has no way to
 * know whether they are looking at a rig limitation or a fault. That ambiguity
 * is what makes a correct reading feel like a bug.
 *
 * An arriving event is stronger proof than the object's presence, so a page
 * that has ever received one counts as hosted even if the binding is missing.
 */
export function obsHostPresent(host: ObsEventHost | null = defaultHost()): boolean {
  if (!host) return false;
  if (host.obsstudio !== undefined && host.obsstudio !== null) return true;
  const early = earlyReadings(host);
  return early.sourceActive !== undefined || early.sourceVisible !== undefined;
}
