import { useLiveLayerStore } from '../store/useLiveLayerStore';
import { useRundowns } from './useRundowns';
import { getSelectedItem, updateItem } from '../lib/rundown/rundownStore';
import type { TemplateDefinition } from '../types/graphics';
import type { LayoutSettings } from '../types/layout';

export type EditTargetMode = 'draft' | 'rundown-item';

export interface EditTarget {
  mode: EditTargetMode;
  isRundownItem: boolean;
  /** True when the selected rundown item is also the live (activeItemId) item. */
  isLive: boolean;
  sourceLabel: string;
  templateId: string;
  values: Record<string, string>;
  layout: LayoutSettings;
  /** Read-only: the target's theme (brand stays global; see R4 docs). */
  theme: TemplateDefinition['theme'];
  durationSeconds: number;
  setField: (key: string, value: string) => void;
  setLayout: (patch: Partial<LayoutSettings>) => void;
  resetLayout: () => void;
  setDuration: (seconds: number) => void;
  resetDraft: () => void;
}

/**
 * The single abstraction every content/layout/duration editor reads & writes
 * through (R4). When an active rundown has a selected item, editors target that
 * item's snapshot (writes go through `updateItem`, which deep-clones — so the
 * ad-hoc draft, Saved Graphics, and People records are never touched). Otherwise
 * they target the ad-hoc draft, returning the exact store setters used today, so
 * the no-rundown path is byte-equivalent to pre-R4. Raw dynamic tokens are stored
 * as typed (resolution stays at render).
 */
export function useEditTarget(): EditTarget {
  const rd = useRundowns();
  const currentTemplateId = useLiveLayerStore((state) => state.currentTemplateId);
  const draftValues = useLiveLayerStore((state) => state.draftValues);
  const draftTheme = useLiveLayerStore((state) => state.theme);
  const draftLayout = useLiveLayerStore((state) => state.layout);
  const draftDuration = useLiveLayerStore((state) => state.durationSeconds);
  const setField = useLiveLayerStore((state) => state.setField);
  const setLayout = useLiveLayerStore((state) => state.setLayout);
  const resetLayout = useLiveLayerStore((state) => state.resetLayout);
  const setDurationSeconds = useLiveLayerStore((state) => state.setDurationSeconds);
  const resetDraft = useLiveLayerStore((state) => state.resetDraft);

  const rundown = rd.activeRundown;
  const item = getSelectedItem(rundown);

  if (rundown && item) {
    const rundownId = rundown.id;
    const graphic = item.graphic;
    // Re-created each render over the freshly-read `graphic`, so successive edits
    // build on the latest committed snapshot (no stale closure).
    const patch = (changes: Partial<typeof graphic>) =>
      updateItem(rundownId, item.id, { graphic: { ...graphic, ...changes } });

    return {
      mode: 'rundown-item',
      isRundownItem: true,
      isLive: item.id === rundown.activeItemId,
      sourceLabel: item.title,
      templateId: graphic.templateId,
      values: graphic.values,
      layout: graphic.layout ?? {},
      theme: graphic.theme as TemplateDefinition['theme'],
      durationSeconds: graphic.durationSeconds ?? 0,
      setField: (key, value) => patch({ values: { ...graphic.values, [key]: value } }),
      setLayout: (p) => patch({ layout: { ...(graphic.layout ?? {}), ...p } }),
      resetLayout: () => patch({ layout: {} }),
      setDuration: (seconds) => patch({ durationSeconds: seconds }),
      resetDraft: () => {
        /* No destructive reset of a rundown item in R4. */
      }
    };
  }

  return {
    mode: 'draft',
    isRundownItem: false,
    isLive: false,
    sourceLabel: 'Draft',
    templateId: currentTemplateId,
    values: draftValues,
    layout: draftLayout,
    theme: draftTheme,
    durationSeconds: draftDuration,
    setField,
    setLayout,
    resetLayout,
    setDuration: setDurationSeconds,
    resetDraft
  };
}
