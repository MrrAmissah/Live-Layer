import type { GraphicInstance } from './graphics';

/**
 * Operator-side record of what the control surface has attempted to put on air.
 *
 * IMPORTANT: this is NOT a second rendering protocol. The realtime SHOW/CLEAR
 * messages remain the authority for what was *commanded*. This slice records
 * the operator's view of that command, and deliberately separates two things
 * the control client actually knows differently:
 *
 *   status       — what we are trying to show right now
 *   confirmation — whether output has acknowledged it
 *
 * Until an output acknowledgement exists (a later production-hardening stage —
 * see ARCHITECTURE.md), a published command is `status: 'showing'` +
 * `confirmation: 'unconfirmed'`. We never
 * present a confident, acknowledged live state purely because a message was
 * published — the control client does not yet know the graphic reached output.
 */
export type ProgramStatus = 'clear' | 'showing' | 'recovering' | 'failed';

export type ProgramConfirmation = 'unconfirmed' | 'confirmed';

export type ProgramSourceType = 'draft' | 'quickQueue' | 'rundown';

export interface ProgramState {
  status: ProgramStatus;
  confirmation: ProgramConfirmation;
  /** Realtime message id that carried the command — reserved for future ack matching. */
  commandId: string | null;
  /** The GraphicInstance.id that was published. */
  instanceId: string | null;
  templateId: string | null;
  /** What produced the on-air graphic. */
  sourceType: ProgramSourceType | null;
  /** Stable quick-queue / rundown item id it came from, if any. */
  sourceId: string | null;
  /** Deep-cloned, plain-serializable copy of exactly what was published. */
  snapshot: GraphicInstance | null;
  takenAt: number | null;
  clearedAt: number | null;
}

export const CLEAR_PROGRAM_STATE: ProgramState = {
  status: 'clear',
  confirmation: 'unconfirmed',
  commandId: null,
  instanceId: null,
  templateId: null,
  sourceType: null,
  sourceId: null,
  snapshot: null,
  takenAt: null,
  clearedAt: null
};
