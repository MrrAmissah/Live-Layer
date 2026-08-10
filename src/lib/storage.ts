import type { GraphicInstance, QuickQueueItem, TemplateDefinition } from '../types/graphics';
import type { ProgramState } from '../types/program';
import { CLEAR_PROGRAM_STATE } from '../types/program';
import { clearWorkingDraft } from './workingDraft';

const STORAGE_KEYS = {
  presets: 'livelayer.presets',
  brand: 'livelayer.brand',
  recent: 'livelayer.recent',
  quickQueue: 'livelayer.quickQueue',
  activePack: 'livelayer.activePack',
  brandExplicit: 'livelayer.brandExplicit',
  program: 'livelayer.program',
  scriptureCache: 'livelayer.scriptureCache',
  chapterVerseCache: 'livelayer.chapterVerseCache',
  scriptureRecents: 'livelayer.scriptureRecents',
  scriptureFavorites: 'livelayer.scriptureFavorites',
  dockPrefs: 'livelayer.dockPrefs',
  serviceContext: 'livelayer.serviceContext',
  lastRealtimeMessage: 'livelayer:lastMessage'
};

/**
 * Exported so the scripture recents store reads its key from here rather than
 * redeclaring the string. `clearAllData` wipes exactly `Object.values(STORAGE_KEYS)`,
 * so a key defined locally elsewhere survives "Reset all local data" — which on a
 * shared production machine means one church's passages outliving the reset.
 * (`scriptureCache.ts` and `chapterCache.ts` still declare their own literals;
 * they happen to match, so clear-all works today by coincidence, not by design.)
 */
export const SCRIPTURE_RECENTS_KEY = STORAGE_KEYS.scriptureRecents;
/** Saved passages. Registered here so `clearAllData` wipes it like every other
 *  livelayer key — a key declared locally elsewhere survives a reset, which on a
 *  shared machine means one church's passages outliving it. */
export const SCRIPTURE_FAVORITES_KEY = STORAGE_KEYS.scriptureFavorites;
/** The service being produced. Registered here so "Reset all local data" clears
 *  it with everything else. */
export const SERVICE_CONTEXT_KEY = STORAGE_KEYS.serviceContext;

const DEFAULT_THEME: TemplateDefinition['theme'] = {
  primaryColor: '#f8fafc',
  accentColor: '#0d2095',
  backgroundColor: 'transparent',
  surfaceColor: '#07106a',
  accent2Color: '#1284ff'
};
const THEME_KEYS = ['primaryColor', 'accentColor', 'backgroundColor', 'surfaceColor', 'accent2Color', 'logoAssetId'] as const;

/**
 * The brand colours an operator can pick, and which therefore seed new
 * graphics. Only these two are ever marked explicit.
 */
export type ExplicitBrandKey = 'accentColor' | 'accent2Color';
export const EXPLICIT_BRAND_KEYS: readonly ExplicitBrandKey[] = ['accentColor', 'accent2Color'];

/**
 * A stored entry with its PRESENCE preserved.
 *
 * `safeReadJson` collapses "no such key", "malformed", "empty" and "storage
 * threw" into one undefined, which is fine for records that simply fall back to
 * a default — but not for anything that has to tell a legacy record (migrate)
 * from a corrupted one (discard).
 */
type StoredEntry =
  | { status: 'absent' }
  | { status: 'present'; raw: string }
  | { status: 'unavailable' };

function readStoredEntry(key: string): StoredEntry {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? { status: 'absent' } : { status: 'present', raw };
  } catch {
    return { status: 'unavailable' };
  }
}

function safeReadJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function safeWrite(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors for now
  }
}

export function loadPresets() {
  return loadGraphicList(STORAGE_KEYS.presets);
}

export function savePresets(presets: GraphicInstance[]) {
  safeWrite(STORAGE_KEYS.presets, presets);
}

export function loadRecentGraphics() {
  return loadGraphicList(STORAGE_KEYS.recent);
}

/**
 * Quick-queue items carry a monotonic `revision`. Legacy entries stored before
 * revisions existed normalize to 1 on load, so optimistic-concurrency checks
 * have a stable baseline without a migration step.
 */
export function loadQuickQueue(): QuickQueueItem[] {
  return loadGraphicList(STORAGE_KEYS.quickQueue).map((item) => ({
    ...item,
    revision: Number.isInteger(item.revision) && (item.revision as number) > 0 ? (item.revision as number) : 1
  }));
}

