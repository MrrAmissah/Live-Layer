import type { GraphicInstance, RealtimeMessage } from '../types/graphics';
import type { OutputStatusMap, OutputStatusState, ProgramState } from '../types/program';
import { CLEAR_PROGRAM_STATE } from '../types/program';

/**
 * What an INBOUND realtime message means for this client's Program record —
 * the rule behind cross-client Program sync and output acknowledgement,
 * extracted so it is a testable decision instead of component wiring (same
 * idiom as `resolveTakeOutcome`, `relayReadiness`, `programClock`).
 *
 * Inbound now means three different things, and the reducer keeps them apart:
 *
 *  1. Another control client's command (dock and studio are different browser
 *     processes — OBS CEF and Chrome share no localStorage, so the relay
 *     snapshot is the only common ground). Applying it keeps every open
 *     control telling the same story.
 *  2. Our OWN command, echoed or replayed. The channel drops in-session echoes
 *     by id, but a NEW channel (page reload, SSE reconnect) replays the
 *     snapshot — so transitions must be idempotent: a message whose id Program
 *     already tracks changes nothing it doesn't have to. The one deliberate
 *     exception: a replayed command that matches a `recovering` record
 *     UPGRADES it to `showing` — the relay just proved what the reload
 *     couldn't.
 *  3. Output's acknowledgements. THE LOAD-BEARING RULE: an acknowledgement
 *     confirms only the command whose id it carries. A stale OUTPUT_APPLIED
 *     for the previous graphic must never flip the current one to confirmed,
 *     and a Clear stays `clearing` until OUTPUT_CLEARED for that exact clear.
 *
 * Ordering across clients is settled by the command's own `timestamp`
 * (last-writer-wins): a command older than what Program already reflects is
 * discarded. Cross-machine clock skew bounds how sharp that guarantee is —
 * acceptable for a two-operator tool, and strictly better than the previous
 * behaviour (inbound commands were discarded entirely).
 *
 * Pure function of (state, message, now); `now` is the receiver's clock and is
 * what `lastSeenAt`/`appliedAt` record, so staleness math never mixes clocks.
 */
export interface ProgramSyncState {
  program: ProgramState;
  outputs: OutputStatusMap;
}

/** Absent field = unchanged. */
export interface ProgramSyncChange {
  program?: ProgramState;
  outputs?: OutputStatusMap;
}

