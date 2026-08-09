/**
 * The HOST's own signals, watched for diagnosis and nothing else.
 *
 * `lib/obsSource.ts` reads OBS's SOURCE-SPECIFIC bridge — the one that answers
 * "is this source in the program scene" and "is its eye on". On the real rig
 * (OBS Browser 2.26.9, macOS) that bridge is silent: the binding is present and
 * its `pluginVersion` reads back, yet toggling this source's own eye removes it
 * from the canvas without ever producing an `obsSourceVisibleChanged`, and
 * switching scenes produces no `obsSourceActiveChanged`. Every control surface
 * therefore sits truthfully at OUTPUT READY, because nothing ever reported
 * otherwise. Adding more callback names guesses; this measures instead.
 *
 * Two other signals can say whether ANYTHING is arriving:
 *
 *  - obs-browser's `SetShowing` also drives the embedded page's own visibility,
 *    so a build whose source-event path is dead may still deliver the standard
 *    `visibilitychange`.
 *  - `obsSceneChanged` is a GLOBAL OBS event. If it arrives while the
 *    source-specific ones do not, the fault is in the source-event path — not
 *    in the binding, not in the page, not in the listener.
 *
 * DISPLAY ONLY, and structurally so. This lives outside `lib/obsSource.ts` on
 * purpose: it has no path into `ObsSourceState`, it transmits nothing, it
 * imports nothing, and it is subscribed only under `/output?debug=1`. In
 * particular `document.hidden` does NOT mean SOURCE HIDDEN here. That inference
 * needs the evidence this module exists to collect — it may not assume it.
 *
 * WHY COUNTERS AND A STICKY FLAG, NOT JUST THE LIVE READING. The chip can only
 * be read once the source is back on canvas, and by then `visibilityState` has
 * returned to `visible` in BOTH the working and the dead case. Only evidence
 * that survives the source coming back can tell them apart: how many events
 * arrived, whether `hidden` was ever observed true, and when the last one
 * landed. A live reading alone would make a successful toggle and a silent
 * build look identical.
 *
 * The hosts are injectable so this is testable in this repo's node test
 * environment, where there is no `window` and no `document` at all.
 */
export interface ObsHostDiagnostics {
  /** Live at publish time; `null` when there is no document to read. */
  visibilityState: string | null;
  hidden: boolean | null;
  /** How many `visibilitychange` events have arrived. */
  visibilityChanges: number;
  /** Sticky: has `document.hidden === true` EVER been observed? The finding. */
  hiddenSeen: boolean;
  /** Epoch ms of the last `visibilitychange`; `null` = none has arrived. */
  lastVisibilityChangeAt: number | null;
  /** How many `obsSceneChanged` events have arrived. */
  sceneEvents: number;
  /** The name from the last one; `null` when the detail carried no string name. */
  lastSceneName: string | null;
  /**
   * The keys the last scene detail DID carry, when no readable name was among
   * them. A key this build does not expect must not be reported as silence —
   * "arrived, shaped differently" and "never arrived" are opposite findings.
   */
  lastSceneDetailKeys: string[] | null;
}

export interface DiagnosticEventTarget {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  removeEventListener: (type: string, listener: (event: Event) => void) => void;
}

export interface VisibilityDocument extends DiagnosticEventTarget {
  visibilityState?: unknown;
  hidden?: unknown;
}

/** `obsSceneChanged` is dispatched on the window; `visibilitychange` on the document. */
export interface ObsHostDiagnosticsHost {
  win: DiagnosticEventTarget | null;
  doc: VisibilityDocument | null;
}

function defaultHost(): ObsHostDiagnosticsHost {
  return {
    win: typeof window === 'undefined' ? null : (window as unknown as DiagnosticEventTarget),
    doc: typeof document === 'undefined' ? null : (document as unknown as VisibilityDocument)
  };
}

function readSceneDetail(event: Event): { name: string | null; keys: string[] | null } {
  const detail = (event as { detail?: unknown }).detail;
  if (typeof detail !== 'object' || detail === null) return { name: null, keys: null };
  const name = (detail as Record<string, unknown>).name;
  if (typeof name === 'string') return { name, keys: null };
  return { name: null, keys: Object.keys(detail as Record<string, unknown>) };
}

/**
 * Watch the host's browser-visibility and global OBS scene signals. Publishes
 * once immediately (so the initial state is on record even if nothing ever
 * fires) and again on every arrival. Returns an unsubscribe that removes
 * exactly what this installed.
 */
export function subscribeObsHostDiagnostics(
  onDiagnostics: (diagnostics: ObsHostDiagnostics) => void,
  host: ObsHostDiagnosticsHost = defaultHost(),
  now: () => number = () => Date.now()
): () => void {
  const seen = {
    visibilityChanges: 0,
    hiddenSeen: false,
    lastVisibilityChangeAt: null as number | null,
    sceneEvents: 0,
    lastSceneName: null as string | null,
    lastSceneDetailKeys: null as string[] | null
  };

  const readHidden = (): boolean | null => {
    const value = host.doc?.hidden;
    return typeof value === 'boolean' ? value : null;
  };

  // Reading `hidden` at every opportunity, not only inside the event, is what
  // makes a hide that happened before this page finished mounting still count.
  const noteHidden = () => {
    if (readHidden() === true) seen.hiddenSeen = true;
  };

  const publish = () => {
    const state = host.doc?.visibilityState;
    onDiagnostics({
      visibilityState: typeof state === 'string' ? state : null,
      hidden: readHidden(),
      visibilityChanges: seen.visibilityChanges,
      hiddenSeen: seen.hiddenSeen,
      lastVisibilityChangeAt: seen.lastVisibilityChangeAt,
      sceneEvents: seen.sceneEvents,
      lastSceneName: seen.lastSceneName,
      lastSceneDetailKeys: seen.lastSceneDetailKeys ? [...seen.lastSceneDetailKeys] : null
    });
  };

  noteHidden();
  publish();

  const onVisibilityChange = () => {
    seen.visibilityChanges += 1;
    seen.lastVisibilityChangeAt = now();
    noteHidden();
    publish();
  };

  const onSceneChange = (event: Event) => {
    // Counted first: that the event arrived at all is the answer being sought,
    // and it stays true whatever shape its detail turns out to have.
    seen.sceneEvents += 1;
    const detail = readSceneDetail(event);
    seen.lastSceneName = detail.name;
    seen.lastSceneDetailKeys = detail.keys;
    publish();
  };

  host.doc?.addEventListener('visibilitychange', onVisibilityChange);
  host.win?.addEventListener('obsSceneChanged', onSceneChange);

  return () => {
    host.doc?.removeEventListener('visibilitychange', onVisibilityChange);
    host.win?.removeEventListener('obsSceneChanged', onSceneChange);
  };
}
