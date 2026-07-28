import { useEffect, useRef, useState } from 'react';
import { buildInstanceFromDraft, useLiveLayerStore, type ProgramSource } from '../store/useLiveLayerStore';
import { createRealtimeChannel, createMessage, publishCommand } from '../lib/realtime';
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
import StudioNav, { type StudioView } from '../components/control/StudioNav';
import PreviewPanel from '../components/control/PreviewPanel';
import FieldEditor from '../components/control/FieldEditor';
import ProgramRail from '../components/control/ProgramRail';
import Panel from '../components/control/Panel';
import PresetControls from '../components/control/PresetControls';
import PeopleLibrary from '../components/control/PeopleLibrary';
import RundownLibrary from '../components/control/RundownLibrary';
import AssetsView from '../components/control/AssetsView';
import ImportPackPreview from '../components/control/ImportPackPreview';
import { PackSwitchGuardProvider } from '../hooks/usePackSwitchGuard';

/** Wraps an existing management surface as a full-height studio destination. */
function DestinationPanel({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <Panel className="ll-fill">
      <div className="editor-head">
        <span className="ll-kicker">{kicker}</span>
      </div>
      <div className="ll-panel__body">{children}</div>
    </Panel>
  );
}

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
  const channelRef = useRef<ReturnType<typeof createRealtimeChannel> | null>(null);
  const [lastAction, setLastAction] = useState<LastAction>('idle');
  const [lastTakenAt, setLastTakenAt] = useState<number | null>(null);
  const [view, setView] = useState<StudioView>('templates');
  // A command is in flight. The ref guards against duplicate submissions from
  // repeated clicks (state alone updates too late); the state drives the UI.
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
    const { markProgramShowing, markProgramFailed } = useLiveLayerStore.getState();
    const message = createMessage('SHOW_GRAPHIC', instance);
    const result = await publishCommand(channelRef.current, message);
    if (!result.ok) {
      markProgramFailed({ snapshot: instance, commandId: message.id, source });
      return false;
    }
    // Relay acceptance is not an output acknowledgement — markProgramShowing
    // still records confirmation 'unconfirmed'.
    markProgramShowing({ snapshot: instance, commandId: message.id, source });
    setLastAction('taken');
    setLastTakenAt(Date.now());
    return true;
  };

  /** Publish CLEAR_ALL. Same rule: a missing channel is a failure, not a clear. */
  const publishClear = async (): Promise<boolean> =>
    (await publishCommand(channelRef.current, createMessage('CLEAR_ALL', {}))).ok;

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
   * Load any stored graphic into the editor and reveal it. FieldEditor mounts
   * only under the Templates view, while the surfaces that offer "load into
   * editor" actions (the Program rail's queue, the Saved graphics destination)
   * render elsewhere — so the view switch is part of the action, not an extra
   * step for the operator. Read-only with respect to Program, the queue and the
   * saved preset. One handler for every such entry point.
   */
  const openGraphicInEditor = (graphic: GraphicInstance) => {
    useLiveLayerStore.getState().loadGraphicInstance(graphic);
    setView('templates');
  };

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

  const center =
    view === 'templates' ? (
      <div className="studio-center">
        <PreviewPanel />
        <FieldEditor onNavigate={setView} onLoadGraphic={openGraphicInEditor} />
      </div>
    ) : view === 'saved' ? (
      <DestinationPanel kicker="Saved graphics">
        <PresetControls onLoadGraphic={openGraphicInEditor} />
      </DestinationPanel>
    ) : view === 'people' ? (
      <DestinationPanel kicker="People">
        <PeopleLibrary />
      </DestinationPanel>
    ) : view === 'assets' ? (
      <AssetsView />
    ) : view === 'import' ? (
      <DestinationPanel kicker="Import pack">
        <ImportPackPreview />
      </DestinationPanel>
    ) : (
      <DestinationPanel kicker="Rundowns">
        <RundownLibrary />
      </DestinationPanel>
    );

  return (
    <PackSwitchGuardProvider>
      <ControlShell
        commandBar={<CommandBar />}
        nav={<StudioNav view={view} onViewChange={setView} />}
        center={center}
        rail={
          <ProgramRail
            onTake={onTake}
            onClear={onClear}
            onTakeInstance={onTakeInstance}
            onEditInstance={openGraphicInEditor}
            sending={sending}
          />
        }
      />
    </PackSwitchGuardProvider>
  );
}
