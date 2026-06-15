import { useEffect, useState } from 'react';
import type { GraphicInstance } from '../types/graphics';
import type { Rundown, RundownItem, RundownStoreState } from '../types/rundown';
import { useLiveLayerStore } from '../store/useLiveLayerStore';
import * as store from '../lib/rundown/rundownStore';

/**
 * Reactive wrapper over the rundown store. Change notification lives in the store
 * (`subscribeRundowns`), so every consumer — the Rundown library, the "Add to
 * rundown" button, the Live-tab queue, and ControlPage's imperative Take/Clear
 * mutations — stays in sync. Management ops here never post a realtime message;
 * the only live path is ControlPage's Take/Clear (R3).
 */

/** Snapshot the current editable draft as a GraphicInstance (deep-cloned again by the store). */
function buildDraftInstance(): GraphicInstance {
  const state = useLiveLayerStore.getState();
  const values = state.draftValues;
  const ts = new Date().toISOString();
  return {
    id: `${Date.now()}`,
    templateId: state.currentTemplateId,
    values: { ...values },
    theme: { ...state.theme },
    layout: { ...state.layout },
    assetRefs: {
      ...(values.headshotAssetId ? { headshot: values.headshotAssetId } : {}),
      ...(values.logoAssetId ? { logo: values.logoAssetId } : {})
    },
    personId: values.personId,
    durationSeconds: state.durationSeconds,
    createdAt: ts,
    updatedAt: ts
  };
}

export function useRundowns() {
  const [state, setState] = useState<RundownStoreState>(() => store.loadRundownState());

  useEffect(() => {
    const refresh = () => setState(store.loadRundownState());
    const unsubscribe = store.subscribeRundowns(refresh);
    refresh();
    return unsubscribe;
  }, []);

  const activeRundownId = state.activeRundownId;
  const activeRundown = state.rundowns.find((rundown) => rundown.id === activeRundownId);

  // The store notifies on write, so callers just invoke the store op.
  const run = <T>(fn: () => T): T => fn();

  return {
    rundowns: state.rundowns,
    activeRundown,
    activeRundownId,

    createRundown: (name: string): Rundown | undefined => run(() => store.createRundown(name)),
    renameRundown: (id: string, name: string) => run(() => store.updateRundown(id, { name })),
    deleteRundown: (id: string) => run(() => store.deleteRundown(id)),
    setActiveRundown: (id: string | undefined) => run(() => store.setActiveRundown(id)),

    /** Add the current editable draft to the active rundown (no Take, no /output). */
    addDraftToRundown: (): RundownItem | null => {
      if (!activeRundownId) return null;
      return run(() => store.addItem(activeRundownId, { graphic: buildDraftInstance(), source: { type: 'draft' } })) ?? null;
    },
    /** Add a Saved Graphic (a stored GraphicInstance) to the active rundown. */
    addSavedGraphicToRundown: (preset: GraphicInstance): RundownItem | null => {
      if (!activeRundownId) return null;
      return run(() =>
        store.addItem(activeRundownId, {
          graphic: preset,
          title: preset.presetName,
          source: { type: 'savedGraphic', presetId: preset.id }
        })
      ) ?? null;
    },

    duplicateItem: (itemId: string) => activeRundownId && run(() => store.duplicateItem(activeRundownId, itemId)),
    deleteItem: (itemId: string) => activeRundownId && run(() => store.deleteItem(activeRundownId, itemId)),
    moveItemUp: (itemId: string) => activeRundownId && run(() => store.moveItem(activeRundownId, itemId, 'up')),
    moveItemDown: (itemId: string) => activeRundownId && run(() => store.moveItem(activeRundownId, itemId, 'down')),
    toggleDone: (itemId: string) => activeRundownId && run(() => store.toggleItemDone(activeRundownId, itemId)),
    setSelectedItem: (itemId: string | undefined) => activeRundownId && run(() => store.setSelectedItem(activeRundownId, itemId))
  };
}
