import { RealtimeMessage } from '../types/graphics';

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
      if (event.data?.type) {
        handleMessage(event.data as RealtimeMessage);
      }
    };
  }

  const storageListener = (event: StorageEvent) => {
    if (event.key !== STORAGE_MESSAGE_KEY || !event.newValue) return;
    try {
      const message = JSON.parse(event.newValue) as RealtimeMessage;
      if (message?.type) {
        handleMessage(message);
      }
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
    return JSON.parse(raw) as RealtimeMessage;
  } catch {
    return null;
  }
}
