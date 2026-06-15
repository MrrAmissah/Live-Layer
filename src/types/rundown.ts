import type { GraphicInstance } from './graphics';

/**
 * Rundown / Queue Mode data model (R1 — data + store only, no UI yet).
 * See docs/RUNDOWN_QUEUE_SPEC.md. A rundown item is a deep-cloned snapshot of a
 * GraphicInstance: asset *ids* only, raw dynamic tokens, layout preserved, no
 * blobs. Item status is derived later from the cursors below; only `done` is
 * persisted.
 */

/** Versioned localStorage wrapper persisted under `livelayer.rundowns`. */
export interface RundownStoreState {
  version: number;
  rundowns: Rundown[];
  /** One active rundown per control session (decision 2). */
  activeRundownId?: string;
}

export interface Rundown {
  id: string;
  name: string;
  items: RundownItem[];
  /** What is currently LIVE on /output (null when cleared). */
  activeItemId?: string;
  /** Preview/edit cursor — independent of what's live. */
  selectedItemId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RundownItem {
  id: string;
  /** Auto-derived from the graphic (reference / name / headline), editable later. */
  title: string;
  /** Deep-cloned GraphicInstance snapshot — ids + raw tokens, never blobs. */
  graphic: GraphicInstance;
  /** Provenance only; never used to live-link back to the source. */
  source?: RundownItemSource;
  /** The only persisted status — manual for now (decisions 4, 5, 9). */
  done?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type RundownItemSource =
  | { type: 'draft' }
  | { type: 'savedGraphic'; presetId: string }
  | { type: 'person'; personId: string }
  | { type: 'scripture'; reference: string }
  | { type: 'announcement' }
  | { type: 'manual' };

/** Input for adding/duplicating an item; the graphic is deep-cloned by the store. */
export interface RundownItemInput {
  graphic: GraphicInstance;
  title?: string;
  source?: RundownItemSource;
  notes?: string;
}