export function saveQuickQueue(queue: QuickQueueItem[]) {
  safeWrite(STORAGE_KEYS.quickQueue, queue);
}

/**
 * Program recovery: a browser reload cannot confirm what output is doing, so a
 * previously on-air state comes back as `recovering` (never a confident live),
 * an explicit clear stays clear, and anything absent or malformed resets safely
 * to clear.
 */
const PROGRAM_SOURCE_TYPES = ['draft', 'quickQueue', 'rundown'] as const;

/** Only accept a source type the app actually understands; anything else is
 *  discarded rather than carried forward as unusable metadata. */
function validSourceType(value: unknown): ProgramState['sourceType'] {
  return typeof value === 'string' && (PROGRAM_SOURCE_TYPES as readonly string[]).includes(value)
    ? (value as ProgramState['sourceType'])
    : null;
}
const asString = (value: unknown, fallback: string | null = null) =>
  typeof value === 'string' && value ? value : fallback;
const asNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function loadProgram(): ProgramState {
  const raw = safeReadJson(STORAGE_KEYS.program);
  if (!isRecord(raw) || typeof raw.status !== 'string') return { ...CLEAR_PROGRAM_STATE };

  // Explicit switch — an unrecognised status must never fall through into an
  // on-air-looking state.
  switch (raw.status) {
    case 'clear':
      return { ...CLEAR_PROGRAM_STATE, clearedAt: asNumber(raw.clearedAt) };
    case 'showing':
    case 'clearing':
    case 'recovering':
    case 'failed':
      break;
    default:
      return { ...CLEAR_PROGRAM_STATE };
  }

  // Non-clear states are only meaningful with the graphic they refer to.
  const snapshot = isGraphicInstance(raw.snapshot) ? (raw.snapshot as GraphicInstance) : null;
  if (!snapshot) return { ...CLEAR_PROGRAM_STATE };

  // A reload cannot confirm output, so 'showing' AND a pending 'clearing'
  // downgrade to 'recovering'; 'failed' is already a settled fact and survives
  // as-is. Confirmation and any output ack/failure are deliberately reset:
  // they were evidence about a session that no longer exists (the realtime
  // channel re-proves them via the relay snapshot replay if it can). Validated
  // identity and source metadata are preserved so the originating
  // queue/rundown item stays identified across a refresh.
  const sourceType = validSourceType(raw.sourceType);
  return {
    ...CLEAR_PROGRAM_STATE,
    status: raw.status === 'failed' ? 'failed' : 'recovering',
    confirmation: 'unconfirmed',
    commandId: asString(raw.commandId),
    instanceId: asString(raw.instanceId, snapshot.id),
    templateId: asString(raw.templateId, snapshot.templateId),
    sourceType,
    // A source id without a valid type is meaningless — drop it together.
    sourceId: sourceType ? asString(raw.sourceId) : null,
    snapshot,
    takenAt: asNumber(raw.takenAt)
  };
}

export function saveProgram(program: ProgramState) {
  safeWrite(STORAGE_KEYS.program, program);
}

/* Active pack id is stored as a raw string (not JSON) for backwards
   compatibility with values written before it moved into this module. */
export function loadActivePackRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.activePack);
  } catch {
    return null;
  }
}

export function saveActivePackRaw(id: string) {
  try {
    localStorage.setItem(STORAGE_KEYS.activePack, id);
  } catch {
    // ignore storage errors, pack falls back to house next load
  }
}

export function saveRecentGraphics(recent: GraphicInstance[]) {
  safeWrite(STORAGE_KEYS.recent, recent);
}

export function loadBrandOverrides() {
  const raw = safeReadJson(STORAGE_KEYS.brand);
  return {
    ...DEFAULT_THEME,
    ...parseTheme(raw)
  };
}

export function defaultBrandTheme(): TemplateDefinition['theme'] {
  return { ...DEFAULT_THEME };
}

export function saveBrandOverrides(theme: TemplateDefinition['theme']) {
  safeWrite(STORAGE_KEYS.brand, theme);
}

