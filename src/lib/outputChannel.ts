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

  /** Returns whether this was the FIRST sighting — the relay path forwards on it. */
  const handleMessage = (message: RealtimeMessage): boolean => {
    if (!seen.add(message.id)) return false;
    onMessage(message);
    return true;
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
        if (!message) return;
        const fresh = handleMessage(message);
        /**
         * PASS IT ON TO THE OTHER PAGES IN THIS BROWSER.
         *
         * Chromium allows six connections per host and OBS's browser sources
         * share one socket pool, so five or six sources — each holding an
         * EventSource open to the relay for the whole service — use it up
         * between them. The consequence that bit was not the sending side but
         * this one: an EventSource that drops can never reconnect, because
         * every socket is held by a connection that never closes. The source
         * goes deaf for the rest of the service and nothing says so.
         *
         * Re-broadcasting locally means ONE surviving relay connection feeds
         * every other page in the browser. It costs nothing when all of them
         * are healthy — `seen` drops the duplicate on arrival — and it is the
         * difference between one dead socket and one dead screen.
         *
         * Only RELAY-sourced messages are forwarded, and only the first time
         * they are seen, so this cannot echo: a page that receives over the
         * channel does not put it back on the channel.
         */
        if (fresh && channel) {
          try {
            channel.postMessage(message);
          } catch {
            // A closed channel costs the relay nothing; this page still applied it.
          }
        }
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
