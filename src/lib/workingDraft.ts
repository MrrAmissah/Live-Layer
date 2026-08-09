import type { TemplateDefinition } from '../types/graphics';
import type { LayoutSettings } from '../types/layout';

/**
 * The operator's WORKING DRAFT — what they are preparing, not what is on air.
 *
 * Refreshing the control surface used to return the editor to the event pack's
 * default template while Program correctly restored the graphic that was sent.
 * Mid-service that is a hazard: you prepare the next lower third, OBS reloads
 * the dock, and you are looking at a different template. Take then sends the
 * wrong graphic.
 *
 * Three states stay deliberately separate, and this module owns exactly one:
 *
 *  - **Program / output** restores from Program storage and the relay snapshot.
 *    It is never hydrated from here, and hydration never writes to it.
 *  - **Working draft** — this. Restored into the editor, and nothing else.
 *  - **Template library selection** must not silently replace a restored draft
 *    on mount. An explicit template choice still starts a new graphic, exactly
 *    as `setTemplate` does today; that is an operator decision, not a surprise.
 *
 * WHY sessionStorage. The draft is LOCAL TO ONE CONTROL CLIENT. A Chrome studio
 * and an OBS dock share one Program truth but may legitimately be preparing
 * different graphics, and two `/control` tabs in one browser must not overwrite
 * each other — which is exactly what a single localStorage record would do,
 * since it is shared across every tab of an origin. sessionStorage is scoped to
 * one browsing context, so isolation is a property of the storage rather than a
 * convention this code has to maintain. Nothing here reaches a realtime message,
 * the relay, BroadcastChannel, Program or OUTPUT_STATUS: the draft is not
 * something other clients are entitled to see.
 *
 * WHAT WAS ACTUALLY MEASURED, kept separate from what it would be convenient to
 * conclude:
 *
 *  - **A real page refresh preserves the draft.** Checked in a disposable
 *    browser: prepare a template with edits, refresh, both come back.
 *  - **Hiding and reshowing an OBS Custom Browser Dock from `View > Docks`
 *    preserves it.** Checked on the real rig (macOS): text typed into the
 *    dock's Quick Edit tab was still there after the toggle. This establishes
 *    that the toggle does not destroy that dock's storage context — it does not
 *    establish that any reload took place, since hide/show may simply keep the
 *    existing page alive.
 *  - **OBS's title-bar Refresh was not directly measured**: the action was
 *    unavailable on the tested build. It is not claimed either way.
 *  - **A genuinely destroyed and recreated context** — closing the tab,
 *    restarting OBS — starts fresh and the editor seeds normally. Outside this
 *    contract, and stated rather than measured.
 *
 * `storage` is injectable throughout so that any of those answers can change one
 * line of code if it ever has to.
 *
 * Assets are referenced BY ID, and which fields are assets is decided by KEY,
 * never by reading the value — see the asset policy below. Ordinary operator
 * text round-trips byte for byte whatever it happens to say.
 */
export const WORKING_DRAFT_VERSION = 1;
export const WORKING_DRAFT_KEY = 'livelayer.workingDraft';

export interface WorkingDraft {
  templateId: string;
  values: Record<string, string>;
  /** The CURRENT graphic's theme. Never the persisted brand default. */
  theme: TemplateDefinition['theme'];
  layout: LayoutSettings;
  durationSeconds: number;
}

/** The slice of the Storage interface this needs — injectable so a second
 *  client context can be modelled, and so tests never touch a real one. */
export interface DraftStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function defaultStorage(): DraftStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : (sessionStorage as DraftStorage);
  } catch {
    // Storage disabled by policy. Nothing persists; the editor seeds normally.
    return null;
  }
}

