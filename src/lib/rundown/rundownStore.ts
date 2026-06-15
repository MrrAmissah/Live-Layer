import type { GraphicInstance } from '../../types/graphics';
import type {
  Rundown,
  RundownItem,
  RundownItemInput,
  RundownStoreState
} from '../../types/rundown';

/**
 * Local-first storage for Rundown / Queue Mode (R1 — data + store only, no UI).
 *
 * Single I/O boundary: this module owns all reads/writes of the versioned
 * `livelayer.rundowns` localStorage record, so the structured store can later
 * move to the async/IndexedDB abstraction without touching callers. Functions are
 * synchronous (localStorage is synchronous; the data is small) and mirror the
 * existing `storage.ts` / `peopleStore.ts` style.
 *
 * Invariants: rundown items store asset **ids** and **raw** dynamic tokens only —
 * never blobs, data URLs, or File/Blob objects — and GraphicInstance snapshots
 * are deep-cloned so they never share references with the draft or a Saved Graphic.
 */

const RUNDOWN_STORAGE_KEY = 'livelayer.rundowns';
const RUNDOWN_STORE_VERSION = 1;

/** Soft caps to keep the single localStorage record from bloating. */
export const MAX_RUNDOWNS = 50;
export const MAX_ITEMS_PER_RUNDOWN = 100;

// Change notification lives in the store (not the hook) so that ANY mutator —
// including ControlPage's imperative setActiveItem on Take/Clear — notifies every
// reactive consumer (e.g. the LIVE badge). Reads never notify.
const subscribers = new Set<() => void>();
export function subscribeRundowns(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
function notify() {
  subscribers.forEach((fn) => fn());
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Deep clone — same approach as savePreset / ControlPage's Take snapshot. */
function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function now(): string {
  return new Date().toISOString();
}

function emptyState(): RundownStoreState {
  return { version: RUNDOWN_STORE_VERSION, rundowns: [], activeRundownId: undefined };
}

/** Drop malformed items and guarantee a non-empty title (defensive read). */
function sanitizeItem(raw: unknown): RundownItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Partial<RundownItem>;
  if (typeof item.id !== 'string' || !item.graphic || typeof item.graphic !== 'object') return null;
  const title = typeof item.title === 'string' && item.title.trim() ? item.title : deriveItemTitle(item.graphic);
  return { ...(item as RundownItem), title };
}

/** Drop malformed rundowns and repair dangling item cursors. */
function sanitizeRundown(raw: unknown): Rundown | null {
  if (!raw || typeof raw !== 'object') return null;
  const rundown = raw as Partial<Rundown>;
  if (typeof rundown.id !== 'string') return null;
  const items = Array.isArray(rundown.items)
    ? (rundown.items.map(sanitizeItem).filter(Boolean) as RundownItem[])
    : [];
  const ids = new Set(items.map((item) => item.id));
  return {
    ...(rundown as Rundown),
    name: typeof rundown.name === 'string' && rundown.name.trim() ? rundown.name : 'Untitled rundown',
    items,
    selectedItemId: rundown.selectedItemId && ids.has(rundown.selectedItemId) ? rundown.selectedItemId : undefined,
    activeItemId: rundown.activeItemId && ids.has(rundown.activeItemId) ? rundown.activeItemId : undefined,
    createdAt: rundown.createdAt ?? now(),
    updatedAt: rundown.updatedAt ?? now()
  };
}

function read(): RundownStoreState {
  try {
    const raw = localStorage.getItem(RUNDOWN_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rundowns)) {
      return emptyState();
    }
    // Sanitize defensively (cursor repair, malformed-record + title fallback).
    // Pure: callers always see valid cursors; the fix persists on the next write.
    // Only v1 exists today; future versions migrate here.
    const rundowns = (parsed.rundowns as unknown[]).map(sanitizeRundown).filter(Boolean) as Rundown[];
    const rundownIds = new Set(rundowns.map((rundown) => rundown.id));
    return {
      version: RUNDOWN_STORE_VERSION,
      rundowns,
      activeRundownId:
        typeof parsed.activeRundownId === 'string' && rundownIds.has(parsed.activeRundownId)
          ? parsed.activeRundownId
          : undefined
    };
  } catch {
    return emptyState();
  }
}

function write(state: RundownStoreState): void {
  try {
    localStorage.setItem(
      RUNDOWN_STORAGE_KEY,
      JSON.stringify({ ...state, version: RUNDOWN_STORE_VERSION })
    );
  } catch {
    // ignore quota errors — consistent with storage.ts / safeWrite
  }
  notify();
}

