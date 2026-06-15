import type { GraphicInstance, RealtimeMessage, TemplateTheme } from '../types/graphics';

const CHANNEL_NAME = 'livelayer:graphics';
const STORAGE_MESSAGE_KEY = 'livelayer:lastMessage';

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
    post(message: RealtimeMessage) {
      if (channel) {
        channel.postMessage(message);
      }
      try {
        localStorage.setItem(STORAGE_MESSAGE_KEY, JSON.stringify(message));
      } catch {
        // ignore quota errors
      }
    },
    close() {
      if (channel) {
        channel.close();
      }
      window.removeEventListener('storage', storageListener);
    }
  };
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

function parseRealtimeMessage(value: unknown): RealtimeMessage | null {
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
