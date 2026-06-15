import { useLiveLayerStore } from '../store/useLiveLayerStore';
import { useRundowns } from './useRundowns';
import { getSelectedItem } from '../lib/rundown/rundownStore';
import type { TemplateDefinition } from '../types/graphics';
import type { LayoutSettings } from '../types/layout';
import type { RundownItem } from '../types/rundown';

export interface LivePreviewSource {
  templateId: string;
  values: Record<string, string>;
  theme: TemplateDefinition['theme'];
  layout?: LayoutSettings;
}

/**
 * Single source of truth for the live-take surfaces (sticky bar, action deck,
 * Live-tab preview, studio preview). When an active rundown has a selected item,
 * Take fires that item and the preview must show it; otherwise the ad-hoc draft.
 * The Take label, the disabled state, and the preview source all derive from
 * here so they can never disagree mid-interaction.
 */
export function useLiveTakeContext() {
  const rd = useRundowns();
  const currentTemplateId = useLiveLayerStore((state) => state.currentTemplateId);
  const draftValues = useLiveLayerStore((state) => state.draftValues);
  const theme = useLiveLayerStore((state) => state.theme);
  const layout = useLiveLayerStore((state) => state.layout);
  const draftDurationSeconds = useLiveLayerStore((state) => state.durationSeconds);

  const rundown = rd.activeRundown;
  const rundownActive = Boolean(rundown);
  const selectedItem: RundownItem | undefined = getSelectedItem(rundown);
  const activeItemId = rundown?.activeItemId;

  const takeDisabled = rundownActive && !selectedItem;
  const takeLabel = rundownActive ? 'Take selected' : 'Take live';
  const durationSeconds = selectedItem ? selectedItem.graphic.durationSeconds : draftDurationSeconds;

  // The item snapshot's theme was cloned from the (full) draft theme, so the
  // cast is safe; TemplatePreview merges it over the registry theme regardless.
  const preview: LivePreviewSource = selectedItem
    ? {
        templateId: selectedItem.graphic.templateId,
        values: selectedItem.graphic.values,
        theme: selectedItem.graphic.theme as TemplateDefinition['theme'],
        layout: selectedItem.graphic.layout
      }
    : { templateId: currentTemplateId, values: draftValues, theme, layout };

  return { rundown, rundownActive, selectedItem, activeItemId, takeDisabled, takeLabel, durationSeconds, preview };
}
