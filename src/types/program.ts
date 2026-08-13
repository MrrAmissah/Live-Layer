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
/**
 * Presence for EVERY screen, keyed by output session id.
 *
 * It was a single record. With one browser source that was the whole truth;
 * with two it is a lie — `refreshPresence` rebuilt the record around whichever
 * output acked last, so the desk reported the most recent speaker rather than
 * whether both screens were up. A split screen could die mid-service and the
 * indicator would stay green because the main screen was still talking.
 */
export type OutputStatusMap = Record<string, OutputStatusState>;

export interface OutputStatusState {
  outputId: string;
  sourceActive: boolean | null;
  sourceVisible: boolean | null;
  lastSeenAt: number;
  /**
   * The named screen that reported (`lib/scriptureOutputs.ts`), when it said.
   * Null until a status message names one — an acknowledgement carries no
   * screen, and an older output sends none at all.
   */
  screen: string | null;
  /**
   * Whether OBS is hosting the page that reported. Null until it says.
   *
   * Never a source reading. It exists to make OUTPUT READY interpretable: a
   * plain browser tab and an OBS source that has not reported look identical
   * from here, and only one of them is worth investigating.
   */
  hosted: boolean | null;
  /**
   * THIS screen could not render THAT command.
   *
   * Separate from `ProgramState.outputFailure`, which answers "did the Take
   * fail" and deliberately never un-confirms. With two browser sources those
   * are different questions: the main screen can apply a card while the split
   * source — an older build, or one that was never refreshed — cannot render
   * the variant its screen is configured for. Program stays confirmed, which is
   * correct, and without this record the split scene would go blank in silence.
   *
   * Carries the commandId so a failure for a superseded graphic can be told
   * apart from one that describes what is on air right now.
   */
  failure: { reason: string; at: number; commandId: string } | null;
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
