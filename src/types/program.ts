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
 * A published command starts as `status: 'showing'` + `confirmation:
 * 'unconfirmed'`. Confirmation flips to `'confirmed'` in exactly one place —
 * `lib/programSync.ts`, when an OUTPUT_APPLIED whose `commandId` matches this
 * record arrives (see ARCHITECTURE.md). We never present an acknowledged state
 * purely because a message was published, and a matched acknowledgement still
 * says only "the output PAGE applied it" — whether an OBS source is actively
 * compositing it is a separate, staleness-guarded reading (OutputStatusState).
 *
 * `'clearing'` is the same honesty applied to Clear: the command went out, but
 * nothing has confirmed the graphic is gone, so Program may not claim `clear`
 * until an OUTPUT_CLEARED for the matching commandId arrives.
 */
export type ProgramStatus = 'clear' | 'showing' | 'clearing' | 'recovering' | 'failed';

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
  /** When the matching OUTPUT_APPLIED arrived (receiver clock). Null while unconfirmed. */
  appliedAt: number | null;
  /** Output received the matching command but could not render it. */
  outputFailure: { reason: string; at: number } | null;
}

/**
 * The control side's latest reading OF the output page itself — command-
 * independent, deliberately outside ProgramState, and never persisted: a
 * heartbeat from a previous session proves nothing about this one.
 *
 * `sourceActive`/`sourceVisible` are the host binding's words (OBS Browser
 * Source active/visible), `null` when no binding reported. `lastSeenAt` is the
 * RECEIVER's clock at the moment any output event arrived, so staleness
 * (`lib/outputPresence.ts`) compares like with like and machine clock skew
 * cannot latch a dead output as fresh.
 */
export interface OutputStatusState {
  outputId: string;
  sourceActive: boolean | null;
  sourceVisible: boolean | null;
  lastSeenAt: number;
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
  clearedAt: null,
  appliedAt: null,
  outputFailure: null
};
