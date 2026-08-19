import { useCallback, useEffect, useRef, useState } from 'react';
import { importPeople } from '../lib/people/peopleStore';
import { GOSPEL_BAND_PEOPLE } from '../lib/people/gospelBands';
import { NCC_CHOIR_PEOPLE } from '../lib/people/nccChoirs';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { buildInstanceFromDraft, useLiveLayerStore, type ProgramSource } from '../store/useLiveLayerStore';
import { createRealtimeChannel, createMessage, publishCommand } from '../lib/realtime';
import { resolveClearOutcome, resolveTakeOutcome } from '../lib/takeOutcome';
import { resolveGraphicReadiness } from '../lib/graphicReadiness';
import { getServiceContext, stampServiceContext } from '../lib/serviceContext';
import { useMediaQuery } from '../lib/useMediaQuery';
import {
  getActiveRundownId,
  getRundown,
  getSelectedItem,
  setActiveItem,
  setSelectedItem,
  cloneRundownGraphic
} from '../lib/rundown/rundownStore';
import { planTakeNext } from '../lib/rundown/takeNext';
import { sceneLabelFor } from '../lib/rundown/sceneCue';
import { isTakeNextShortcut } from '../lib/takeNextShortcut';
import type { GraphicInstance, TemplateDefinition } from '../types/graphics';
import type { LayoutSettings } from '../types/layout';
import type { LastAction } from '../components/control/StatusBadge';
import ControlShell from '../components/control/ControlShell';
import DockShell from '../components/control/DockShell';
import CommandBar from '../components/control/CommandBar';
import ProgramRail from '../components/control/ProgramRail';
import StudioNav from '../components/control/StudioNav';
import StudioLiveBar from '../components/control/StudioLiveBar';
import type { WorkspaceContext } from './workspaces/workspaceContext';
import { QuickTakeProvider } from './quickTake';
import { resolveCanonicalControlPath } from './workspaces/controlPaths';
import { withUrlState } from '../lib/navigateTo';
import { PackSwitchGuardProvider } from '../hooks/usePackSwitchGuard';

/**
 * Where the OBS scene bridge is listening, or '' for off — the default, and
 * what every machine without OBS gets.
 *
 * localStorage rather than an env var for two reasons: this project has no
 * `vite/client` types wired up, so `import.meta.env` would not typecheck, and a
 * key can be flipped at the venue without a rebuild. `read()` in
 * `rundownStore.ts` guards its localStorage the same way.
 *
 * On the show machine, once:
 *   localStorage.setItem('livelayer.obsBridge', 'http://127.0.0.1:7331')
 */
const OBS_BRIDGE = (() => {
  try {
    return localStorage.getItem('livelayer.obsBridge') ?? '';
  } catch {
    return '';
  }
})();

/** Deep clone so a taken graphic shares no references with editable draft state. */
function snapshot<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

/**
 * Control surface orchestrator. Owns the realtime channel and the take/clear
 * decision; every panel reads its own slice of the store. Take/clear logic
 * reads the live store via getState() so this container never re-renders on
 * field keystrokes — only the panels that subscribe do.
 */
