import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { GraphicInstance, QuickQueueItem, TemplateDefinition } from '../types/graphics';
import type { ProgramSourceType, ProgramState } from '../types/program';
import { CLEAR_PROGRAM_STATE } from '../types/program';
import type { PersonProfile } from '../types/people';
import type { LayoutSettings } from '../types/layout';
import { clearAllData, defaultBrandTheme, loadBrandOverrides, loadPresets, loadProgram, loadQuickQueue, loadRecentGraphics, saveBrandOverrides, savePresets, saveProgram, saveQuickQueue, saveRecentGraphics } from '../lib/storage';
import { clearAllAssets } from '../lib/assets/assetStore';
import { clearPeople } from '../lib/people/peopleStore';
import { clearAllRundowns } from '../lib/rundown/rundownStore';
import { templateRegistry } from '../components/templates/registry';
import { loadActivePackId, packOverridesFor, saveActivePackId } from '../lib/packs';
import { applyVariantSelection } from '../lib/variantPalette';

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
  theme: TemplateDefinition['theme'];
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
  setTemplate: (templateId: string) => void;
  setField: (fieldId: string, value: string) => void;
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

function createDraftValues(templateId: string, packId: string) {
  const template = templateRegistry.find((item) => item.id === templateId);
  if (!template) return {};
  return { ...template.defaultValues, ...packOverridesFor(packId, templateId) };
}

const DEFAULT_DURATION_SECONDS = 6;

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

export const useLiveLayerStore = create<LiveLayerState>()(
  devtools((set, get) => ({
    currentTemplateId: templateRegistry[0].id,
    draftValues: createDraftValues(templateRegistry[0].id, initialPackId),
    activePackId: initialPackId,
    setActivePack: (packId) =>
      set((state) => {
        saveActivePackId(packId);
        return {
          activePackId: packId,
          draftValues: createDraftValues(state.currentTemplateId, packId)
        };
      }),
    theme: loadBrandOverrides(),
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
          draftValues: {
            ...createDraftValues(templateId, state.activePackId),
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
        return {
          draftValues: {
            ...state.draftValues,
            [fieldId]: value
          }
        };
      }),
    setTheme: (theme) =>
      set((state) => {
        const next = {
          ...state.theme,
          ...theme
        };
        saveBrandOverrides(next);
        return { theme: next };
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
        draftValues: {
          ...createDraftValues(state.currentTemplateId, state.activePackId),
          ...carriedLogo(state.draftValues)
        }
      })),
    resetTheme: () =>
      set(() => {
        const defaults = defaultBrandTheme();
        saveBrandOverrides(defaults);
        return { theme: defaults };
      }),
    clearLocalData: () =>
      set(() => {
        clearAllData();
        clearAllRundowns();
        clearAllAssets().catch(() => undefined);
        clearPeople().catch(() => undefined);
        saveActivePackId('house');
        return {
          currentTemplateId: templateRegistry[0].id,
          draftValues: createDraftValues(templateRegistry[0].id, 'house'),
          activePackId: 'house',
          theme: loadBrandOverrides(),
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
          draftValues: {
            ...createDraftValues('preacher-lower-third', state.activePackId),
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
