/**
 * The LAN relay's state model, extracted from the server so the rules are
 * unit-testable (imported by `src/lib/relaySnapshot.test.ts`; typed by the
 * sibling `relay-snapshot.d.mts`).
 *
 * WHY A SNAPSHOT AND NOT A LAST-MESSAGE SLOT. The relay used to keep exactly
 * one `lastMessage` and replay it to every new SSE client. With output events
 * on the wire that slot becomes a bug: a heartbeat lands every few seconds, so
 * whatever command `/output` would need to restore itself after a reconnect is
 * overwritten almost immediately — a Browser Source refresh would come back
 * blank. The snapshot therefore keeps ONE VALIDATED SLOT PER CONCERN, and a
 * message can only ever displace its own kind:
 *
 *   command  — latest air-defining operator command (SHOW/HIDE/CLEAR).
 *              Preview/theme traffic is relayed live but never retained: it
 *              cannot displace the command a reconnecting output must replay.
 *   ack      — latest output acknowledgement FOR THAT COMMAND. Matched by
 *              commandId on arrival, and reset whenever a new command lands,
 *              so a late ack for a superseded command can never be replayed
 *              beside the command it does not answer.
 *   status   — latest OUTPUT_STATUS (host-source state heartbeat).
 *   scriptureOutputs — latest SET_SCRIPTURE_OUTPUTS (which look each named
 *              screen renders). Retained rather than relayed-and-forgotten
 *              because it is CONFIGURATION, not traffic: a browser source that
 *              connects an hour after the operator set it must still get it,
 *              and on a Chrome-control/OBS-CEF rig this replay is the only way
 *              it ever can (the two browsers share no localStorage).
 *   outputLastSeenAt — relay-clock time of the last output event of any kind.
 *
 * Replay order is scriptureOutputs → command → ack → status: a reconnecting
 * output knows how it paints before it is told what to paint, so a restored
 * scripture card never flashes the main screen's look on the split scene. Then
 * a control hydrates the command before the ack that confirms it.
 */

const AIR_COMMAND_TYPES = new Set(['SHOW_GRAPHIC', 'HIDE_GRAPHIC', 'CLEAR_ALL']);
const TRANSIENT_COMMAND_TYPES = new Set(['UPDATE_PREVIEW', 'LOAD_PRESET', 'SET_THEME']);
const SCRIPTURE_OUTPUTS_TYPE = 'SET_SCRIPTURE_OUTPUTS';
const OUTPUT_ACK_TYPES = new Set(['OUTPUT_APPLIED', 'OUTPUT_CLEARED', 'OUTPUT_FAILED']);

export function createRelaySnapshot() {
  return { command: null, ack: null, status: null, scriptureOutputs: null, outputLastSeenAt: null };
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Bounded validation, now per-type. The envelope check matches the original
 * relay's; payload checks are the minimum a slot needs to be meaningfully
 * replayable (an ack without a commandId could never be matched; a status
 * without an outputId identifies nobody). Deep graphic validation stays
 * client-side in `parseRealtimeMessage` — the relay is transport, not schema
 * authority — but an unknown type is rejected rather than stored blind.
 */
export function validateRelayMessage(value) {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.type) ||
    typeof value.timestamp !== 'number' ||
    !Number.isFinite(value.timestamp) ||
    !('payload' in value)
  ) {
    return { ok: false, error: 'Invalid LiveLayer realtime message' };
  }

  const { type, payload } = value;
  if (type === SCRIPTURE_OUTPUTS_TYPE) {
    // Flat string->string only. Which screens and variants are real is the
    // client's registry question, not the relay's — the relay is transport.
    if (!isRecord(payload)) return { ok: false, error: `${type} payload must be an object` };
    if (Object.values(payload).some((variantId) => !isNonEmptyString(variantId))) {
      return { ok: false, error: `${type} maps a screen to something that is not a variant id` };
    }
    return { ok: true, message: value };
  }
  if (AIR_COMMAND_TYPES.has(type) || TRANSIENT_COMMAND_TYPES.has(type)) {
    if (!isRecord(payload)) return { ok: false, error: `${type} payload must be an object` };
    return { ok: true, message: value };
  }
  if (OUTPUT_ACK_TYPES.has(type)) {
    if (!isRecord(payload) || !isNonEmptyString(payload.commandId) || !isNonEmptyString(payload.outputId)) {
      return { ok: false, error: `${type} needs commandId and outputId` };
    }
    if (type === 'OUTPUT_FAILED' && !isNonEmptyString(payload.reason)) {
      return { ok: false, error: 'OUTPUT_FAILED needs a reason' };
    }
    return { ok: true, message: value };
  }
  if (type === 'OUTPUT_STATUS') {
    if (!isRecord(payload) || !isNonEmptyString(payload.outputId)) {
      return { ok: false, error: 'OUTPUT_STATUS needs an outputId' };
    }
    return { ok: true, message: value };
  }
  return { ok: false, error: `Unknown message type "${type}"` };
}

/** Pure: (snapshot, validated message, now) → next snapshot. */
export function reduceRelaySnapshot(snapshot, message, now) {
  if (message.type === SCRIPTURE_OUTPUTS_TYPE) {
    // Its own slot, so a burst of commands can never evict it — this is the
    // only copy a cross-browser output will ever see.
    return { ...snapshot, scriptureOutputs: message };
  }
  if (AIR_COMMAND_TYPES.has(message.type)) {
    // A new command supersedes the previous one AND the ack that answered it —
    // keeping the old ack would replay a confirmation beside a command it
    // does not match.
    return { ...snapshot, command: message, ack: null };
  }
  if (TRANSIENT_COMMAND_TYPES.has(message.type)) {
    // Broadcast live by the server; never retained (see module comment).
    return snapshot;
  }
  if (OUTPUT_ACK_TYPES.has(message.type)) {
    const matchesCommand = snapshot.command !== null && message.payload.commandId === snapshot.command.id;
    return {
      ...snapshot,
      // Only the ack for the CURRENT command is worth replaying; a stale one
      // is dropped from retention (clients also match by commandId — this is
      // defence in depth, not the only guard).
      ack: matchesCommand ? message : snapshot.ack,
      outputLastSeenAt: now
    };
  }
  if (message.type === 'OUTPUT_STATUS') {
    return { ...snapshot, status: message, outputLastSeenAt: now };
  }
  return snapshot;
}

/**
 * What a new SSE client receives, in an order that is safe to apply blindly:
 * the per-screen looks first (so a restored scripture card is painted the way
 * this screen is configured rather than flashing the default), then the command
 * (restores `/output` and hydrates control Program), then the matching ack
 * (confirms it), then the latest source status.
 */
export function snapshotReplay(snapshot) {
  return [snapshot.scriptureOutputs, snapshot.command, snapshot.ack, snapshot.status].filter(
    (entry) => entry !== null
  );
}
