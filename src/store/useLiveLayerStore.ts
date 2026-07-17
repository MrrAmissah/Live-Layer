import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { GraphicInstance, TemplateDefinition } from '../types/graphics';
import type { PersonProfile } from '../types/people';
import type { LayoutSettings } from '../types/layout';
import { clearAllData, defaultBrandTheme, loadBrandOverrides, loadPresets, loadQuickQueue, loadRecentGraphics, saveBrandOverrides, savePresets, saveQuickQueue, saveRecentGraphics } from '../lib/storage';
import { clearAllAssets } from '../lib/assets/assetStore';
import { clearPeople } from '../lib/people/peopleStore';
import { clearAllRundowns } from '../lib/rundown/rundownStore';
import { templateRegistry } from '../components/templates/registry';
import { loadActivePackId, packOverridesFor, saveActivePackId } from '../lib/packs';

interface LiveLayerState {
  currentTemplateId: string;
  draftValues: Record<string, string>;
  theme: TemplateDefinition['theme'];
  layout: LayoutSettings;
  durationSeconds: number;
  presets: GraphicInstance[];
  recent: GraphicInstance[];
  quickQueue: GraphicInstance[];
  addToQuickQueue: (label: string, valueOverrides?: Record<string, string>) => void;
  removeFromQuickQueue: (id: string) => void;
  moveInQuickQueue: (id: string, delta: -1 | 1) => void;
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
    presets: loadPresets(),
    recent: loadRecentGraphics(),
    quickQueue: loadQuickQueue(),
    addToQuickQueue: (label, valueOverrides) => {
      const state = get();
      const clone = <T,>(value: T): T =>
        typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
      const item: GraphicInstance = {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        templateId: state.currentTemplateId,
        presetName: label,
        values: { ...clone(state.draftValues), ...(valueOverrides ?? {}) },
        theme: clone(state.theme),
        layout: clone(state.layout),
        assetRefs: {
          ...(state.draftValues.headshotAssetId ? { headshot: state.draftValues.headshotAssetId } : {}),
          ...(state.draftValues.logoAssetId ? { logo: state.draftValues.logoAssetId } : {})
        },
        personId: state.draftValues.personId,
        durationSeconds: state.durationSeconds,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
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
    setTemplate: (templateId) =>
      set((state) => {
        const template = templateRegistry.find((item) => item.id === templateId);
        return {
          currentTemplateId: templateId,
          // Performance templates default auto-hide off; others keep the
          // operator's current duration.
          ...(template?.defaultDurationSeconds !== undefined
            ? { durationSeconds: template.defaultDurationSeconds }
            : {}),
          draftValues: {
            ...createDraftValues(templateId, state.activePackId),
            // Carry the operator's logo across template switches, but never let
            // an absent value clobber the pack's own logo default.
            ...(state.draftValues.logoUrl ? { logoUrl: state.draftValues.logoUrl } : {}),
            ...(state.draftValues.logoAssetId ? { logoAssetId: state.draftValues.logoAssetId } : {})
          }
        };
      }),
    setField: (fieldId, value) =>
      set((state) => ({
        draftValues: {
          ...state.draftValues,
          [fieldId]: value
        }
      })),
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
    setDurationSeconds: (duration) => set(() => ({ durationSeconds: duration })),
    resetDraft: () =>
      set((state) => ({
        draftValues: {
          ...createDraftValues(state.currentTemplateId, state.activePackId),
          ...(state.draftValues.logoUrl ? { logoUrl: state.draftValues.logoUrl } : {}),
          ...(state.draftValues.logoAssetId ? { logoAssetId: state.draftValues.logoAssetId } : {})
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
          presets: [],
          recent: [],
          quickQueue: []
        };
      }),
    savePreset: (name) => {
      const state = get();
      const clone = <T,>(value: T): T =>
        typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
      const item: GraphicInstance = {
        id: `${Date.now()}`,
        templateId: state.currentTemplateId,
        presetName: name,
        values: clone(state.draftValues),
        theme: clone(state.theme),
        layout: clone(state.layout),
        assetRefs: {
          ...(state.draftValues.headshotAssetId ? { headshot: state.draftValues.headshotAssetId } : {}),
          ...(state.draftValues.logoAssetId ? { logo: state.draftValues.logoAssetId } : {})
        },
        personId: state.draftValues.personId,
        durationSeconds: state.durationSeconds,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const next = [...state.presets, item];
      savePresets(next);
      set({ presets: next });
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
