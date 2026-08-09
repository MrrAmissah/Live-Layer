import type { ControlCommandMessage, RealtimeMessage } from '../types/graphics';
import {
  REALTIME_CHANNEL_NAME,
  REALTIME_STORAGE_MESSAGE_KEY,
  createRealtimeId,
  createSeenIds,
  parseRealtimeMessage
} from './realtimeMessages';
import { getRealtimeRelayUrl } from './relayConfig';

// Re-exported so existing control-side imports keep one entry point. The
// OUTPUT side must not import this module at all — it has its own pair
// (`outputChannel.ts` to receive, `outputAck.ts` to report) and the isolation
// guard enforces the split.
export { parseRealtimeMessage } from './realtimeMessages';
export { getRealtimeRelayUrl } from './relayConfig';

/**
 * The CONTROL surface's realtime endpoint: publishes commands, and receives
 * everything the transports deliver — other control clients' commands (so two
 * open controls stay in agreement) and `/output`'s acknowledgements. What a
 * received message MEANS for Program is not decided here; that rule lives in
 * `lib/programSync.ts` where it is testable. This module only guarantees
 * delivery, validation and duplicate suppression.
 */
export function createRealtimeChannel(onMessage: (message: RealtimeMessage) => void) {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(REALTIME_CHANNEL_NAME) : null;
  // Bounded set, not a single last id: with commands and acks interleaving
  // across three transports, A,B,A must not re-deliver A.
  const seen = createSeenIds();

  const handleMessage = (message: RealtimeMessage) => {
    if (!seen.add(message.id)) return;
    onMessage(message);
  };
  const relay = createRelayClient(handleMessage);

  if (channel) {
    channel.onmessage = (event) => {
      const message = parseRealtimeMessage(event.data);
      if (message) handleMessage(message);
    };
  }

  const storageListener = (event: StorageEvent) => {
    if (event.key !== REALTIME_STORAGE_MESSAGE_KEY || !event.newValue) return;
    try {
      const message = parseRealtimeMessage(JSON.parse(event.newValue));
      if (message) handleMessage(message);
    } catch {
      // ignore malformed fallback messages
    }
  };

  window.addEventListener('storage', storageListener);

  return {
    /**
     * Dispatch a command and report what actually happened.
     *
     * Local dispatch still runs first so same-browser output stays instant, but
     * when a relay is configured the relay's answer is the result: a
     * BroadcastChannel/localStorage write says nothing about whether the remote
     * machine received the command.
     */
    async post(message: RealtimeMessage): Promise<PublishResult> {
      // Own messages are marked seen at send time, so the relay echoing our own
      // command back over SSE (it broadcasts to every client, including the
      // sender) is dropped here rather than re-entering the Program reducer.
      seen.add(message.id);
      let localDelivered = false;
      if (channel) {
        try {
          channel.postMessage(message);
          localDelivered = true;
        } catch {
          // A closed channel is not fatal on its own — the mirror may still work.
        }
      }
      try {
        localStorage.setItem(REALTIME_STORAGE_MESSAGE_KEY, JSON.stringify(message));
        localDelivered = true;
      } catch {
        // ignore quota errors
      }

      if (relay) return relay.post(message);
      return localDelivered
        ? { ok: true, transport: 'local' }
        : { ok: false, transport: 'none', reason: 'no-transport' };
    },
    close() {
      if (channel) {
        channel.close();
      }
      relay?.close();
      window.removeEventListener('storage', storageListener);
    }
  };
}

/**
 * Publish a command and report what the transport actually did.
 *
 * Callers must not treat "no channel" as success: before the channel is created
 * (or after it is closed) nothing reaches output, so the operator-facing state
 * must stay honest. `ok: true` means an available transport accepted the
 * command — for a relay, that it answered 2xx. It is NOT an output
 * acknowledgement: Program confirmation stays `unconfirmed` until an
 * OUTPUT_APPLIED with the matching commandId arrives (see `lib/programSync.ts`).
 */
export async function publishCommand(
  channel: { post: (message: RealtimeMessage) => Promise<PublishResult> } | null | undefined,
  message: RealtimeMessage
): Promise<PublishResult> {
  if (!channel) return { ok: false, transport: 'none', reason: 'no-channel' };
  try {
    return await channel.post(message);
  } catch (error) {
    return { ok: false, transport: 'none', reason: 'network', detail: errorMessage(error) };
  }
}

/** Operator-facing reason a command did not go out. */
export type PublishFailureReason = 'no-channel' | 'no-transport' | 'network' | 'http' | 'timeout';

export type PublishResult =
  | { ok: true; transport: 'local' | 'relay' }
  | { ok: false; transport: 'local' | 'relay' | 'none'; reason: PublishFailureReason; detail?: string };

/** A hung relay must not wedge Take; bounded so failure surfaces quickly. */
export const RELAY_TIMEOUT_MS = 4000;

/**
 * POST a command to the relay and await its answer. Failures are surfaced, not
 * swallowed: when control and output sit on different machines the relay is the
 * only path, so a dropped POST means the remote output never saw the command.
 * Exactly one request per call — no retry, so a Take cannot be duplicated.
 *
 * `deps` exists for tests; production uses the global fetch and timer.
 */
export async function postToRelay(
  relayUrl: string,
  message: RealtimeMessage,
  deps: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<PublishResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? RELAY_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${relayUrl}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
      signal: controller.signal
    });
    if (!response.ok) {
      return { ok: false, transport: 'relay', reason: 'http', detail: `Relay responded ${response.status}` };
    }
    return { ok: true, transport: 'relay' };
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, transport: 'relay', reason: 'timeout', detail: `No relay response in ${timeoutMs}ms` };
    }
    return { ok: false, transport: 'relay', reason: 'network', detail: errorMessage(error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Construct a CONTROL command. Typed against `ControlCommandMessage` on
 * purpose: this is the control side's only construction site, and it must not
 * be able to mint output-originated events (`OUTPUT_*`) any more than
 * `/output` may mint commands.
 */
export function createMessage(type: ControlCommandMessage['type'], payload: unknown): ControlCommandMessage {
  return {
    id: createRealtimeId(),
    type,
    payload,
    timestamp: Date.now()
  } as ControlCommandMessage;
}

function createRelayClient(onRelayMessage: (message: RealtimeMessage) => void) {
  const relayUrl = getRealtimeRelayUrl();
  if (!relayUrl || typeof EventSource === 'undefined') return null;

  const events = new EventSource(`${relayUrl}/events`);
  events.onmessage = (event) => {
    try {
      const message = parseRealtimeMessage(JSON.parse(event.data));
      if (message) onRelayMessage(message);
    } catch {
      // ignore malformed relay messages
    }
  };

  return {
    post: (message: RealtimeMessage) => postToRelay(relayUrl, message),
    close() {
      events.close();
    }
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
