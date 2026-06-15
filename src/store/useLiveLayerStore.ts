import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { GraphicInstance, TemplateDefinition } from '../types/graphics';
import type { PersonProfile } from '../types/people';
import type { LayoutSettings } from '../types/layout';
import { clearAllData, loadBrandOverrides, loadPresets, loadRecentGraphics, saveBrandOverrides, savePresets, saveRecentGraphics } from '../lib/storage';
import { clearAllAssets } from '../lib/assets/assetStore';
import { clearPeople } from '../lib/people/peopleStore';
import { clearAllRundowns } from '../lib/rundown/rundownStore';
import { templateRegistry } from '../components/templates/registry';

interface LiveLayerState {
  currentTemplateId: string;
  draftValues: Record<string, string>;
  theme: TemplateDefinition['theme'];
  layout: LayoutSettings;
  durationSeconds: number;
  presets: GraphicInstance[];
  recent: GraphicInstance[];
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

function createDraftValues(templateId: string) {
  const template = templateRegistry.find((item) => item.id === templateId);
  return template ? { ...template.defaultValues } : {};
}

export const useLiveLayerStore = create<LiveLayerState>()(
  devtools((set, get) => ({
    currentTemplateId: templateRegistry[0].id,
    draftValues: createDraftValues(templateRegistry[0].id),
    theme: loadBrandOverrides(),
    layout: {},
    durationSeconds: 6,
    presets: loadPresets(),
    recent: loadRecentGraphics(),
    setTemplate: (templateId) =>
      set((state) => ({
        currentTemplateId: templateId,
        draftValues: {
          ...createDraftValues(templateId),
          logoUrl: state.draftValues.logoUrl,
          logoAssetId: state.draftValues.logoAssetId
        }
      })),
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
          ...createDraftValues(state.currentTemplateId),
          logoUrl: state.draftValues.logoUrl,
          logoAssetId: state.draftValues.logoAssetId
        }
      })),
    resetTheme: () =>
      set((state) => {
        const defaults = loadBrandOverrides();
        saveBrandOverrides(defaults);
        return { theme: defaults };
      }),
    clearLocalData: () =>
      set(() => {
        clearAllData();
        clearAllRundowns();
        clearAllAssets().catch(() => undefined);
        clearPeople().catch(() => undefined);
        return {
          currentTemplateId: templateRegistry[0].id,
          draftValues: createDraftValues(templateRegistry[0].id),
          theme: loadBrandOverrides(),
          layout: {},
          durationSeconds: 6,
          presets: [],
          recent: []
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
          primaryColor: graphic.theme.primaryColor || '#ffffff',
          accentColor: graphic.theme.accentColor || '#38bdf8',
          backgroundColor: graphic.theme.backgroundColor || 'transparent'
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
            ...createDraftValues('preacher-lower-third'),
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
