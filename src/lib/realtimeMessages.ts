import type { GraphicInstance, RealtimeMessage, TemplateTheme } from '../types/graphics';

/**
 * The realtime protocol's SHARED, SIDE-FREE core: message validation and the
 * transport names both surfaces must agree on. Nothing here can send — no
 * fetch, no channel, no storage writes — so it is safe inside the `/output`
 * render-path closure (`scripts/check-output-isolation.mjs` walks it).
 *
 * Construction stays directional and lives elsewhere:
 *  - control commands  → `lib/realtime.ts#createMessage`
 *  - output events     → `lib/outputAck.ts#createOutputEvent`
 */
export const REALTIME_CHANNEL_NAME = 'livelayer:graphics';
/** localStorage mirror of the last CONTROL command (see storage.ts STORAGE_KEYS). */
export const REALTIME_STORAGE_MESSAGE_KEY = 'livelayer:lastMessage';

export function createRealtimeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Strict per-type validation. Anything that does not match a known shape is
 * dropped as `null`, never coerced — a malformed message must not reach either
 * an air-rendering path or a Program record. Output events get the same
 * strictness as commands: an ack without a real `commandId` could never be
 * matched honestly, so it is rejected at the door.
 */
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

  if (value.type === 'OUTPUT_APPLIED') {
    const p = value.payload;
    if (!isRecord(p) || !isNonEmptyString(p.commandId) || !isNonEmptyString(p.outputId)) return null;
    if (!isNonEmptyString(p.graphicId)) return null;
    if (p.templateId !== undefined && typeof p.templateId !== 'string') return null;
    return {
      id: value.id,
      type: value.type,
      payload: {
        commandId: p.commandId,
        outputId: p.outputId,
        graphicId: p.graphicId,
        ...(p.templateId !== undefined ? { templateId: p.templateId } : {})
      },
      timestamp: value.timestamp
    };
  }
  if (value.type === 'OUTPUT_CLEARED') {
    const p = value.payload;
    if (!isRecord(p) || !isNonEmptyString(p.commandId) || !isNonEmptyString(p.outputId)) return null;
    return {
      id: value.id,
      type: value.type,
      payload: { commandId: p.commandId, outputId: p.outputId },
      timestamp: value.timestamp
    };
  }
  if (value.type === 'OUTPUT_FAILED') {
    const p = value.payload;
    if (!isRecord(p) || !isNonEmptyString(p.commandId) || !isNonEmptyString(p.outputId)) return null;
    if (!isNonEmptyString(p.reason)) return null;
    if (p.graphicId !== undefined && typeof p.graphicId !== 'string') return null;
    return {
      id: value.id,
      type: value.type,
      payload: {
        commandId: p.commandId,
        outputId: p.outputId,
        reason: p.reason,
        ...(p.graphicId !== undefined ? { graphicId: p.graphicId } : {})
      },
      timestamp: value.timestamp
    };
  }
  if (value.type === 'OUTPUT_STATUS') {
    const p = value.payload;
    if (!isRecord(p) || !isNonEmptyString(p.outputId)) return null;
    if (!isBooleanOrNull(p.sourceActive) || !isBooleanOrNull(p.sourceVisible)) return null;
    return {
      id: value.id,
      type: value.type,
      payload: { outputId: p.outputId, sourceActive: p.sourceActive, sourceVisible: p.sourceVisible },
      timestamp: value.timestamp
    };
  }
  return null;
}

/**
 * Duplicate suppression for a fan-in of transports. A message legitimately
 * arrives more than once (BroadcastChannel + storage mirror + relay echo), and
 * deliveries INTERLEAVE — remembering only the single last id re-delivered A in
 * the sequence A,B,A. Bounded so a long session cannot grow it forever.
 */
export function createSeenIds(limit = 128) {
  const seen = new Set<string>();
  return {
    /** True the first time an id is offered; false for any repeat. */
    add(id: string): boolean {
      if (seen.has(id)) return false;
      seen.add(id);
      if (seen.size > limit) {
        // Sets iterate in insertion order, so the first entry is the oldest.
        const oldest = seen.values().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      return true;
    }
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isBooleanOrNull(value: unknown): value is boolean | null {
  return value === null || typeof value === 'boolean';
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
  /**
   * Optional by design: every graphic authored before service context existed
   * has no `dynamicContext` and stays valid. Present-but-malformed is rejected
   * rather than coerced — a bad datetime reaching Output renders as garbage.
   */
  if (value.dynamicContext !== undefined) {
    const context = value.dynamicContext;
    if (typeof context !== 'object' || context === null || Array.isArray(context)) return false;
    const eventDateTime = (context as Record<string, unknown>).eventDateTime;
    if (eventDateTime !== undefined && typeof eventDateTime !== 'string') return false;
  }
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
