import { useEffect, useRef, useState } from 'react';
import { buildInstanceFromDraft, useLiveLayerStore } from '../store/useLiveLayerStore';
import { createRealtimeChannel, createMessage } from '../lib/realtime';
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
import TemplateRail from '../components/control/TemplateRail';
import PreviewPanel from '../components/control/PreviewPanel';
import FieldEditor from '../components/control/FieldEditor';
import LiveActionsPanel from '../components/control/LiveActionsPanel';
import QuickQueuePanel from '../components/control/QuickQueuePanel';
import BrandPanel from '../components/control/BrandPanel';
import LibraryPanel from '../components/control/LibraryPanel';

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

  const onTake = () => {
    // Rundown mode: Take fires the SELECTED item via the same realtime path.
    // Never falls through to the ad-hoc draft — active rundown + no selection
    // is a no-op, so the operator can't accidentally air the draft.
    const activeRundownId = getActiveRundownId();
    if (activeRundownId) {
      const item = getSelectedItem(getRundown(activeRundownId));
      if (item) {
        channelRef.current?.post(createMessage('SHOW_GRAPHIC', cloneRundownGraphic(item.graphic)));
        setActiveItem(activeRundownId, item.id);
        setLastAction('taken');
        setLastTakenAt(Date.now());
      }
      return;
    }

    // --- ad-hoc draft Take (unchanged when no rundown is active) ---
    const state = useLiveLayerStore.getState();
    const { addRecent } = state;
    // Deep-cloned snapshot: editing fields after Take never mutates what is
    // on air — the output only changes via the next SHOW_GRAPHIC.
    const instance = buildInstanceFromDraft(state);
    channelRef.current?.post(createMessage('SHOW_GRAPHIC', instance));
    addRecent(instance);
    setLastAction('taken');
    setLastTakenAt(Date.now());
  };

  const onClear = () => {
    channelRef.current?.post(createMessage('CLEAR_ALL', {}));
    setLastAction('cleared');
    // In rundown mode, Clear also drops the live cursor (does not mark done).
    const activeRundownId = getActiveRundownId();
    if (activeRundownId) setActiveItem(activeRundownId, undefined);
  };

  /**
   * Take a stored quick-queue graphic straight to air. A fresh id/timestamp
   * per take so repeated takes of the same entry always re-fire the output.
   */
  const onTakeInstance = (item: GraphicInstance) => {
    const instance: GraphicInstance = {
      ...snapshot(item),
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    channelRef.current?.post(createMessage('SHOW_GRAPHIC', instance));
    useLiveLayerStore.getState().addRecent(instance);
    setLastAction('taken');
    setLastTakenAt(Date.now());
  };

  if (!isStudio) {
    return (
      <DockShell
        onTake={onTake}
        onClear={onClear}
        lastAction={lastAction}
        lastTakenAt={lastTakenAt}
      />
    );
  }

  return (
    <ControlShell
      commandBar={<CommandBar />}
      rail={<TemplateRail />}
      preview={<PreviewPanel />}
      editor={<FieldEditor />}
      actions={
        <>
          <LiveActionsPanel
            onTake={onTake}
            onClear={onClear}
            lastAction={lastAction}
            lastTakenAt={lastTakenAt}
          />
          <QuickQueuePanel onTakeInstance={onTakeInstance} />
        </>
      }
      brand={<BrandPanel />}
      presets={<LibraryPanel />}
    />
  );
}
