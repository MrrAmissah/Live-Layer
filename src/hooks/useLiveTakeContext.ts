import { useLiveLayerStore } from '../store/useLiveLayerStore';
import { useRundowns } from './useRundowns';
import { getSelectedItem } from '../lib/rundown/rundownStore';
import { planTakeNext, describeTakeNextCue, type TakeNextPlan } from '../lib/rundown/takeNext';
import { describeTakeBlock, resolveGraphicReadiness } from '../lib/graphicReadiness';
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

  /**
   * Readiness is computed from the SAME source the preview shows, so the button
   * and the monitor can never disagree about whether something is airable — the
   * selected rundown item when a rundown is active, the draft otherwise.
   * `ControlPage` re-checks before publishing; this only decides what the surface
   * offers.
   */
  const previewSource: LivePreviewSource = selectedItem
    ? {
        templateId: selectedItem.graphic.templateId,
        values: selectedItem.graphic.values,
        theme: selectedItem.graphic.theme as TemplateDefinition['theme'],
        layout: selectedItem.graphic.layout
      }
    : { templateId: currentTemplateId, values: draftValues, theme, layout };

  const readiness = resolveGraphicReadiness(previewSource.templateId, previewSource.values);

  /**
   * The button state and its explanation come out of ONE call, so a surface can
   * never render a disabled Take with no stated cause (`lib/graphicReadiness.ts`).
   */
  const block = describeTakeBlock({ rundownActive, hasSelection: Boolean(selectedItem), readiness });
  const takeDisabled = block.disabled;
  const notReadyReason = block.reason;
  const takeLabel = rundownActive ? 'Take selected' : 'Take live';
  const durationSeconds = selectedItem ? selectedItem.graphic.durationSeconds : draftDurationSeconds;

  // The item snapshot's theme was cloned from the (full) draft theme, so the
  // cast is safe; TemplatePreview merges it over the registry theme regardless.
  const preview = previewSource;

  /**
   * What Take Next would send, decided by the same rule `ControlPage.onTakeNext`
   * re-runs at press time. Surfaces render the cue and the disabled state from
   * this, so the sentence under the button and the graphic that would air can
   * never come from two different decisions.
   *
   * Readiness is resolved per candidate item rather than reusing `readiness`
   * above: that one describes the SELECTED item, and Take Next sends a different
   * one.
   */
  const takeNextPlan: TakeNextPlan = planTakeNext({
    rundown,
    readinessOf: (item) => resolveGraphicReadiness(item.graphic.templateId, item.graphic.values)
  });

  return {
    rundown,
    rundownActive,
    selectedItem,
    activeItemId,
    takeDisabled,
    takeLabel,
    durationSeconds,
    preview,
    /** Why Take is unavailable. Empty when it is available. */
    notReadyReason,
    /** The Take Next decision: its target, its refusal, and how many rows it passes over. */
    takeNext: takeNextPlan,
    /** One line for the cue — the target, or the reason there is none. */
    takeNextCue: describeTakeNextCue(takeNextPlan)
  };
}