/**
 * THE ASSET POLICY, DECIDED BY KEY — never by inspecting the string.
 *
 * An earlier version dropped any value that merely *started with* `data:` or
 * `blob:`, wherever it appeared. Draft values are mostly arbitrary operator
 * prose, so that silently deleted ordinary announcement text on refresh:
 *
 *     "Data: registration closes at 5 PM"
 *     "blob: notes from the media team"
 *
 * A sanitiser cannot tell an asset source from a sentence by reading the
 * sentence. The key is what carries that meaning, so the key is what decides:
 *
 *  - `*AssetId` — a stable local asset reference. Persisted. The `endsWith`
 *    rule is the convention this codebase already relies on
 *    (`lib/rundown/rundownReferences.ts` collects references the same way), so
 *    a future slot like `backgroundAssetId` is covered without a second list to
 *    keep in sync.
 *  - `logoUrl` — today's only URL-backed asset source. Persisted, because a
 *    typed URL is the operator's content; but a `data:` value there is inline
 *    binary rather than a reference, and a `blob:` value is a per-document URL
 *    already dead by the time it is read back.
 *  - `logoResolvedSrc` / `headshotResolvedSrc` — minted by `/output` while
 *    rendering, never operator content. Never persisted: a stored one restores
 *    as a broken image pointing at a document that no longer exists.
 *  - everything else — verbatim, byte for byte, whatever it happens to say.
 *
 * A Blob or a File cannot enter the record at all: values are strings by type,
 * and the runtime `typeof` guard below is what enforces that at the boundary.
 */
const ASSET_ID_SUFFIX = 'AssetId';
const URL_BACKED_ASSET_KEYS = new Set(['logoUrl']);
const RENDER_ONLY_ASSET_KEYS = new Set(['logoResolvedSrc', 'headshotResolvedSrc']);
/** Not a reference: inline binary, or a URL scoped to a document that is gone. */
const NOT_A_REFERENCE = /^\s*(data|blob):/i;

function isAssetSourceKey(key: string): boolean {
  return key.endsWith(ASSET_ID_SUFFIX) || URL_BACKED_ASSET_KEYS.has(key);
}

/** `null` = do not persist this entry at all. */
function persistableValue(key: string, value: unknown): string | null {
  if (typeof value !== 'string') return null; // a Blob/File/number can never enter
  if (RENDER_ONLY_ASSET_KEYS.has(key)) return null;
  if (isAssetSourceKey(key) && NOT_A_REFERENCE.test(value)) return null;
  return value;
}

function assetSafeRecord(source: Record<string, string>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    const next = persistableValue(key, value);
    if (next !== null) kept[key] = next;
  }
  return kept;
}

/**
 * A theme every renderer can actually paint. The three required colours are
 * demanded rather than defaulted in: a record missing them was not written by
 * this app, and filling the gaps would hand the editor a theme the operator
 * never chose while looking like a successful restore.
 */
const REQUIRED_THEME_KEYS = ['primaryColor', 'accentColor', 'backgroundColor'] as const;

function asTheme(value: unknown): TemplateDefinition['theme'] | null {
  const record = asStringRecord(value);
  if (!record) return null;
  // Sanitised first so the required-colour check runs on what will actually be
  // stored. Colours are not asset keys, so they pass through untouched.
  const kept = assetSafeRecord(record);
  for (const key of REQUIRED_THEME_KEYS) {
    if (typeof kept[key] !== 'string') return null;
  }
  return kept as unknown as TemplateDefinition['theme'];
}

const LAYOUT_OPTIONS: Record<keyof LayoutSettings, readonly string[]> = {
  size: ['small', 'medium', 'large'],
  position: ['left', 'center', 'full'],
  density: ['compact', 'standard', 'bold'],
  safeMargin: ['normal', 'tight']
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  for (const entry of Object.values(value)) {
    if (typeof entry !== 'string') return null;
  }
  return { ...(value as Record<string, string>) };
}

/** Every present key must be one this build understands, with a value it
 *  understands. A layout naming a size that no longer exists would render as
 *  something the operator never chose. */
function asLayout(value: unknown): LayoutSettings | null {
  if (!isRecord(value)) return null;
  const layout: LayoutSettings = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    const allowed = LAYOUT_OPTIONS[key as keyof LayoutSettings];
    if (!allowed) return null;
    if (typeof entry !== 'string' || !allowed.includes(entry)) return null;
    (layout as Record<string, string>)[key] = entry;
  }
  return layout;
}

/**
 * Read the stored draft, or `null` when there is nothing trustworthy to restore.
 *
 * Validation is ALL-OR-NOTHING on purpose. A record with good values and a
 * broken layout could be restored "partially", but that produces an editor
 * state the operator never created and cannot account for — worse than the
 * ordinary seed, because it looks deliberate. `null` means "seed normally",
 * which is the behaviour that shipped before this existed.
 *
 * `isKnownTemplate` is passed in rather than imported so this module stays free
 * of the template registry, and so an unknown-template record can be tested
 * without inventing a template.
 */