/** Apply a transform to one rundown (touching updatedAt) and persist. */
function mutateRundown(state: RundownStoreState, rundownId: string, fn: (rundown: Rundown) => Rundown): RundownStoreState {
  const rundowns = state.rundowns.map((rundown) =>
    rundown.id === rundownId ? { ...fn(rundown), updatedAt: now() } : rundown
  );
  const next = { ...state, rundowns };
  write(next);
  return next;
}

// --- title derivation -------------------------------------------------------

/** A human title from a graphic's key field (scripture ref / name / headline). */
export function deriveItemTitle(graphic: GraphicInstance): string {
  const values = graphic.values ?? {};
  const candidate = values.reference || values.name || values.headline || values.title;
  if (candidate && candidate.trim()) return candidate.trim();
  return graphic.templateId;
}

// --- pure helpers -----------------------------------------------------------

/** Deep clone a graphic snapshot (ids + raw tokens; never blobs). */
export function cloneRundownGraphic(graphic: GraphicInstance): GraphicInstance {
  return clone(graphic);
}

/** Build a fresh item from a graphic snapshot (deep-cloned, new ids/timestamps). */
export function createRundownItemFromGraphic(input: RundownItemInput): RundownItem {
  const ts = now();
  return {
    id: createId('rditem'),
    title: input.title?.trim() || deriveItemTitle(input.graphic),
    graphic: cloneRundownGraphic(input.graphic),
    source: input.source,
    done: false,
    notes: input.notes?.trim() || undefined,
    createdAt: ts,
    updatedAt: ts
  };
}

export function getSelectedItem(rundown: Rundown | undefined): RundownItem | undefined {
  if (!rundown?.selectedItemId) return undefined;
  return rundown.items.find((item) => item.id === rundown.selectedItemId);
}

export function getNextItem(rundown: Rundown | undefined): RundownItem | undefined {
  if (!rundown) return undefined;
  const index = rundown.items.findIndex((item) => item.id === rundown.selectedItemId);
  if (index < 0) return rundown.items[0];
  return rundown.items[index + 1];
}

export function getPreviousItem(rundown: Rundown | undefined): RundownItem | undefined {
  if (!rundown) return undefined;
  const index = rundown.items.findIndex((item) => item.id === rundown.selectedItemId);
  if (index < 0) return undefined;
  return rundown.items[index - 1];
}

export interface QueueCursors {
  selectedIndex: number;
  selected?: RundownItem;
  nextItem?: RundownItem;
  prevItem?: RundownItem;
  liveItem?: RundownItem;
}

/** All queue cursors in one read — shared by the dock and studio queue UIs. */
export function getQueueCursors(rundown: Rundown | undefined): QueueCursors {
  if (!rundown) return { selectedIndex: -1 };
  return {
    selectedIndex: rundown.items.findIndex((item) => item.id === rundown.selectedItemId),
    selected: getSelectedItem(rundown),
    nextItem: getNextItem(rundown),
    prevItem: getPreviousItem(rundown),
    liveItem: rundown.items.find((item) => item.id === rundown.activeItemId)
  };
}

// --- reads ------------------------------------------------------------------

/** Full versioned state — useful for hydrating a store slice in R2. */
export function loadRundownState(): RundownStoreState {
  return read();
}

export function listRundowns(): Rundown[] {
  return read().rundowns;
}

export function getRundown(id: string): Rundown | undefined {
  return read().rundowns.find((rundown) => rundown.id === id);
}

export function getActiveRundownId(): string | undefined {
  return read().activeRundownId;
}

// --- rundown CRUD -----------------------------------------------------------

/** Create a rundown, or `undefined` if the soft cap is reached. */
export function createRundown(name: string): Rundown | undefined {
  const state = read();
  if (state.rundowns.length >= MAX_RUNDOWNS) return undefined;
  const ts = now();
  const rundown: Rundown = {
    id: createId('rundown'),
    name: name.trim() || 'Untitled rundown',
    items: [],
    activeItemId: undefined,
    selectedItemId: undefined,
    createdAt: ts,
    updatedAt: ts
  };
  write({ ...state, rundowns: [rundown, ...state.rundowns] });
  return rundown;
}

export function updateRundown(id: string, patch: Partial<Pick<Rundown, 'name'>>): Rundown | undefined {
  const clean: Partial<Rundown> = {};
  if (patch.name !== undefined) clean.name = patch.name.trim() || 'Untitled rundown';
  const next = mutateRundown(read(), id, (rundown) => ({ ...rundown, ...clean }));
  return next.rundowns.find((rundown) => rundown.id === id);
}

export function deleteRundown(id: string): void {
  const state = read();
  write({
    ...state,
    rundowns: state.rundowns.filter((rundown) => rundown.id !== id),
    activeRundownId: state.activeRundownId === id ? undefined : state.activeRundownId
  });
}

