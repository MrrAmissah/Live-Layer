import type { RealtimeMessage } from '../types/graphics';
import {
  REALTIME_CHANNEL_NAME,
  REALTIME_STORAGE_MESSAGE_KEY,
  createSeenIds,
  parseRealtimeMessage
} from './realtimeMessages';
import { getRealtimeRelayUrl } from './relayConfig';

/**
 * The OUTPUT surface's inbound endpoint — RECEIVE ONLY, by construction.
 *
 * `/output` used to share `createRealtimeChannel` with the control page, which
 * meant the page that renders to air held an object with a `.post()` on it.
 * Nothing called it, but "nothing calls it" is a code-review property, not a
 * guarantee. This module has no post, no createMessage, and no way to acquire
 * one; the only thing output may transmit is an acknowledgement through
 * `lib/outputAck.ts`, which can construct only OUTPUT_* events. The isolation
 * guard (`scripts/check-output-isolation.mjs`) pins both halves.
 *
 * Transports mirror the control channel: BroadcastChannel + the localStorage
 * mirror's storage event for same-browser setups, an EventSource on the relay
 * for cross-machine ones. Duplicates across the fan-in are dropped by id.
 */
export function createOutputChannel(onMessage: (message: RealtimeMessage) => void) {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(REALTIME_CHANNEL_NAME) : null;
  const seen = createSeenIds();

  const handleMessage = (message: RealtimeMessage) => {
    if (!seen.add(message.id)) return;
    onMessage(message);
  };

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

  const relayUrl = getRealtimeRelayUrl();
  const events =
    relayUrl && typeof EventSource !== 'undefined' ? new EventSource(`${relayUrl}/events`) : null;
  if (events) {
    events.onmessage = (event) => {
      try {
        const message = parseRealtimeMessage(JSON.parse(event.data));
        if (message) handleMessage(message);
      } catch {
        // ignore malformed relay messages
      }
    };
  }

  return {
    close() {
      channel?.close();
      events?.close();
      window.removeEventListener('storage', storageListener);
    }
  };
}

/** Restore-on-refresh source: the last command mirrored to localStorage. */
export function loadLastRealtimeMessage(): RealtimeMessage | null {
  try {
    const raw = localStorage.getItem(REALTIME_STORAGE_MESSAGE_KEY);
    if (!raw) return null;
    return parseRealtimeMessage(JSON.parse(raw));
  } catch {
    return null;
  }
}