export default function ControlPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const channelRef = useRef<ReturnType<typeof createRealtimeChannel> | null>(null);
  const [lastAction, setLastAction] = useState<LastAction>('idle');
  const [lastTakenAt, setLastTakenAt] = useState<number | null>(null);
  // A command is in flight. The ref guards against duplicate submissions from
  // repeated clicks (state alone updates too late); the state drives the UI.
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  // Narrow contexts (OBS Custom Browser Dock, tablets, small windows) get the
  // guided dock; roomy desktops get the studio dashboard. Same route, same
  // store, same Take/Clear — only the layout differs.
  const isStudio = useMediaQuery('(min-width: 1024px)');

  /**
   * Put the convention's rosters — the gospel bands and the NCC robing chart's
   * choirs and singing bands — in People, once, on whichever machine this is.
   *
   * People are stored per browser and nothing syncs them, so a roster typed in
   * at the desk does not exist for the operator controlling from the other
   * machine. Seeding from the build is what gives both of them the same eight
   * names with no step to forget.
   *
   * `importPeople` adds only ids it does not already hold and never overwrites,
   * so this is a starting point rather than something that keeps coming back:
   * a band that is renamed, given a photo, or deleted stays that way.
   *
   * Control only. `/output` may not write storage, and has no use for a roster.
   */
  useEffect(() => {
    void importPeople([...GOSPEL_BAND_PEOPLE, ...NCC_CHOIR_PEOPLE]).catch(() => undefined);
  }, []);

  useEffect(() => {
    /**
     * Inbound messages are Program state, not noise. A dock in OBS and a studio
     * in the system browser are different browser processes with separate
     * localStorage, so the only way they agree on "what is on air" is by
     * hearing each other's commands — and output's acknowledgements — over
     * this channel. What each message MEANS is a tested pure rule
     * (`lib/programSync.ts`); the store applies it. Own commands are dropped
     * at the transport by id, and the reducer is idempotent for replays, so a
     * relay echo can never double-apply a Take.
     */
    channelRef.current = createRealtimeChannel((message) =>
      useLiveLayerStore.getState().applyRealtimeMessage(message)
    );
    return () => {
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, []);

  /**
   * BROADCAST THE PER-SCREEN LOOKS.
   *
   * Scripture Outputs is a SETTING, and a setting normally just persists — but
   * the screen it configures is usually a different browser. Chrome and OBS CEF
   * share no localStorage, so without this the split scene would keep rendering
   * whatever this build's defaults say no matter what the operator picked.
   *
   * Sent on mount and on every change: the relay retains it in its own snapshot
   * slot, so a browser source that connects an hour later still receives it,
   * and a same-browser output gets it over BroadcastChannel immediately. It is
   * fire-and-forget on purpose — a failed publish is not a failed Take, and the
   * output already has a working look from its own defaults.
   */
  const scriptureOutputs = useLiveLayerStore((state) => state.scriptureOutputs);
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel) return;
    void publishCommand(channel, createMessage('SET_SCRIPTURE_OUTPUTS', scriptureOutputs));
  }, [scriptureOutputs]);

  /**
   * Publish a SHOW command and record the operator-side Program state. The
   * realtime message stays the authority for what was *commanded*; the Program
   * slice only records our view of it (status 'showing' / 'unconfirmed' — never
   * a confident acknowledged live, which awaits an output ack). Publish failure
   * marks 'failed', never a confirmed live.
   */
  const publishShow = async (graphic: GraphicInstance, source: ProgramSource): Promise<boolean> => {
    /**
     * THE SERVICE AS IT IS AT THIS INSTANT, frozen onto what goes to air.
     *
     * Here rather than in each Take path, because this is the single door: the
     * draft, the selected rundown item and the quick queue all come through it,
     * and a stamp applied per-caller is a stamp one future surface forgets. The
     * three of them are also the ONLY callers, and nothing republishes
     * automatically — Output replays the stored message, already stamped — so
     * stamping here cannot retime a graphic that is already showing.
     *
     * It is deliberately not applied when a graphic is authored, saved or
     * queued. Those are preparation, and a rundown prepared last week must
     * count down to the service being run now, not the one it was copied from.
     */
    const instance = stampServiceContext(graphic, getServiceContext());
    /**
     * Content gate, checked here rather than only on the button.
     *
     * `takeDisabled` stops the click, but Take also arrives from the quick queue
     * and could arrive from a future surface, and a disabled attribute is not a
     * guarantee. Refusing here is what makes "an empty Scripture card cannot
     * air" true of the publish path itself.
     *
     * It returns BEFORE `publishCommand` and before any `markProgram*`, so a
     * refused Take leaves Program byte-identical — the graphic already on air
     * stays on air, and nothing records an attempt that never left.
     */
    const readiness = resolveGraphicReadiness(instance.templateId, instance.values);
    if (!readiness.ready) {
      /**
       * Defence in depth, and deliberately silent HERE. Every surface that offers
       * a Take now states the reason itself and disables the control — the main
       * button from `useLiveTakeContext`, each queue row from its own item. This
       * gate exists so the publish path is safe even if a future surface forgets,
       * not to be the thing that explains it. The state it used to set was
       * rendered nowhere, which is what made a queue-row Take do nothing without
       * saying why (issue #22).
       */
      setLastAction('idle');
      return false;
    }

    const { markProgramShowing, markProgramFailed } = useLiveLayerStore.getState();
    const message = createMessage('SHOW_GRAPHIC', instance);
    const result = await publishCommand(channelRef.current, message);
    // The transitions live in `resolveTakeOutcome` so they are testable as a
    // rule rather than re-modelled in a test file.
    const outcome = resolveTakeOutcome(result);
    if (outcome.markFailed) {
      markProgramFailed({
        snapshot: instance,
        commandId: message.id,
        source,
        // `publishCommand` already worked out exactly what went wrong; passing
        // it on is the difference between "Send failed" and something an
        // operator can act on without walking to the other machine.
        failure: result.ok ? undefined : { reason: result.reason, detail: result.detail ?? '', at: Date.now() }
      });
      return false;
    }
    // Relay acceptance is not an output acknowledgement — markProgramShowing
    // still records confirmation 'unconfirmed'.
    markProgramShowing({ snapshot: instance, commandId: message.id, source });
    setLastAction('taken');
    setLastTakenAt(Date.now());

    /**
     * Mirror the take to OBS, when a bridge is configured and listening.
     *
     * INSIDE the one door, not beside it. `publishShow` is the single publish
     * path — the draft, the selected rundown item and the quick queue all come
     * through here, and `takeNextWiring.test.ts` forbids a second one. A scene
     * switch that could fire without a Take is a scene switch that will.
     *
     * Fire-and-forget by contract. The graphic is already published and Program
     * already recorded, so a bridge that is off, unreachable or wedged must
     * change nothing above: no await (a wedged bridge would stall a Take), no
     * failure path (the graphic reached air, only the mirror did not), and no
     * effect on the returned value, which drives the live cursor.
     *
     * RUNDOWN ONLY. The draft and the quick queue have no segment to match, and
     * a stray label would push OBS to an unrelated scene mid-service.
     *
     * `.catch` is what stops an unhandled rejection: `fetch` rejects on
     * connection refused. A 404 — the bridge running but refusing to guess at
     * an unmatched label — resolves normally and is silent by design, which is
     * why the rundown has to be swept with the bridge's `/map` before a service
     * rather than discovered on air.
     */
    if (OBS_BRIDGE && source.sourceType === 'rundown' && source.sourceId) {
      const rundownId = getActiveRundownId();
      const item = rundownId
        ? getRundown(rundownId)?.items.find((entry) => entry.id === source.sourceId)
        : undefined;
      const label = sceneLabelFor(item);
      if (label) {
        void fetch(`${OBS_BRIDGE}/goto?name=${encodeURIComponent(label)}`).catch(() => {});
      }
    }

    return outcome.addRecent && outcome.advanceLiveCursor;
  };

  /**
   * Publish CLEAR_ALL. Same rule: a missing channel is a failure, not a clear.
   * Returns the command id so Program can wait for the MATCHING OUTPUT_CLEARED
   * — a clear is pending (`clearing`), never an instant "nothing on air".
   */
  const publishClear = async (): Promise<string | null> => {
    const message = createMessage('CLEAR_ALL', {});
    const result = await publishCommand(channelRef.current, message);
    return resolveClearOutcome(result).markClear ? message.id : null;
  };

  /** Serialises operator commands: one in flight at a time, so a slow relay
   *  cannot produce duplicate Takes from repeated clicks. */
  const runCommand = async (work: () => Promise<void>) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await work();
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const onTake = () =>
    runCommand(async () => {
    // Rundown mode: Take fires the SELECTED item via the same realtime path.
    // Never falls through to the ad-hoc draft — active rundown + no selection
    // is a no-op, so the operator can't accidentally air the draft.
    const activeRundownId = getActiveRundownId();
    if (activeRundownId) {
      const item = getSelectedItem(getRundown(activeRundownId));
      if (item) {
        // Only advance the live cursor once the command is actually out.
        if (await publishShow(cloneRundownGraphic(item.graphic), { sourceType: 'rundown', sourceId: item.id })) {
          setActiveItem(activeRundownId, item.id);
        }
      }
      return;
    }

    // --- ad-hoc draft Take (unchanged when no rundown is active) ---
    const state = useLiveLayerStore.getState();
    // Deep-cloned snapshot: editing fields after Take never mutates what is
    // on air — the output only changes via the next SHOW_GRAPHIC.
    const instance = buildInstanceFromDraft(state);
    // Recent is a log of what went to air, so a failed publish must not enter it.
    if (await publishShow(instance, { sourceType: 'draft', sourceId: null })) {
      state.addRecent(instance);
    }
    });

  /**
   * Quick take: air the DRAFT, through the same door as everything else.
   *
   * Not a second Take. `publishShow` is still the only publisher — the
   * quick-queue rows already call it the same way — and this adds no new
   * decision about what a Take means. It exists because `onTake` fires the
   * selected RUNDOWN ROW when a rundown is active, which is exactly the wrong
   * graphic for a gesture aimed at the verse under the pointer; the provider
   * refuses in that state rather than airing something else.
   */
  const onQuickTakeDraft = useCallback(
    () =>
      runCommand(async () => {
        if (getActiveRundownId()) return;
        const state = useLiveLayerStore.getState();
        const instance = buildInstanceFromDraft(state);
        if (await publishShow(instance, { sourceType: 'draft', sourceId: null })) {
          state.addRecent(instance);
        }
      }),
    []
  );

  /**
   * Take Next — send the next takeable item and move the operator onto it.
   *
   * Goes through `publishShow`, the same single publish boundary Take uses, so
   * there is still exactly one path to air and one in-flight guard. It is not a
   * second Take: it re-decides the target from `planTakeNext` at press time rather
   * than trusting whatever a surface last rendered, because the queue can change
   * between the cue being drawn and the button being pressed.
   *
   * **Both cursors advance together, and only on success.** `selectedItemId` moves
   * so the next press continues down the rundown; `activeItemId` moves because that
   * item is now what was last sent. Advancing either before the command is out
   * would leave the operator's cursor claiming a position nothing aired from —
   * the same rule `onTake` already follows.
   *
   * A refusal is silent here by design: the control is disabled with its cause
   * shown (`planTakeNext`), so reaching this function with no item means the queue
   * changed under a press that was already legal. Doing nothing is correct; airing
   * something the operator was not shown would not be.
   */
  const onTakeNext: () => void = () =>
    runCommand(async () => {
      const activeRundownId = getActiveRundownId();
      if (!activeRundownId) return;
      const plan = planTakeNext({
        rundown: getRundown(activeRundownId),
        readinessOf: (item) => resolveGraphicReadiness(item.graphic.templateId, item.graphic.values)
      });
      if (!plan.item) return;
      const item = plan.item;
      if (await publishShow(cloneRundownGraphic(item.graphic), { sourceType: 'rundown', sourceId: item.id })) {
        setSelectedItem(activeRundownId, item.id);
        setActiveItem(activeRundownId, item.id);
      }
    });

  /**
   * The keyboard binding for Take Next, bound once at the container that owns the
   * handler — so the dock and the studio behave identically and there is no second
   * listener to drift.
   *
   * Deliberately NOT bound to Take or Clear. Take Next is the only action worth a
   * shortcut during a service (progression is the repeated act), and every extra
   * keyboard route to air is another way to air something by accident.
   *
   * `onTakeNext` re-decides its target and no-ops when the plan refuses, so this
   * listener does not need to know whether the button is currently enabled — it
   * cannot fire something the rule would not allow.
   */
  /** Always the latest handler, so the listener below can bind exactly once. */
  const onTakeNextRef = useRef(onTakeNext);
  onTakeNextRef.current = onTakeNext;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isTakeNextShortcut(event)) return;
      // Only once the rule has said yes: preventing default on a near-miss would
      // swallow an ordinary Enter somewhere else on the surface.
      event.preventDefault();
      onTakeNextRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // Bound once. The handler is reached through a ref so that re-creating
    // `onTakeNext` each render cannot detach and re-attach the listener
    // mid-service — the same instability that once cancelled every scripture
    // lookup in flight (`useScriptureLookup`).
  }, []);

  const onClear = () =>
    runCommand(async () => {
      const commandId = await publishClear();
      if (!commandId) return; // nothing published — Program stays as it was
      useLiveLayerStore.getState().markProgramClearing({ commandId });
      setLastAction('cleared');
      // In rundown mode, Clear also drops the live cursor (does not mark done).
      const activeRundownId = getActiveRundownId();
      if (activeRundownId) setActiveItem(activeRundownId, undefined);
    });

  /**
   * Load any stored graphic into the editor and go there. The editor lives in
   * the Studio workspace, while the surfaces offering "load into editor" (the
   * Program rail's queue, Library → Saved graphics) render elsewhere — so the
   * navigation is part of the action, not an extra step for the operator. Read-only with respect to Program, the queue and the
   * saved preset. One handler for every such entry point.
   */
  const openGraphicInEditor = useCallback(
    (graphic: GraphicInstance) => {
      useLiveLayerStore.getState().loadGraphicInstance(graphic);
      // Only travel if there is somewhere to travel from. Design presets and the
      // queue's "Edit" both call this from inside Studio, and navigating to the
      // URL you are already on pushes a duplicate history entry — after a few
      // loads, Back does nothing visible until those duplicates are walked off.
      if (!location.pathname.startsWith('/control/studio')) navigate(withUrlState('/control/studio', location));
    },
    /**
     * The WHOLE location, not just `pathname`.
     *
     * This closure now reads `search` and `hash` through `withUrlState`, so
     * depending on `pathname` alone left it holding a stale location whenever
     * only the query changed while the route stayed mounted. The bad case is not
     * theoretical: with the URL changed to `?relay=off`, a stale closure would
     * navigate carrying the OLD `?relay=host:port` and silently restore a relay
     * the operator had just turned off — reintroducing exactly the URL-state
     * error this helper exists to prevent. `location` is a fresh object per
     * navigation, so this recreates the callback slightly more often; that is
     * cheap and it is correct.
     */
    [navigate, location]
  );

  /**
   * Take a stored quick-queue graphic straight to air. A fresh id/timestamp
   * per take so repeated takes of the same entry always re-fire the output;
   * the Program source keeps the ORIGINAL queue item id.
   */
  const onTakeInstance = (item: GraphicInstance) =>
    runCommand(async () => {
      const instance: GraphicInstance = {
        ...snapshot(item),
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (await publishShow(instance, { sourceType: 'quickQueue', sourceId: item.id })) {
        useLiveLayerStore.getState().addRecent(instance);
      }
    });

  // Canonicalise BEFORE the shell choice. Redirect routes are children, and the
  // dock never renders the outlet, so as route elements these never ran below
  // 1024px — the address bar kept a non-canonical URL and widening the window
  // later produced a surprise redirect.
  const canonical = resolveCanonicalControlPath(location.pathname);
  if (canonical) {
    // Carry the query and hash across. `/setup` hands out the LAN control URL as
    // `/control?relay=…`, and the realtime channel reads that param when it is
    // constructed — a path-only redirect drops it, so on a machine with no
    // stored relay the controller comes up with no relay at all and its commands
    // never reach the remote output. Worse, `<Navigate>` is a child, so its
    // effect runs BEFORE this component's channel effect: the param is already
    // gone from the URL by the time the channel looks for it.
    return <Navigate to={{ pathname: canonical, search: location.search, hash: location.hash }} replace />;
  }

  if (!isStudio) {
    return (
      <PackSwitchGuardProvider>
        <QuickTakeProvider takeDraft={onQuickTakeDraft} rundownActive={Boolean(getActiveRundownId())}>
        <DockShell
          onTake={onTake}
          onTakeNext={onTakeNext}
          onClear={onClear}
          lastAction={lastAction}
          lastTakenAt={lastTakenAt}
          sending={sending}
        />
        </QuickTakeProvider>
      </PackSwitchGuardProvider>
    );
  }

  const workspace: WorkspaceContext = { onLoadGraphic: openGraphicInEditor };

  return (
    <PackSwitchGuardProvider>
      <QuickTakeProvider takeDraft={onQuickTakeDraft} rundownActive={Boolean(getActiveRundownId())}>
      <ControlShell
        commandBar={<CommandBar />}
        nav={<StudioNav />}
        center={<Outlet context={workspace} />}
        centerKey={location.pathname}
        rail={
          <ProgramRail
            onTake={onTake}
            onTakeNext={onTakeNext}
            onClear={onClear}
            onTakeInstance={onTakeInstance}
            onEditInstance={openGraphicInEditor}
            sending={sending}
          />
        }
        /* Stacked layouts put the rail — and Take — thousands of pixels down the
           scroll, so the actions also render as a bar the frame always shows.
           CSS decides which of the two is in the tree at a given width, so there
           is never a second Take on screen or in the accessibility tree. */
        liveBar={<StudioLiveBar onTake={onTake} onTakeNext={onTakeNext} onClear={onClear} sending={sending} />}
      />
      </QuickTakeProvider>
    </PackSwitchGuardProvider>
  );
}