function sameColor(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

/**
 * Which brand swatches the operator has actually chosen.
 *
 * This has to be tracked, not inferred: an operator may deliberately pick the
 * very colour that happens to be the built-in default (#1284ff as the accent,
 * say), and that choice must still seed new graphics. Comparing values would
 * read it as "untouched" and quietly restore each template's own accent on the
 * next template switch or reload.
 *
 * Stored apart from the theme itself so no graphic, schema or renderer payload
 * carries editor metadata.
 */
export function loadExplicitBrandKeys(): ExplicitBrandKey[] {
  const entry = readStoredEntry(STORAGE_KEYS.brandExplicit);

  // Storage could not be read at all, so absence was never established.
  // Inferring here would resurrect colours from a record we cannot see.
  if (entry.status === 'unavailable') return [];

  if (entry.status === 'present') {
    // Present means a decision was already recorded. Whatever shape it is in
    // now, it is NOT a legacy record — a corrupted marker file must read as
    // "nothing chosen", never fall through to inference and quietly resume
    // seeding custom colours.
    let parsed: unknown;
    try {
      parsed = JSON.parse(entry.raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    // Filtering the allowlist both validates and de-duplicates.
    return EXPLICIT_BRAND_KEYS.filter((key) => parsed.includes(key));
  }

  // Genuinely absent: a record written before markers existed. The only
  // evidence available is the stored brand, so infer a choice exactly where it
  // differs from the default — a default-equal legacy value is
  // indistinguishable from untouched and stays unmarked. Nothing is written
  // here; the next real swatch write persists exact markers.
  const stored = loadBrandOverrides();
  const defaults = defaultBrandTheme();
  return EXPLICIT_BRAND_KEYS.filter((key) => !sameColor(stored[key], defaults[key]));
}

/** Persist the marker set, filtered to the two allowed keys and de-duplicated. */
export function saveExplicitBrandKeys(keys: Iterable<ExplicitBrandKey>) {
  const chosen = new Set(keys);
  safeWrite(
    STORAGE_KEYS.brandExplicit,
    EXPLICIT_BRAND_KEYS.filter((key) => chosen.has(key))
  );
}

/**
 * Operator preferences for the dock surface only. Stage 2b: the Program strip
 * honours `compactProgramStrip`; the toggle that writes it ships with the More
 * tab in stage 3 — the flag is real first so the control can never be dead.
 * Lives in STORAGE_KEYS so "Reset all local data" clears it with everything else.
 */
export interface DockPrefs {
  compactProgramStrip: boolean;
}

export function loadDockPrefs(): DockPrefs {
  const raw = safeReadJson(STORAGE_KEYS.dockPrefs);
  // Strict `=== true`: a malformed or legacy record must read as the default
  // (regular strip), never as an accidental opt-in.
  return { compactProgramStrip: isRecord(raw) && raw.compactProgramStrip === true };
}

export function saveDockPrefs(prefs: DockPrefs) {
  safeWrite(STORAGE_KEYS.dockPrefs, prefs);
}

export function clearAllData() {
  try {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore errors during cleanup
  }
  /**
   * The working draft lives in sessionStorage, not in STORAGE_KEYS, so the loop
   * above cannot reach it — the exact shape of the leak this module already
   * warns about above `SCRIPTURE_RECENTS_KEY`. Removal belongs to `clearAllData`
   * rather than to one caller, so every reset path clears it. (The store also
   * cancels its pending debounced write; see `clearLocalData`.)
   */
  clearWorkingDraft();
}

function loadGraphicList(key: string): GraphicInstance[] {
  const raw = safeReadJson(key);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isGraphicInstance);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function parseTheme(value: unknown): Partial<TemplateDefinition['theme']> {
  if (!isRecord(value)) return {};
  const theme: Partial<TemplateDefinition['theme']> = {};
  for (const key of THEME_KEYS) {
    const next = value[key];
    if (typeof next === 'string') {
      theme[key] = next;
    }
  }
  return theme;
}

function isGraphicInstance(value: unknown): value is GraphicInstance {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.templateId !== 'string') return false;
  if (typeof value.createdAt !== 'string') return false;
  if (typeof value.updatedAt !== 'string') return false;
  if (typeof value.durationSeconds !== 'number' || !Number.isFinite(value.durationSeconds) || value.durationSeconds < 0) return false;
  if (!isStringRecord(value.values)) return false;
  if (!isRecord(value.theme)) return false;
  if (value.assetRefs !== undefined && !isStringRecord(value.assetRefs)) return false;
  if (value.personId !== undefined && typeof value.personId !== 'string') return false;
  if (value.presetName !== undefined && typeof value.presetName !== 'string') return false;
  return true;
}
