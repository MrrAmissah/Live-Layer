import { useEffect, useRef, useState } from 'react';
import { useLiveLayerStore } from '../store/useLiveLayerStore';
import { createRealtimeChannel, createMessage } from '../lib/realtime';
import { useMediaQuery } from '../lib/useMediaQuery';
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
import BrandPanel from '../components/control/BrandPanel';
import LibraryPanel from '../components/control/LibraryPanel';

/** Deep clone so a taken graphic shares no references with editable draft state. */
function snapshot<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

/**
 * Build the immutable graphic the operator is taking live. Every nested field is
 * deep-cloned from the draft, so editing fields after Take never mutates what is
 * on air — the live output only ever changes via a new SHOW_GRAPHIC on the next
 * Take (and the realtime message is itself structured-cloned/serialized to
 * `/output`, which never reads the control store).
 */
function buildGraphicInstance(
  templateId: string,
  values: Record<string, string>,
  theme: TemplateDefinition['theme'],
  layout: LayoutSettings,
  durationSeconds: number
): GraphicInstance {
  return {
    id: `${Date.now()}`,
    templateId,
    values: snapshot(values),
    theme: snapshot(theme),
    layout: snapshot(layout),
    assetRefs: {
      ...(values.headshotAssetId ? { headshot: values.headshotAssetId } : {}),
      ...(values.logoAssetId ? { logo: values.logoAssetId } : {})
    },
    personId: values.personId,
    durationSeconds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
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
    const { currentTemplateId, draftValues, theme, layout, durationSeconds, addRecent } = useLiveLayerStore.getState();
    const instance = buildGraphicInstance(currentTemplateId, draftValues, theme, layout, durationSeconds);
    channelRef.current?.post(createMessage('SHOW_GRAPHIC', instance));
    addRecent(instance);
    setLastAction('taken');
    setLastTakenAt(Date.now());
  };

  const onClear = () => {
    channelRef.current?.post(createMessage('CLEAR_ALL', {}));
    setLastAction('cleared');
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
        <LiveActionsPanel
          onTake={onTake}
          onClear={onClear}
          lastAction={lastAction}
          lastTakenAt={lastTakenAt}
        />
      }
      brand={<BrandPanel />}
      presets={<LibraryPanel />}
    />
  );
}
