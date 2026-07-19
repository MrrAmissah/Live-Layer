import type { GraphicInstance, RealtimeMessage, TemplateTheme } from '../types/graphics';

const CHANNEL_NAME = 'livelayer:graphics';
const STORAGE_MESSAGE_KEY = 'livelayer:lastMessage';
const RELAY_QUERY_PARAM = 'relay';
const RELAY_STORAGE_KEY = 'livelayer:relayUrl';

function createMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createRealtimeChannel(onMessage: (message: RealtimeMessage) => void) {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
  let lastSeenId: string | null = null;

  const handleMessage = (message: RealtimeMessage) => {
    if (message.id === lastSeenId) return;
    lastSeenId = message.id;
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
    if (event.key !== STORAGE_MESSAGE_KEY || !event.newValue) return;
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
        localStorage.setItem(STORAGE_MESSAGE_KEY, JSON.stringify(message));
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
 * acknowledgement: Program confirmation stays `unconfirmed` either way.
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

export function createMessage(type: RealtimeMessage['type'], payload: unknown): RealtimeMessage {
  return {
    id: createMessageId(),
    type,
    payload,
    timestamp: Date.now()
  } as RealtimeMessage;
}

export function loadLastRealtimeMessage(): RealtimeMessage | null {
  try {
    const raw = localStorage.getItem(STORAGE_MESSAGE_KEY);
    if (!raw) return null;
    return parseRealtimeMessage(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function parseRealtimeMessage(value: unknown): RealtimeMessage | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string') return null;
  if (typeof value.type !== 'string') return null;
  if (typeof value.timestamp !== 'number' || !Number.isFinite(value.timestamp)) return null;

  if (value.type === 'SHOW_GRAPHIC') {
    if (!isGraphicInstance(value.payload)) return null;
    return { id: value.id, type: value.type, payload: value.payload, timestamp: value.timestamp };
  }
  if (value.type === 'UPDATE_PREVIEW') {
    if (!isGraphicInstance(value.payload)) return null;
    return { id: value.id, type: value.type, payload: value.payload, timestamp: value.timestamp };
  }
  if (value.type === 'LOAD_PRESET') {
    if (!isGraphicInstance(value.payload)) return null;
    return { id: value.id, type: value.type, payload: value.payload, timestamp: value.timestamp };
  }
  if (value.type === 'HIDE_GRAPHIC') {
    if (!isRecord(value.payload) || typeof value.payload.id !== 'string') return null;
    return { id: value.id, type: value.type, payload: { id: value.payload.id }, timestamp: value.timestamp };
  }
  if (value.type === 'CLEAR_ALL') {
    if (!isRecord(value.payload)) return null;
    return { id: value.id, type: value.type, payload: {}, timestamp: value.timestamp };
  }
  if (value.type === 'SET_THEME') {
    if (!isTemplateTheme(value.payload)) return null;
    return { id: value.id, type: value.type, payload: value.payload, timestamp: value.timestamp };
  }
  return null;
}

export function getRealtimeRelayUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const rawParam = params.get(RELAY_QUERY_PARAM);
  if (rawParam !== null) {
    if (rawParam === '' || rawParam.toLowerCase() === 'off') {
      try {
        localStorage.removeItem(RELAY_STORAGE_KEY);
      } catch {
        // ignore storage errors
      }
      return null;
    }

    const normalized = normalizeRelayUrl(rawParam);
    if (normalized) {
      try {
        localStorage.setItem(RELAY_STORAGE_KEY, normalized);
      } catch {
        // ignore storage errors
      }
      return normalized;
    }
  }

  try {
    const stored = localStorage.getItem(RELAY_STORAGE_KEY);
    return stored ? normalizeRelayUrl(stored) : null;
  } catch {
    return null;
  }
}

function normalizeRelayUrl(raw: string): string | null {
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function isGraphicInstance(value: unknown): value is GraphicInstance {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.templateId !== 'string') return false;
  if (typeof value.createdAt !== 'string') return false;
  if (typeof value.updatedAt !== 'string') return false;
  if (typeof value.durationSeconds !== 'number' || !Number.isFinite(value.durationSeconds) || value.durationSeconds < 0) return false;
  if (!isStringRecord(value.values)) return false;
  if (!isRecord(value.theme)) return false;
  if (value.assetRefs !== undefined && !isStringRecord(value.assetRefs)) return false;
  if (value.personId !== undefined && typeof value.personId !== 'string') return false;
  if (value.presetName !== undefined && typeof value.presetName !== 'string') return false;
  return true;
}

function isTemplateTheme(value: unknown): value is TemplateTheme {
  if (!isRecord(value)) return false;
  if (typeof value.primaryColor !== 'string') return false;
  if (typeof value.accentColor !== 'string') return false;
  if (typeof value.backgroundColor !== 'string') return false;
  if (value.surfaceColor !== undefined && typeof value.surfaceColor !== 'string') return false;
  if (value.accent2Color !== undefined && typeof value.accent2Color !== 'string') return false;
  if (value.logoAssetId !== undefined && typeof value.logoAssetId !== 'string') return false;
  return true;
}
