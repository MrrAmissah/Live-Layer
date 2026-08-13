import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { GraphicInstance, QuickQueueItem, RealtimeMessage, TemplateDefinition } from '../types/graphics';
import type { OutputStatusMap, ProgramSourceType, ProgramState } from '../types/program';
import {
  loadScriptureOutputs,
  sanitizeScriptureOutputs,
  type ScriptureOutputMap,
  type ScriptureOutputScreen
} from '../lib/scriptureOutputs';
import { CLEAR_PROGRAM_STATE } from '../types/program';
import {
  bufferPendingAck,
  drainPendingAcks,
  isOutputAck,
  reduceRealtimeMessage,
  type PendingAck
} from '../lib/programSync';
import type { PersonProfile } from '../types/people';
import type { LayoutSettings } from '../types/layout';
import { clearAllData, defaultBrandTheme, loadBrandOverrides, loadExplicitBrandKeys, loadPresets, loadProgram, loadQuickQueue, loadRecentGraphics, saveBrandOverrides, saveExplicitBrandKeys, savePresets, saveProgram, saveQuickQueue, saveScriptureOutputs, saveRecentGraphics, type ExplicitBrandKey } from '../lib/storage';
import { clearAllAssets } from '../lib/assets/assetStore';
import { clearPeople } from '../lib/people/peopleStore';
import { clearAllRundowns } from '../lib/rundown/rundownStore';
import { templateRegistry } from '../components/templates/registry';
import { loadActivePackId, saveActivePackId } from '../lib/packs';
import { createDraftValues, THEME_SEEDED_FIELDS } from '../lib/draftSeed';
import { createWorkingDraftWriter, readWorkingDraft, type WorkingDraft } from '../lib/workingDraft';
import { applyVariantSelection } from '../lib/variantPalette';
import { applyLogoUrl } from '../lib/brandWrites';
import { resetServiceContextCache } from '../lib/serviceContext';
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
  /**
   * Liveness/source readings of every output screen that has spoken, keyed by
   * output session id. Never persisted — presence is about right now.
   *
   * A map rather than one record because a second browser source is an
   * ordinary rig, not an exotic one: with a single slot the two screens
   * overwrote each other every few seconds and the desk reported whichever
   * spoke last instead of whether both were up.
   */
  outputs: OutputStatusMap;
  /** Acks that arrived before their command was recorded (see programSync.ts —
   *  a same-browser output acknowledges over BroadcastChannel faster than the
   *  relay answers the publish POST). Drained by markProgramShowing/Clearing. */
  pendingOutputAcks: PendingAck[];
  markProgramShowing: (input: { snapshot: GraphicInstance; commandId: string; source: ProgramSource }) => void;
  /** A Clear was published; Program stays pending until the matching OUTPUT_CLEARED. */
  markProgramClearing: (input: { commandId: string }) => void;
  /** Records a publish that never reached output. Source is passed explicitly so
   *  the failed record never inherits the previous Program's source. */
  markProgramFailed: (input?: { snapshot?: GraphicInstance; commandId?: string; source?: ProgramSource }) => void;
  /** Inbound realtime traffic (remote commands, output acks) — one testable rule
   *  (`lib/programSync.ts`), applied identically by every control client. */
  applyRealtimeMessage: (message: RealtimeMessage) => void;
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
  /**
   * Which look each named screen renders for a scripture card. Scripture only
   * — see `lib/scriptureOutputs.ts` for why the boundary is hard.
   */
  scriptureOutputs: ScriptureOutputMap;
  setScriptureOutput: (screen: ScriptureOutputScreen, variantId: string) => void;
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
    /**
     * Deliberately no `dynamicContext`. This builds a graphic for authoring —
     * a draft Take, a saved graphic, a preset — and only the air boundary
     * freezes the service. `publishShow` stamps whatever it publishes, so a
     * saved graphic reused weeks later counts down to the service being run
     * rather than the one it was written for.
     */
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