export function reduceRealtimeMessage(
  state: ProgramSyncState,
  message: RealtimeMessage,
  now: number
): ProgramSyncChange {
  switch (message.type) {
    case 'SHOW_GRAPHIC':
      return reduceShow(state.program, message.payload, message.id, message.timestamp);
    case 'CLEAR_ALL':
    case 'HIDE_GRAPHIC':
      return reduceClearCommand(state.program, message.id, message.timestamp);
    case 'UPDATE_PREVIEW':
    case 'LOAD_PRESET':
    case 'SET_THEME':
    case 'SET_SCRIPTURE_OUTPUTS':
      // Preview, theme and per-screen look traffic never represents what is on
      // air. A screen's look changes how a card is painted, not which card.
      return {};
    case 'OUTPUT_APPLIED': {
      // Rendering it clears whatever this screen last failed on.
      const outputs = refreshPresence(state.outputs, message.payload.outputId, now, null);
      const p = state.program;
      const matches = p.commandId !== null && message.payload.commandId === p.commandId;
      // `recovering` is included on purpose: output restoring its last command
      // after a refresh re-acknowledges the very id this record persisted,
      // which is exactly the evidence the reload was missing.
      const confirmable = p.status === 'showing' || p.status === 'recovering';
      if (!matches || !confirmable || p.confirmation === 'confirmed') {
        return { outputs };
      }
      return {
        outputs,
        program: { ...p, status: 'showing', confirmation: 'confirmed', appliedAt: now, outputFailure: null }
      };
    }
    case 'OUTPUT_FAILED': {
      /**
       * The failure is recorded against THE SCREEN THAT REPORTED IT, always —
       * before, and independently of, the Program rules below.
       *
       * Program's own `outputFailure` answers "did the Take fail" and must never
       * un-confirm: if one screen applied the command, the Take stands. With two
       * browser sources that rule made a second screen's failure silent, so the
       * split scene could go blank while the desk read OUTPUT ACTIVE. Keeping
       * both records means neither question has to answer the other's.
       */
      const outputs = refreshPresence(state.outputs, message.payload.outputId, now, {
        reason: message.payload.reason,
        at: now,
        commandId: message.payload.commandId
      });
      const p = state.program;
      const matches = p.commandId !== null && message.payload.commandId === p.commandId;
      // A failure never *un*-confirms: if output applied it and a stale retry
      // failed, the applied report stands. Only an unconfirmed matching command
      // records the failure.
      const failable = p.status === 'showing' || p.status === 'recovering';
      if (!matches || !failable || p.confirmation === 'confirmed') {
        return { outputs };
      }
      if (p.outputFailure?.reason === message.payload.reason) return { outputs };
      return {
        outputs,
        program: { ...p, status: 'showing', outputFailure: { reason: message.payload.reason, at: now } }
      };
    }
    case 'OUTPUT_CLEARED': {
      // Nothing is on this screen to have failed.
      const outputs = refreshPresence(state.outputs, message.payload.outputId, now, null);
      const p = state.program;
      const matches = p.commandId !== null && message.payload.commandId === p.commandId;
      // Only the clear we are actually waiting on may complete — an
      // OUTPUT_CLEARED for an older clear must not blank a newer Take.
      // (`recovering` can be a reloaded pending clear; a SHOW command's id can
      // never match a clear acknowledgement, so including it is safe.)
      const clearable = p.status === 'clearing' || p.status === 'recovering';
      if (!matches || !clearable) {
        return { outputs };
      }
      return {
        outputs,
        program: { ...CLEAR_PROGRAM_STATE, clearedAt: now }
      };
    }
    case 'OUTPUT_STATUS':
      // A source reading belongs to the screen that reported it, and only that
      // screen — which is exactly what the single record could not express.
      return {
        outputs: {
          ...state.outputs,
          [message.payload.outputId]: {
            outputId: message.payload.outputId,
            sourceActive: message.payload.sourceActive,
            sourceVisible: message.payload.sourceVisible,
            lastSeenAt: now,
            // An output that stops sending is exactly the one the operator
            // needs named, so the last name it gave is kept.
            screen: message.payload.screen ?? state.outputs[message.payload.outputId]?.screen ?? null,
            // A heartbeat says nothing about rendering, so it neither raises nor
            // clears a failure — only an APPLIED/CLEARED/FAILED can.
            failure: state.outputs[message.payload.outputId]?.failure ?? null
          }
        }
      };
    default:
      return {};
  }
}

/**
 * The moment Program's current record became authoritative. A remote command
 * older than this is news from the past and must not regress the surface:
 * `takenAt` anchors `showing`, `clearedAt` anchors both a pending (`clearing`)
 * and a settled (`clear`) clear.
 */
function authorityTime(program: ProgramState): number {
  return Math.max(program.takenAt ?? 0, program.clearedAt ?? 0);
}

function reduceShow(
  program: ProgramState,
  graphic: GraphicInstance,
  commandId: string,
  timestamp: number
): ProgramSyncChange {
  if (program.commandId === commandId) {
    // Already tracking this exact command. Never regress an existing
    // confirmation — but a `recovering` record (post-reload uncertainty) is
    // upgraded: the transport just re-proved the command is the live one.
    if (program.status === 'showing') return {};
    return {
      program: {
        ...program,
        status: 'showing',
        confirmation: 'unconfirmed',
        appliedAt: null,
        outputFailure: null,
        snapshot: program.snapshot ?? deepClone(graphic),
        takenAt: program.takenAt ?? timestamp,
        clearedAt: null
      }
    };
  }

  if (timestamp < authorityTime(program)) return {};

  // A remote client's Take. Source metadata is theirs, not ours — recorded as
  // unknown rather than inherited from whatever this client aired last.
  return {
    program: {
      ...CLEAR_PROGRAM_STATE,
      status: 'showing',
      confirmation: 'unconfirmed',
      commandId,
      instanceId: graphic.id,
      templateId: graphic.templateId,
      snapshot: deepClone(graphic),
      takenAt: timestamp
    }
  };
}

function reduceClearCommand(program: ProgramState, commandId: string, timestamp: number): ProgramSyncChange {
  // Already tracking this clear (pending or settled) — idempotent.
  if (program.commandId === commandId) return {};
  // Clearing nothing is nothing.
  if (program.status === 'clear') return {};
  if (timestamp < authorityTime(program)) return {};

  // Honest pending clear: keep the last graphic's identity for "Last sent"
  // wording; `clearedAt` records when the clear was COMMANDED and is finalised
  // by the matching OUTPUT_CLEARED.
  return {
    program: {
      ...program,
      status: 'clearing',
      confirmation: 'unconfirmed',
      commandId,
      appliedAt: null,
      outputFailure: null,
      clearedAt: timestamp
    }
  };
}

