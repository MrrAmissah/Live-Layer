import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { GraphicInstance, QuickQueueItem, TemplateDefinition } from '../types/graphics';
import type { ProgramSourceType, ProgramState } from '../types/program';
import { CLEAR_PROGRAM_STATE } from '../types/program';
import type { PersonProfile } from '../types/people';
import type { LayoutSettings } from '../types/layout';
import { clearAllData, defaultBrandTheme, loadBrandOverrides, loadExplicitBrandKeys, loadPresets, loadProgram, loadQuickQueue, loadRecentGraphics, saveBrandOverrides, saveExplicitBrandKeys, savePresets, saveProgram, saveQuickQueue, saveRecentGraphics, type ExplicitBrandKey } from '../lib/storage';
import { clearAllAssets } from '../lib/assets/assetStore';
import { clearPeople } from '../lib/people/peopleStore';
import { clearAllRundowns } from '../lib/rundown/rundownStore';
import { templateRegistry } from '../components/templates/registry';
import { loadActivePackId, saveActivePackId } from '../lib/packs';
import { createDraftValues, THEME_SEEDED_FIELDS } from '../lib/draftSeed';
import { applyVariantSelection } from '../lib/variantPalette';
import { applyLogoUrl } from '../lib/brandWrites';
import { resetScriptureDraft } from '../lib/scripture/scriptureDraftStore';

/** Inputs for updateQuickQueueItem — a partial edit guarded by expectedRevision. */
export interface QuickQueueUpdate {
  id: string;
  expectedRevision: number;
  values?: Record<string, string>;
  theme?: Partial<TemplateDefinition['theme']>;
  layout?: LayoutSettings;
  durationSeconds?: number;
}

export type QuickQueueUpdateResult =
  | { ok: true; item: QuickQueueItem }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'stale'; current: QuickQueueItem };

/** What produced a graphic being taken to air — for the Program source label. */
export interface ProgramSource {
  sourceType: ProgramSourceType;
  sourceId: string | null;
}

interface LiveLayerState {
  currentTemplateId: string;
  draftValues: Record<string, string>;
  /** Theme of the CURRENT ad-hoc graphic. Travels with it into Take, presets
   *  and the quick queue, and is replaced wholesale by loadGraphicInstance. */
  theme: TemplateDefinition['theme'];
  /** The persisted brand default that seeds FUTURE graphics. Deliberately
   *  separate from `theme`: loading a preset or queue item must not redefine
   *  what the next new graphic looks like. */
  brandTheme: TemplateDefinition['theme'];
  /** Which brand swatches the operator has actually chosen. Paired with
   *  brandTheme to drive seeding; tracked rather than inferred so a choice that
   *  equals the built-in default still seeds (see loadExplicitBrandKeys). */
  explicitBrandKeys: ExplicitBrandKey[];
  layout: LayoutSettings;
  durationSeconds: number;
  presets: GraphicInstance[];
  recent: GraphicInstance[];
  /** Last-used auto-hide duration per template, so defaults don't leak across. */
  durationByTemplate: Record<string, number>;
  quickQueue: QuickQueueItem[];
  addToQuickQueue: (label: string, valueOverrides?: Record<string, string>) => void;
  removeFromQuickQueue: (id: string) => void;
  moveInQuickQueue: (id: string, delta: -1 | 1) => void;
  /** Save an edit back into a queued item; stale-write protected, never touches Program. */
  updateQuickQueueItem: (update: QuickQueueUpdate) => QuickQueueUpdateResult;
  /** Operator-side record of what has been commanded on air (never a second protocol). */
  program: ProgramState;
  markProgramShowing: (input: { snapshot: GraphicInstance; commandId: string; source: ProgramSource }) => void;
  markProgramClear: () => void;
  /** Records a publish that never reached output. Source is passed explicitly so
   *  the failed record never inherits the previous Program's source. */
  markProgramFailed: (input?: { snapshot?: GraphicInstance; commandId?: string; source?: ProgramSource }) => void;
  activePackId: string;
  setActivePack: (packId: string) => void;
  /** True when the ad-hoc draft differs from a fresh seed for the current
   *  template + active pack — i.e. the operator has edits a pack switch would
   *  discard. Uses the same seeding logic as setActivePack, so it can't drift. */
  isDraftDirty: () => boolean;
  setTemplate: (templateId: string) => void;
  setField: (fieldId: string, value: string) => void;
  /** Merge several draft fields in ONE update (atomic; used by Reset palette). */
  setFields: (patch: Record<string, string>) => void;
  setTheme: (theme: Partial<TemplateDefinition['theme']>) => void;
  setLayout: (layout: Partial<LayoutSettings>) => void;
  resetLayout: () => void;
  setDurationSeconds: (duration: number) => void;
  resetDraft: () => void;
  resetTheme: () => void;
  clearLocalData: () => void;
  savePreset: (name: string) => void;
  /** Create a preset from any source graphic (draft or rundown item) using the
   *  same rules as savePreset. */
  savePresetFromInstance: (source: GraphicInstance, name: string) => void;
  loadGraphicInstance: (graphic: GraphicInstance) => void;
  applyPersonToLowerThird: (person: PersonProfile) => void;
  removePreset: (id: string) => void;
  addRecent: (item: GraphicInstance) => void;
}