export function readWorkingDraft(
  isKnownTemplate: (templateId: string) => boolean,
  storage: DraftStorage | null = defaultStorage()
): WorkingDraft | null {
  if (!storage) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(WORKING_DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // corrupt JSON: seed
  }

  if (!isRecord(parsed)) return null;
  // An unrecognised version is a record written by a build that meant something
  // different by these fields. Guessing at it is how an "impossible" editor
  // state gets created.
  if (parsed.version !== WORKING_DRAFT_VERSION) return null;

  const draft = parsed.draft;
  if (!isRecord(draft)) return null;

  const templateId = draft.templateId;
  if (typeof templateId !== 'string' || !templateId || !isKnownTemplate(templateId)) return null;

  const values = asStringRecord(draft.values);
  if (!values) return null;

  const theme = asTheme(draft.theme);
  if (!theme) return null;

  const layout = asLayout(draft.layout);
  if (!layout) return null;

  const durationSeconds = draft.durationSeconds;
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return null;
  }

  return {
    templateId,
    // Sanitised on read as well as write: a record written by an older build,
    // or edited by hand, must not reintroduce inline binary. (`asTheme` has
    // already done the same for the theme.)
    values: assetSafeRecord(values),
    theme,
    layout,
    durationSeconds
  };
}

export function writeWorkingDraft(draft: WorkingDraft, storage: DraftStorage | null = defaultStorage()) {
  if (!storage) return;
  try {
    storage.setItem(
      WORKING_DRAFT_KEY,
      JSON.stringify({
        version: WORKING_DRAFT_VERSION,
        draft: {
          templateId: draft.templateId,
          values: assetSafeRecord(draft.values),
          theme: assetSafeRecord(draft.theme as unknown as Record<string, string>),
          layout: draft.layout,
          durationSeconds: draft.durationSeconds
        }
      })
    );
  } catch {
    // Quota or a disabled store: the draft simply does not survive this refresh.
  }
}

export function clearWorkingDraft(storage: DraftStorage | null = defaultStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(WORKING_DRAFT_KEY);
  } catch {
    // ignore errors during cleanup
  }
}

export interface WorkingDraftWriter {
  /** Record the latest draft; the write itself is coalesced. */
  schedule: (draft: WorkingDraft) => void;
  /** Write any pending draft now. A no-op when nothing is pending. */
  flush: () => void;
  /** Cancel any pending write AND remove the stored record. */
  reset: () => void;
}

/**
 * Debounced, centralised persistence.
 *
 * Centralised because a `save()` bolted onto each of the twelve setters that
 * legitimately move the draft is a list that silently goes stale the moment a
 * thirteenth is added. The store subscribes once instead.
 *
 * Debounced because typing a name is one draft change per keystroke, and this
 * page can share a CPU with an encoder. `flush` exists so a reload during the
 * debounce window does not lose the last few characters — and, because it only
 * writes what is actually pending, a flush after `reset` writes nothing.
 *
 * The window opens on the first change and is deliberately NOT restarted by
 * later ones. A trailing debounce that resets on every keystroke would write
 * nothing at all while an operator typed a long verse without pausing, and a
 * reload mid-sentence would lose the whole thing. This bounds the loss to one
 * window however long the typing runs, while still costing one write per window
 * rather than one per keystroke.
 */
export function createWorkingDraftWriter(options: {
  write?: (draft: WorkingDraft) => void;
  clear?: () => void;
  delayMs?: number;
} = {}): WorkingDraftWriter {
  const write = options.write ?? ((draft: WorkingDraft) => writeWorkingDraft(draft));
  const clear = options.clear ?? (() => clearWorkingDraft());
  const delayMs = options.delayMs ?? 400;

  let pending: WorkingDraft | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  const flush = () => {
    if (pending === null) return;
    const draft = pending;
    cancel();
    write(draft);
  };

  return {
    schedule: (draft) => {
      pending = draft;
      if (timer !== null) return; // already coalescing into one write
      timer = setTimeout(flush, delayMs);
    },
    flush,
    reset: () => {
      cancel();
      clear();
    }
  };
}
