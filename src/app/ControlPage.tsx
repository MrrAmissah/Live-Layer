import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { buildInstanceFromDraft, useLiveLayerStore, type ProgramSource } from '../store/useLiveLayerStore';
import { createRealtimeChannel, createMessage, publishCommand } from '../lib/realtime';
import { resolveClearOutcome, resolveTakeOutcome } from '../lib/takeOutcome';
import { resolveGraphicReadiness } from '../lib/graphicReadiness';
import { useMediaQuery } from '../lib/useMediaQuery';
import {
  getActiveRundownId,
  getRundown,
  getSelectedItem,
  setActiveItem,
  cloneRundownGraphic
} from '../lib/rundown/rundownStore';
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
import { resolveCanonicalControlPath } from './workspaces/controlPaths';
import { PackSwitchGuardProvider } from '../hooks/usePackSwitchGuard';

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
  // Why the last Take was refused on content grounds, surfaced to the operator.
  const [notReadyReason, setNotReadyReason] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  // Narrow contexts (OBS Custom Browser Dock, tablets, small windows) get the
  // guided dock; roomy desktops get the studio dashboard. Same route, same
  // store, same Take/Clear — only the layout differs.
  const isStudio = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    channelRef.current = createRealtimeChannel(() => undefined);
    return () => {
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, []);

  /**
   * Publish a SHOW command and record the operator-side Program state. The
   * realtime message stays the authority for what was *commanded*; the Program
   * slice only records our view of it (status 'showing' / 'unconfirmed' — never
   * a confident acknowledged live, which awaits an output ack). Publish failure
   * marks 'failed', never a confirmed live.
   */
  const publishShow = async (instance: GraphicInstance, source: ProgramSource): Promise<boolean> => {
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
      setLastAction('idle');
      setNotReadyReason(readiness.reason);
      return false;
    }
    setNotReadyReason('');

    const { markProgramShowing, markProgramFailed } = useLiveLayerStore.getState();
    const message = createMessage('SHOW_GRAPHIC', instance);
    const result = await publishCommand(channelRef.current, message);
    // The transitions live in `resolveTakeOutcome` so they are testable as a
    // rule rather than re-modelled in a test file.
    const outcome = resolveTakeOutcome(result);
    if (outcome.markFailed) {
      markProgramFailed({ snapshot: instance, commandId: message.id, source });
      return false;
    }
    // Relay acceptance is not an output acknowledgement — markProgramShowing
    // still records confirmation 'unconfirmed'.
    markProgramShowing({ snapshot: instance, commandId: message.id, source });
    setLastAction('taken');
    setLastTakenAt(Date.now());
    return outcome.addRecent && outcome.advanceLiveCursor;
  };

  /** Publish CLEAR_ALL. Same rule: a missing channel is a failure, not a clear. */
  const publishClear = async (): Promise<boolean> =>
    resolveClearOutcome(await publishCommand(channelRef.current, createMessage('CLEAR_ALL', {}))).markClear;

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

  const onClear = () =>
    runCommand(async () => {
      if (!(await publishClear())) return; // nothing published — Program stays as it was
      useLiveLayerStore.getState().markProgramClear();
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
      if (!location.pathname.startsWith('/control/studio')) navigate('/control/studio');
    },
    [navigate, location.pathname]
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
        <DockShell
          onTake={onTake}
          onClear={onClear}
          lastAction={lastAction}
          lastTakenAt={lastTakenAt}
          sending={sending}
        />
      </PackSwitchGuardProvider>
    );
  }

  const workspace: WorkspaceContext = { onLoadGraphic: openGraphicInEditor };

  return (
    <PackSwitchGuardProvider>
      <ControlShell
        commandBar={<CommandBar />}
        nav={<StudioNav />}
        center={<Outlet context={workspace} />}
        centerKey={location.pathname}
        rail={
          <ProgramRail
            onTake={onTake}
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
        liveBar={<StudioLiveBar onTake={onTake} onClear={onClear} sending={sending} />}
      />
    </PackSwitchGuardProvider>
  );
}