const initialPackId = loadActivePackId();
const initialTheme = loadBrandOverrides();
const initialExplicitBrandKeys = loadExplicitBrandKeys();

/**
 * The restored working draft, read ONCE while the initial state is being built.
 *
 * Deliberately not an effect. Hydrating after mount would mean the default seed
 * exists first, and the persistence subscription below would see that seed as a
 * change and write it over the record it was about to restore — the draft would
 * be destroyed by the act of loading it. Reading it here means the seed for a
 * restored draft is never constructed at all, so there is no race to lose.
 *
 * `null` — absent, corrupt, wrong version, unknown template, or any invalid
 * field — falls through to exactly the pack seed that shipped before this.
 */
const restoredDraft = readWorkingDraft((templateId) =>
  templateRegistry.some((template) => template.id === templateId)
);

export const useLiveLayerStore = create<LiveLayerState>()(
  devtools((set, get) => ({
    currentTemplateId: restoredDraft?.templateId ?? templateRegistry[0].id,
    draftValues: restoredDraft
      ? { ...restoredDraft.values }
      : createDraftValues(templateRegistry[0].id, initialPackId, initialTheme, initialExplicitBrandKeys),
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
    // The restored theme is the CURRENT graphic's, exactly as loadGraphicInstance
    // treats a preset's. `brandTheme` and `explicitBrandKeys` are read from
    // their own storage regardless, so restoring a draft can never redefine what
    // the next NEW graphic looks like.
    theme: restoredDraft ? { ...restoredDraft.theme } : { ...initialTheme },
    brandTheme: { ...initialTheme },
    explicitBrandKeys: initialExplicitBrandKeys,
    layout: restoredDraft ? { ...restoredDraft.layout } : {},
    durationSeconds: restoredDraft?.durationSeconds ?? DEFAULT_DURATION_SECONDS,
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
    outputs: {},
    scriptureOutputs: loadScriptureOutputs(),
    pendingOutputAcks: [],
    markProgramShowing: ({ snapshot, commandId, source }) =>
      set((state) => {
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
          clearedAt: null,
          appliedAt: null,
          outputFailure: null
        };
        // A same-browser output may have acknowledged this command before we
        // got here (ack-before-mark race) — settle with anything buffered.
        const drained = drainPendingAcks(
          { program: next, outputs: state.outputs },
          state.pendingOutputAcks,
          Date.now()
        );
        saveProgram(drained.program);
        return { program: drained.program, outputs: drained.outputs, pendingOutputAcks: drained.pending };
      }),
    /**
     * A published Clear is a command like any other: until output answers with
     * the matching OUTPUT_CLEARED, the previous graphic may still be on air, so
     * Program records `clearing`, never a confident empty. The last graphic's
     * identity is kept for "Last sent" wording; `clearedAt` marks when the
     * clear was COMMANDED and is finalised by the acknowledgement
     * (`lib/programSync.ts`).
     */
    markProgramClearing: ({ commandId }) =>
      set((state) => {
        // Clearing an already-clear Program claims nothing new, so it does not
        // enter a pending state that only an output could resolve — with no
        // output page open, that pending would hang forever over an empty air.
        if (state.program.status === 'clear') {
          const next: ProgramState = { ...CLEAR_PROGRAM_STATE, clearedAt: Date.now() };
          saveProgram(next);
          return { program: next };
        }
        const next: ProgramState = {
          ...state.program,
          status: 'clearing',
          confirmation: 'unconfirmed',
          commandId,
          appliedAt: null,
          outputFailure: null,
          clearedAt: Date.now()
        };
        // Same ack-before-mark race as Take — worse here, because a CLEAR is
        // acknowledged instantly (no asset work), so a same-browser output's
        // OUTPUT_CLEARED reliably beats the relay's POST response.
        const drained = drainPendingAcks(
          { program: next, outputs: state.outputs },
          state.pendingOutputAcks,
          Date.now()
        );
        saveProgram(drained.program);
        return { program: drained.program, outputs: drained.outputs, pendingOutputAcks: drained.pending };
      }),
    applyRealtimeMessage: (message) =>
      set((state) => {
        const now = Date.now();
        const change = reduceRealtimeMessage(
          { program: state.program, outputs: state.outputs },
          message,
          now
        );
        if (change.program) saveProgram(change.program);
        // An ack the reducer refused may simply be EARLY (its command's
        // markProgram* has not run yet) — keep it briefly for the drain.
        const refusedAck = !change.program && isOutputAck(message) ? message : null;
        const pendingOutputAcks = bufferPendingAck(state.pendingOutputAcks, refusedAck, now);
        return {
          ...(change.program ? { program: change.program } : {}),
          ...(change.outputs ? { outputs: change.outputs } : {}),
          ...(pendingOutputAcks !== state.pendingOutputAcks ? { pendingOutputAcks } : {})
        };
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
    setScriptureOutput: (screen, variantId) =>
      set((state) => {
        const next = sanitizeScriptureOutputs({ ...state.scriptureOutputs, [screen]: variantId });
        saveScriptureOutputs(next);
        return { scriptureOutputs: next };
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
    clearLocalData: () => {
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
        /**
         * Same shape of leak, one module along: the service is held in memory
         * and only persisted to a key `clearAllData` just removed. Without this
         * the setup bar would keep naming the reset service until a reload, and
         * — worse — the next Take would freeze its start time into a graphic.
         */
        resetServiceContextCache();
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
      });
      /**
       * AFTER the set, not inside it. `setState` notifies subscribers
       * synchronously, so by this line the persistence subscription below has
       * already scheduled a write of the fresh default — and that write would
       * land a few hundred milliseconds later and re-create the very record
       * `clearAllData` just removed. Cancelling here is what makes "Reset all
       * local data" actually leave nothing behind.
       */
      workingDraftWriter.reset();
    },
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

/**
 * Working-draft persistence: ONE subscription, not a `save()` in every setter.
 *
 * Twelve paths legitimately move the draft (setTemplate, setField, setFields,
 * setTheme, setLayout, resetLayout, setDurationSeconds, resetDraft, resetTheme,
 * loadGraphicInstance, applyPersonToLowerThird, setActivePack). A hand-kept list
 * of save calls goes stale the moment a thirteenth arrives, and the failure is
 * silent — the operator simply loses that kind of edit on refresh. Subscribing
 * once means the rule is "the draft changed", which cannot drift.
 *
 * Nothing here transmits. The draft never reaches a realtime message, the relay,
 * BroadcastChannel, Program or OUTPUT_STATUS: two control clients share Program
 * truth and keep their own drafts.
 */
export const workingDraftWriter = createWorkingDraftWriter();

function draftOf(state: LiveLayerState): WorkingDraft {
  return {
    templateId: state.currentTemplateId,
    values: state.draftValues,
    theme: state.theme,
    layout: state.layout,
    durationSeconds: state.durationSeconds
  };
}

useLiveLayerStore.subscribe((state, previous) => {
  // Reference comparison, because every setter builds new objects and this
  // listener also runs on each heartbeat, ack and queue edit — on a page that
  // may share a CPU with an encoder, a deep compare here would be the cost.
  if (
    state.currentTemplateId === previous.currentTemplateId &&
    state.draftValues === previous.draftValues &&
    state.theme === previous.theme &&
    state.layout === previous.layout &&
    state.durationSeconds === previous.durationSeconds
  ) {
    return;
  }
  workingDraftWriter.schedule(draftOf(state));
});

// A reload inside the debounce window would otherwise lose the last keystrokes.
// `pagehide` rather than `beforeunload`: it fires for the bfcache path too, and
// after a reset there is nothing pending, so this writes nothing.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => workingDraftWriter.flush());
}
