import { useLiveLayerStore } from '../store/useLiveLayerStore';
import { useRundowns } from './useRundowns';
import { cloneRundownGraphic, getRundown, getSelectedItem, updateItem } from '../lib/rundown/rundownStore';
import { reconcileGraphicAssets } from '../lib/rundown/rundownReferences';
import { applyVariantSelection } from '../lib/variantPalette';
import { applyLogoUrl } from '../lib/brandWrites';
import type { GraphicInstance } from '../types/graphics';
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
  /** Merge several field values in ONE update, atomically — the target's whole
   *  values object is written once, so batched multi-field writes (Reset
   *  palette) don't clobber each other. Unrelated values are preserved. */
  setFields: (patch: Record<string, string>) => void;
  setLayout: (patch: Partial<LayoutSettings>) => void;
  resetLayout: () => void;
  setDuration: (seconds: number) => void;
  resetDraft: () => void;
  /** Save the CURRENT target (draft or the selected rundown item) as a preset. */
  saveAsPreset: (name: string) => void;
  /** Copy a stored graphic's payload into the CURRENT target. Draft loads into
   *  the ad-hoc draft; a rundown item receives the payload while keeping its
   *  own item id, ordering, and rundown membership. Never publishes. */
  applyPreset: (graphic: GraphicInstance) => void;
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
  const setFieldsDraft = useLiveLayerStore((state) => state.setFields);
  const savePreset = useLiveLayerStore((state) => state.savePreset);
  const savePresetFromInstance = useLiveLayerStore((state) => state.savePresetFromInstance);
  const loadGraphicInstance = useLiveLayerStore((state) => state.loadGraphicInstance);

  const rundown = rd.activeRundown;
  const item = getSelectedItem(rundown);

  if (rundown && item) {
    const rundownId = rundown.id;
    const itemId = item.id;
    const graphic = item.graphic;

    /**
     * The item's graphic AS IT IS NOW, resolved when a writer runs rather than
     * when this render closed over it.
     *
     * A logo upload awaits image processing and an IndexedDB write, so the
     * callback that finally writes can be several hundred milliseconds — and
     * any number of content edits — older than the snapshot it captured.
     * Spreading that snapshot back over the item silently undid whatever was
     * typed while the image was saving. The draft path has never had this
     * problem (the store's own `set(state => …)` is latest-based), so reading
     * fresh here makes the two targets behave the same way.
     *
     * When the item is gone — deleted mid-write — this falls back to the
     * captured snapshot and `updateItem` matches no item, so the write is
     * dropped instead of resurrecting a deleted item.
     */
    const latest = (): GraphicInstance =>
      getRundown(rundownId)?.items.find((entry) => entry.id === itemId)?.graphic ?? graphic;

    // `changes` is a function of the CURRENT graphic so that patches derived
    // from the old snapshot (layout merges, values merges) can't sneak a stale
    // read past the fresh one.
    const patch = (changes: (current: GraphicInstance) => Partial<GraphicInstance>) => {
      const current = latest();
      updateItem(rundownId, itemId, { graphic: { ...current, ...changes(current) } });
    };

    /**
     * Every values write goes through here so a stored graphic's asset
     * bookkeeping cannot drift from its values: `assetRefs` and the legacy
     * `theme.logoAssetId` are reconciled in the SAME updateItem call, so the
     * two can never be momentarily inconsistent — and an export can never
     * bundle an image the operator removed.
     */
    const patchValues = (
      nextValues: (current: GraphicInstance) => Record<string, string>,
      patchKeys: readonly string[]
    ) => patch((current) => reconcileGraphicAssets(current, nextValues(current), patchKeys));

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
      // Selecting a design variant must merge its signature palette here too —
      // the same rule as the draft path — or a rundown item would switch look
      // while keeping the previous variant's colours. Non-variant fields are a
      // plain patch.
      // A typed logo URL supersedes an upload here too — same rule as the draft
      // path, so a URL entered against an item that carries a stored asset
      // cannot save while changing nothing on screen.
      setField: (key, value) =>
        patchValues(
          (current) =>
            key === 'variantId'
              ? applyVariantSelection(current.values, current.templateId, value)
              : key === 'logoUrl'
                ? applyLogoUrl(current.values, value)
                : { ...current.values, [key]: value },
          [key]
        ),
      // Atomic multi-field write: one updateItem over the current values, so
      // all fields land together instead of each overwriting the last from the
      // render-time snapshot.
      setFields: (fieldPatch) =>
        patchValues((current) => ({ ...current.values, ...fieldPatch }), Object.keys(fieldPatch)),
      setLayout: (p) => patch((current) => ({ layout: { ...(current.layout ?? {}), ...p } })),
      resetLayout: () => patch(() => ({ layout: {} })),
      setDuration: (seconds) => patch(() => ({ durationSeconds: seconds })),
      resetDraft: () => {
        /* No destructive reset of a rundown item in R4. */
      },
      // Save the VISIBLE item, not the hidden ad-hoc draft — and what it holds
      // at click time, not at the render the button was drawn in.
      saveAsPreset: (name) => savePresetFromInstance(latest(), name),
      // Copy the preset payload onto this item, keeping the item's own graphic
      // id so item identity/ordering/membership and the rundown cursor are
      // untouched. Nothing is published — output only changes on the next Take.
      applyPreset: (preset) =>
        updateItem(rundownId, itemId, {
          graphic: { ...cloneRundownGraphic(preset), id: latest().id }
        })
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
    setFields: setFieldsDraft,
    setLayout,
    resetLayout,
    setDuration: setDurationSeconds,
    resetDraft,
    saveAsPreset: (name) => savePreset(name),
    applyPreset: (preset) => loadGraphicInstance(preset)
  };
}