/**
 * Any output event proves the output page is alive, so acknowledgements also
 * refresh `lastSeenAt` — but they carry no source-state reading, so previous
 * active/visible readings survive only when they came from the SAME output
 * session. A different output's readings are somebody else's story.
 */
function refreshPresence(
  previous: OutputStatusMap,
  outputId: string,
  now: number,
  failure: OutputStatusState['failure']
): OutputStatusMap {
  /**
   * Each screen keeps its own readings, which is what the single record could
   * not do: it was rebuilt around whichever output acked last and threw away
   * the other's `sourceActive`/`sourceVisible` as "somebody else's story". With
   * two browser sources they overwrote each other every few seconds, so the
   * desk reported the most recent speaker rather than whether both were up.
   *
   * Keyed by output session id, so a screen that dies stops refreshing its own
   * entry and goes stale on its own while the others carry on.
   */
  const mine = previous[outputId];
  return {
    ...previous,
    [outputId]: {
      outputId,
      sourceActive: mine ? mine.sourceActive : null,
      sourceVisible: mine ? mine.sourceVisible : null,
      lastSeenAt: now,
      // An ack names no screen, so this is remembered rather than re-derived —
      // the alternative is a screen losing its name every time it acknowledges.
      screen: mine ? mine.screen : null,
      failure
    }
  };
}

function deepClone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

/**
 * THE ACK-BEFORE-MARK RACE, found in browser QA, same-machine setup:
 *
 * The publishing control records its own command (markProgramShowing /
 * markProgramClearing) only AFTER `publishCommand` resolves — i.e. after the
 * relay answers the POST. A same-browser `/output` hears the command over
 * BroadcastChannel instantly and can acknowledge instantly (a CLEAR needs no
 * asset work), so its OUTPUT_CLEARED reaches the publisher while Program still
 * tracks the PREVIOUS command. The reducer — correctly — refuses the mismatch,
 * and with no second ack ever coming, the publisher latches in `clearing`
 * while every other client settles.
 *
 * The fix is a small buffer of REFUSED acknowledgements, drained the moment a
 * command is recorded. It must not weaken the stale-ack protections, so:
 *
 *  - only acks the reducer refused enter it (a matched ack was consumed);
 *  - draining runs them through the same reducer — a genuinely stale ack
 *    still mismatches and is simply carried until it expires;
 *  - entries live for PENDING_ACK_TTL_MS and the buffer is bounded, so an
 *    old ack cannot lie in wait for a much later command that happens to
 *    reuse nothing (ids are UUIDs; TTL is belt-and-braces).
 */
export const PENDING_ACK_TTL_MS = 10_000;
export const PENDING_ACK_LIMIT = 8;

export interface PendingAck {
  message: RealtimeMessage;
  /** Receiver-clock arrival time; drives the TTL. */
  at: number;
}

export function isOutputAck(message: RealtimeMessage): boolean {
  return message.type === 'OUTPUT_APPLIED' || message.type === 'OUTPUT_CLEARED' || message.type === 'OUTPUT_FAILED';
}

/** Drop expired entries; append one refused ack when given. Returns the input
 *  array unchanged (same reference) when there is nothing to do, so store
 *  subscribers are not churned by every heartbeat. */
export function bufferPendingAck(
  pending: PendingAck[],
  message: RealtimeMessage | null,
  now: number
): PendingAck[] {
  const fresh = pending.filter((entry) => now - entry.at < PENDING_ACK_TTL_MS);
  if (!message) return fresh.length === pending.length ? pending : fresh;
  return [...fresh, { message, at: now }].slice(-PENDING_ACK_LIMIT);
}

/**
 * Re-offer buffered acks to the reducer against a freshly recorded command.
 * Consumed acks leave the buffer; refused ones stay (until their TTL) — the
 * command they answer may not have been recorded yet, or never will be.
 */
export function drainPendingAcks(
  state: ProgramSyncState,
  pending: PendingAck[],
  now: number
): { program: ProgramState; outputs: OutputStatusMap; pending: PendingAck[] } {
  let program = state.program;
  let outputs = state.outputs;
  const remaining: PendingAck[] = [];
  for (const entry of pending) {
    if (now - entry.at >= PENDING_ACK_TTL_MS) continue;
    const change = reduceRealtimeMessage({ program, outputs }, entry.message, now);
    if (change.outputs) outputs = change.outputs;
    if (change.program) {
      program = change.program;
    } else {
      remaining.push(entry);
    }
  }
  return { program, outputs, pending: remaining };
}