const DEFAULT_DURATION_SECONDS = 6;

/**
 * Field equality for the dirty check. Colour fields are compared
 * case-insensitively for the same reason visualOverrides does it: registry and
 * pack literals are mixed case (`#E8B93C`) while `<input type="color">` always
 * emits lowercase, so re-picking the colour already in use read as an edit and
 * raised the destructive pack-switch confirmation over a no-op.
 */
function sameFieldValue(key: string, a: string | undefined, b: string | undefined): boolean {
  if (key.startsWith('color')) {
    return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
  }
  return a === b;
}

function deepClone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

/** The operator's logo choice survives draft rebuilds without an absent value
 *  clobbering a pack's own logo default. */
function carriedLogo(values: Record<string, string>) {
  return {
    ...(values.logoUrl ? { logoUrl: values.logoUrl } : {}),
    ...(values.logoAssetId ? { logoAssetId: values.logoAssetId } : {})
  };
}

interface DraftLike {
  currentTemplateId: string;
  draftValues: Record<string, string>;
  theme: TemplateDefinition['theme'];
  layout: LayoutSettings;
  durationSeconds: number;
}

/**
 * Snapshot the current draft as an immutable GraphicInstance — the single
 * construction path shared by Take (ControlPage), saved presets, and the
 * quick queue, so a new GraphicInstance field only has to be added here.
 */