export function setActiveRundown(id: string | undefined): void {
  write({ ...read(), activeRundownId: id });
}

/**
 * Append a fully-remapped imported rundown and make it active by default.
 * The caller owns ID generation/remapping; this store only guards caps and
 * refuses to overwrite an existing rundown id.
 */
export function importRundown(rundown: Rundown, makeActive = true): Rundown | undefined {
  const state = read();
  if (state.rundowns.length >= MAX_RUNDOWNS) return undefined;
  if (state.rundowns.some((item) => item.id === rundown.id)) return undefined;
  const nextState: RundownStoreState = {
    ...state,
    rundowns: [clone(rundown), ...state.rundowns],
    activeRundownId: makeActive ? rundown.id : state.activeRundownId
  };
  write(nextState);
  return getRundown(rundown.id);
}

// --- item CRUD --------------------------------------------------------------

/** Add an item, or `undefined` if the rundown is missing or at the item cap. */
export function addItem(rundownId: string, input: RundownItemInput): RundownItem | undefined {
  const rundown = getRundown(rundownId);
  if (!rundown || rundown.items.length >= MAX_ITEMS_PER_RUNDOWN) return undefined;
  const item = createRundownItemFromGraphic(input);
  mutateRundown(read(), rundownId, (current) => ({ ...current, items: [...current.items, item] }));
  return item;
}

export function updateItem(
  rundownId: string,
  itemId: string,
  patch: Partial<Pick<RundownItem, 'title' | 'notes' | 'done'>> & { graphic?: GraphicInstance }
): RundownItem | undefined {
  let updated: RundownItem | undefined;
  mutateRundown(read(), rundownId, (rundown) => ({
    ...rundown,
    items: rundown.items.map((item) => {
      if (item.id !== itemId) return item;
      updated = {
        ...item,
        ...(patch.title !== undefined ? { title: patch.title.trim() || item.title } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || undefined } : {}),
        ...(patch.done !== undefined ? { done: patch.done } : {}),
        // A replaced graphic is deep-cloned so it never shares refs with the draft.
        ...(patch.graphic ? { graphic: cloneRundownGraphic(patch.graphic) } : {}),
        updatedAt: now()
      };
      return updated;
    })
  }));
  return updated;
}

export function deleteItem(rundownId: string, itemId: string): void {
  mutateRundown(read(), rundownId, (rundown) => ({
    ...rundown,
    items: rundown.items.filter((item) => item.id !== itemId),
    activeItemId: rundown.activeItemId === itemId ? undefined : rundown.activeItemId,
    selectedItemId: rundown.selectedItemId === itemId ? undefined : rundown.selectedItemId
  }));
}

export function duplicateItem(rundownId: string, itemId: string): RundownItem | undefined {
  const rundown = getRundown(rundownId);
  const source = rundown?.items.find((item) => item.id === itemId);
  if (!source) return undefined;
  const ts = now();
  const copy: RundownItem = {
    ...source,
    id: createId('rditem'),
    title: `${source.title} (copy)`,
    graphic: cloneRundownGraphic(source.graphic), // critical: no shared reference
    done: false,
    createdAt: ts,
    updatedAt: ts
  };
  mutateRundown(read(), rundownId, (current) => {
    const index = current.items.findIndex((item) => item.id === itemId);
    const items = [...current.items];
    items.splice(index < 0 ? items.length : index + 1, 0, copy);
    return { ...current, items };
  });
  return copy;
}

export function moveItem(rundownId: string, itemId: string, direction: 'up' | 'down'): void {
  mutateRundown(read(), rundownId, (rundown) => {
    const index = rundown.items.findIndex((item) => item.id === itemId);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= rundown.items.length) return rundown;
    const items = [...rundown.items];
    [items[index], items[target]] = [items[target], items[index]];
    return { ...rundown, items };
  });
}

export function setSelectedItem(rundownId: string, itemId: string | undefined): void {
  mutateRundown(read(), rundownId, (rundown) => ({ ...rundown, selectedItemId: itemId }));
}

export function setActiveItem(rundownId: string, itemId: string | undefined): void {
  mutateRundown(read(), rundownId, (rundown) => ({ ...rundown, activeItemId: itemId }));
}

export function toggleItemDone(rundownId: string, itemId: string): void {
  mutateRundown(read(), rundownId, (rundown) => ({
    ...rundown,
    items: rundown.items.map((item) => (item.id === itemId ? { ...item, done: !item.done, updatedAt: now() } : item))
  }));
}

export function clearAllRundowns(): void {
  try {
    localStorage.removeItem(RUNDOWN_STORAGE_KEY);
  } catch {
    // ignore
  }
  notify();
}
