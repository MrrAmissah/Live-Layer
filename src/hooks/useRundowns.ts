import { useEffect, useState } from 'react';
import type { GraphicInstance } from '../types/graphics';
import type { Rundown, RundownItem, RundownItemSource, RundownStoreState } from '../types/rundown';
import { useLiveLayerStore } from '../store/useLiveLayerStore';
import * as store from '../lib/rundown/rundownStore';
import { templateRegistry } from '../components/templates/registry';
import { createDraftValues } from '../lib/draftSeed';

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

/**
 * A fresh, pack-seeded graphic for a template — the same seed a new draft gets
 * (registry defaults + explicit brand colours + active pack), so an item added
 * from the dock's Queue tab looks exactly like one started in the studio.
 */
function buildTemplateInstance(templateId: string): GraphicInstance {
  const state = useLiveLayerStore.getState();
  const template = templateRegistry.find((entry) => entry.id === templateId);
  const values = createDraftValues(templateId, state.activePackId, state.brandTheme, state.explicitBrandKeys);
  const ts = new Date().toISOString();
  return {
    id: `${Date.now()}`,
    templateId,
    values,
    theme: { ...state.brandTheme },
    layout: {},
    assetRefs: {
      ...(values.headshotAssetId ? { headshot: values.headshotAssetId } : {}),
      ...(values.logoAssetId ? { logo: values.logoAssetId } : {})
    },
    personId: values.personId,
    durationSeconds: template?.defaultDurationSeconds ?? 6,
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
    /**
     * Copy a whole rundown for the next service. Preparation only: nothing is
     * published, and the copy is NOT made active — activating it would redirect
     * Take to a different set of items, and the copy is next week's work, not
     * what is being run now.
     */
    duplicateRundown: (id: string, name?: string): Rundown | undefined =>
      run(() => store.duplicateRundown(id, name)),
    renameRundown: (id: string, name: string) => run(() => store.updateRundown(id, { name })),
    deleteRundown: (id: string) => run(() => store.deleteRundown(id)),
    setActiveRundown: (id: string | undefined) => run(() => store.setActiveRundown(id)),

    /**
     * Add the current editable draft to the active rundown (no Take, no /output).
     *
     * `options` lets a caller name the item and record where it came from instead
     * of letting `deriveItemTitle` guess from the graphic's fields. Scripture
     * needs it: that helper reads `values.reference`, so one verse added in two
     * translations produced two rundown rows with the same title and nothing to
     * tell them apart — and they are different on-air content.
     */
    addDraftToRundown: (options: { title?: string; source?: RundownItemSource } = {}): RundownItem | null => {
      if (!activeRundownId) return null;
      return (
        run(() =>
          store.addItem(activeRundownId, {
            graphic: buildDraftInstance(),
            title: options.title,
            source: options.source ?? { type: 'draft' }
          })
        ) ?? null
      );
    },
    /**
     * Add a fresh, pack-seeded item for a template (dock Queue tab's "+ Add").
     * Titled with the TEMPLATE name, not `deriveItemTitle` — the seed carries
     * the template's sample copy, and titling a brand-new item with sample
     * content would make placeholder text read as prepared content in the
     * queue. Returns null at the item cap so the caller can say so.
     */
    addTemplateToRundown: (templateId: string): RundownItem | null => {
      if (!activeRundownId) return null;
      const template = templateRegistry.find((entry) => entry.id === templateId);
      return (
        run(() =>
          store.addItem(activeRundownId, {
            graphic: buildTemplateInstance(templateId),
            title: template?.name,
            source: { type: 'manual' }
          })
        ) ?? null
      );
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
    /** Absolute reposition, for a drag. Publishes nothing and moves no cursor. */
    moveItemTo: (itemId: string, toIndex: number) =>
      activeRundownId && run(() => store.moveItemTo(activeRundownId, itemId, toIndex)),
    toggleDone: (itemId: string) => activeRundownId && run(() => store.toggleItemDone(activeRundownId, itemId)),
    setSelectedItem: (itemId: string | undefined) => activeRundownId && run(() => store.setSelectedItem(activeRundownId, itemId))
  };
}