export function buildInstanceFromDraft(
  draft: DraftLike,
  options: { idPrefix?: string; presetName?: string; valueOverrides?: Record<string, string> } = {}
): GraphicInstance {
  const values = { ...deepClone(draft.draftValues), ...(options.valueOverrides ?? {}) };
  return {
    id: `${options.idPrefix ?? ''}${Date.now()}${options.idPrefix ? `-${Math.random().toString(36).slice(2, 7)}` : ''}`,
    templateId: draft.currentTemplateId,
    ...(options.presetName !== undefined ? { presetName: options.presetName } : {}),
    values,
    theme: deepClone(draft.theme),
    layout: deepClone(draft.layout),
    assetRefs: {
      ...(values.headshotAssetId ? { headshot: values.headshotAssetId } : {}),
      ...(values.logoAssetId ? { logo: values.logoAssetId } : {})
    },
    personId: values.personId,
    durationSeconds: draft.durationSeconds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

const initialPackId = loadActivePackId();
const initialTheme = loadBrandOverrides();
const initialExplicitBrandKeys = loadExplicitBrandKeys();

export const useLiveLayerStore = create<LiveLayerState>()(
  devtools((set, get) => ({
    currentTemplateId: templateRegistry[0].id,
    draftValues: createDraftValues(templateRegistry[0].id, initialPackId, initialTheme, initialExplicitBrandKeys),
    activePackId: initialPackId,
    setActivePack: (packId) =>
      set((state) => {
        saveActivePackId(packId);
        return {
          activePackId: packId,
          // A pack switch re-seeds a fresh ad-hoc graphic, so it wears the
          // brand default — never a theme carried in by a loaded snapshot.
          theme: { ...state.brandTheme },
          draftValues: createDraftValues(state.currentTemplateId, packId, state.brandTheme, state.explicitBrandKeys)
        };
      }),
    isDraftDirty: () => {
      const { draftValues, currentTemplateId, activePackId, brandTheme, explicitBrandKeys } = get();
      // Same seed setActivePack would re-create, from the same inputs, so
      // "clean" is defined identically and the pack guard cannot drift.
      const seed = createDraftValues(currentTemplateId, activePackId, brandTheme, explicitBrandKeys);
      const keys = new Set([...Object.keys(seed), ...Object.keys(draftValues)]);
      for (const key of keys) {
        if (!sameFieldValue(key, draftValues[key], seed[key])) return true;
      }
      return false;
    },
    theme: { ...initialTheme },
    brandTheme: { ...initialTheme },
    explicitBrandKeys: initialExplicitBrandKeys,
    layout: {},
    durationSeconds: 6,
    durationByTemplate: {},
    presets: loadPresets(),
    recent: loadRecentGraphics(),
    quickQueue: loadQuickQueue(),
    program: loadProgram(),
    addToQuickQueue: (label, valueOverrides) => {
      const state = get();
      const item: QuickQueueItem = {
        ...buildInstanceFromDraft(state, { idPrefix: 'q-', presetName: label, valueOverrides }),
        revision: 1
      };
      const next = [...state.quickQueue, item];
      saveQuickQueue(next);
      set({ quickQueue: next });
    },
    removeFromQuickQueue: (id) => {
      const next = get().quickQueue.filter((item) => item.id !== id);
      saveQuickQueue(next);
      set({ quickQueue: next });
    },
    moveInQuickQueue: (id, delta) => {
      const queue = [...get().quickQueue];
      const index = queue.findIndex((item) => item.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= queue.length) return;
      [queue[index], queue[target]] = [queue[target], queue[index]];
      saveQuickQueue(queue);
      set({ quickQueue: queue });
    },
    updateQuickQueueItem: (update) => {
      const queue = get().quickQueue;
      const index = queue.findIndex((item) => item.id === update.id);
      if (index < 0) return { ok: false, reason: 'not-found' };
      const current = queue[index];
      // Optimistic concurrency: refuse to overwrite a version we didn't see.
      if (current.revision !== update.expectedRevision) {
        return { ok: false, reason: 'stale', current };
      }
      const updated: QuickQueueItem = {
        ...deepClone(current),
        ...(update.values ? { values: { ...current.values, ...update.values } } : {}),
        ...(update.theme ? { theme: { ...current.theme, ...update.theme } } : {}),
        ...(update.layout ? { layout: { ...(current.layout ?? {}), ...update.layout } } : {}),
        ...(update.durationSeconds !== undefined ? { durationSeconds: update.durationSeconds } : {}),
        revision: current.revision + 1,
        updatedAt: new Date().toISOString()
      };
      // Replace only the target; siblings keep their identity untouched. Program
      // is deliberately not modified — this is Save to Queue Item.
      const next = queue.map((item, i) => (i === index ? updated : item));
      saveQuickQueue(next);
      set({ quickQueue: next });
      return { ok: true, item: updated };
    },
    markProgramShowing: ({ snapshot, commandId, source }) =>
      set(() => {
        const next: ProgramState = {
          status: 'showing',
          confirmation: 'unconfirmed',
          commandId,
          instanceId: snapshot.id,
          templateId: snapshot.templateId,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          snapshot: deepClone(snapshot),
          takenAt: Date.now(),
          clearedAt: null
        };
        saveProgram(next);
        return { program: next };
      }),
    markProgramClear: () =>
      set(() => {
        const next: ProgramState = { ...CLEAR_PROGRAM_STATE, clearedAt: Date.now() };
        saveProgram(next);
        return { program: next };
      }),
    /**
     * Record a publish that did not reach output. Built from CLEAR_PROGRAM_STATE
     * rather than spread over the previous program, so a failed record can never
     * inherit stale source metadata from an earlier successful Take — every
     * field describes the ATTEMPT, or is deliberately null.
     */
    markProgramFailed: (input) =>
      set(() => {
        const next: ProgramState = {
          ...CLEAR_PROGRAM_STATE,
          status: 'failed',
          confirmation: 'unconfirmed',
          commandId: input?.commandId ?? null,
          instanceId: input?.snapshot?.id ?? null,
          templateId: input?.snapshot?.templateId ?? null,
          sourceType: input?.source?.sourceType ?? null,
          sourceId: input?.source?.sourceId ?? null,
          snapshot: input?.snapshot ? deepClone(input.snapshot) : null,
          takenAt: null,
          clearedAt: null
        };
        saveProgram(next);
        return { program: next };
      }),
    setTemplate: (templateId) =>
      set((state) => {
        const template = templateRegistry.find((item) => item.id === templateId);
        return {
          currentTemplateId: templateId,
          // Each template keeps its own auto-hide duration: the operator's
          // last choice for it, else its declared default, else 6s.
          durationSeconds:
            state.durationByTemplate[templateId] ??
            template?.defaultDurationSeconds ??
            DEFAULT_DURATION_SECONDS,
          // Selecting a template starts a new graphic: it wears the brand
          // default, so a previously loaded snapshot's theme cannot leak in.
          theme: { ...state.brandTheme },
          draftValues: {
            ...createDraftValues(templateId, state.activePackId, state.brandTheme, state.explicitBrandKeys),
            ...carriedLogo(state.draftValues)
          }
        };
      }),
    setField: (fieldId, value) =>
      set((state) => {
        // Choosing a design sample also loads its signature palette so the
        // color controls correspond to the selected look — one shared rule with
        // the rundown-item path (see useEditTarget / applyVariantSelection).
        if (fieldId === 'variantId') {
          return { draftValues: applyVariantSelection(state.draftValues, state.currentTemplateId, value) };
        }
        // A typed logo URL supersedes an upload — renderers prefer a ready
        // asset, so leaving both would make the URL silently do nothing.
        if (fieldId === 'logoUrl') {
          return { draftValues: applyLogoUrl(state.draftValues, value) };
        }
        return {
          draftValues: {
            ...state.draftValues,
            [fieldId]: value
          }
        };
      }),
    setFields: (patch) =>
      set((state) => ({ draftValues: { ...state.draftValues, ...patch } })),
    setTheme: (theme) =>
      set((state) => {
        const next = {
          ...state.theme,
          ...theme
        };
        // Every setTheme is a draft-mode swatch choice (a selected rundown item
        // never reaches here), so any brand key present in the patch is now an
        // explicit selection — including one that happens to equal the default.
        const explicit = new Set(state.explicitBrandKeys);
        for (const { themeKey } of THEME_SEEDED_FIELDS) {
          if (theme[themeKey] !== undefined) explicit.add(themeKey);
        }
        const explicitBrandKeys = [...explicit];
        // The draft IS the next new graphic, so a swatch moves the current
        // graphic and the persisted default together. Only this path writes
        // brand storage.
        const brandTheme = { ...state.brandTheme, ...theme };
        saveBrandOverrides(brandTheme);
        saveExplicitBrandKeys(explicitBrandKeys);
        return { theme: next, brandTheme, explicitBrandKeys };
      }),
    setLayout: (layout) =>
      set((state) => ({
        layout: {
          ...state.layout,
          ...layout
        }
      })),
    resetLayout: () => set(() => ({ layout: {} })),
    setDurationSeconds: (duration) =>
      set((state) => ({
        durationSeconds: duration,
        durationByTemplate: { ...state.durationByTemplate, [state.currentTemplateId]: duration }
      })),
    resetDraft: () =>
      set((state) => ({
        theme: { ...state.brandTheme },
        draftValues: {
          ...createDraftValues(state.currentTemplateId, state.activePackId, state.brandTheme, state.explicitBrandKeys),
          ...carriedLogo(state.draftValues)
        }
      })),
    resetTheme: () =>
      set((state) => {
        // Back to "nothing chosen": templates seed their own accents again.
        const defaults = defaultBrandTheme();
        saveBrandOverrides(defaults);
        saveExplicitBrandKeys([]);
        return {
          // Brand owns exactly two slots. The CURRENT graphic keeps the rest of
          // its theme — primaryColor / surfaceColor / backgroundColor describe
          // that graphic, not the brand, and on a legacy graphic without
          // matching colour values they are what the renderer paints. Replacing
          // the whole theme here silently restyled a loaded preset.
          theme: {
            ...state.theme,
            accentColor: defaults.accentColor,
            ...(defaults.accent2Color !== undefined ? { accent2Color: defaults.accent2Color } : {})
          },
          // The persisted default is not a graphic, so it does go back whole.
          brandTheme: { ...defaults },
          explicitBrandKeys: []
        };
      }),
    clearLocalData: () =>
      set(() => {
        clearAllData();
        clearAllRundowns();
        clearAllAssets().catch(() => undefined);
        clearPeople().catch(() => undefined);
        /**
         * The Scripture workspace's scratchpad lives in a module store, not in
         * this one, so a wipe of localStorage and of this state left the retrieved
         * passage and typed reference sitting on screen — the operator resets and
         * the previous service's verse is still there. Its recents are already
         * cleared by `clearAllData`, because that key is registered in
         * STORAGE_KEYS; only the in-memory draft needs saying.
         */
        resetScriptureDraft();
        saveActivePackId('house');
        // Storage has just been wiped, so the brand IS the default now. Seeding
        // from the pre-clear theme would re-apply a colour the reset erased.
        const clearedTheme = defaultBrandTheme();
        return {
          currentTemplateId: templateRegistry[0].id,
          draftValues: createDraftValues(templateRegistry[0].id, 'house', clearedTheme, []),
          activePackId: 'house',
          theme: { ...clearedTheme },
          brandTheme: { ...clearedTheme },
          explicitBrandKeys: [],
          layout: {},
          durationSeconds: 6,
          durationByTemplate: {},
          presets: [],
          recent: [],
          quickQueue: [],
          program: { ...CLEAR_PROGRAM_STATE }
        };
      }),
    savePreset: (name) => {
      // Draft save routes through the same creation rules as a rundown-item
      // save, so both produce identical preset shapes.
      get().savePresetFromInstance(buildInstanceFromDraft(get()), name);
    },
    savePresetFromInstance: (source, name) => {
      set((state) => {
        // A preset is a fresh, independent copy of some source graphic: new id,
        // the given name, fresh timestamps, deep-cloned payload so later edits
        // to the source (draft or rundown item) never mutate the stored preset.
        const preset: GraphicInstance = {
          ...deepClone(source),
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          presetName: name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const next = [...state.presets, preset];
        savePresets(next);
        return { presets: next };
      });
    },
    loadGraphicInstance: (graphic) => {
      // Loading a stored graphic is not a brand decision. Only the CURRENT
      // graphic's theme is replaced; brandTheme, the explicit markers and both
      // brand storage keys are untouched, so the next new graphic still wears
      // the operator's saved default rather than this snapshot's colours.
      set(() => ({
        currentTemplateId: graphic.templateId,
        draftValues: { ...graphic.values },
        theme: {
          ...defaultBrandTheme(),
          ...graphic.theme
        },
        layout: graphic.layout ?? {},
        durationSeconds: graphic.durationSeconds
      }));
    },
    applyPersonToLowerThird: (person) =>
      set((state) => {
        const subtitle = person.churchName || person.subtitle || '';
        return {
          currentTemplateId: 'preacher-lower-third',
          // Switching template starts a new graphic, so it wears the brand —
          // the same rule setTemplate/setActivePack/resetDraft follow. Without
          // this, a theme installed by loadGraphicInstance survived into it.
          theme: { ...state.brandTheme },
          draftValues: {
            ...createDraftValues('preacher-lower-third', state.activePackId, state.brandTheme, state.explicitBrandKeys),
            ...state.draftValues,
            personId: person.id,
            name: person.displayName,
            title: person.title ?? '',
            subtitle,
            headshotAssetId: person.headshotAssetId ?? '',
            logoAssetId: person.logoAssetId ?? state.draftValues.logoAssetId ?? '',
            logoUrl: person.logoAssetId ? '' : state.draftValues.logoUrl ?? ''
          }
        };
      }),
    removePreset: (id) => {
      const state = get();
      const next = state.presets.filter((item) => item.id !== id);
      savePresets(next);
      set({ presets: next });
    },
    addRecent: (item) => {
      const state = get();
      const next = [item, ...state.recent.filter((entry) => entry.id !== item.id)].slice(0, 8);
      saveRecentGraphics(next);
      set({ recent: next });
    }
  }))
);
