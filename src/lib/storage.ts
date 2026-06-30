import type { GraphicInstance, TemplateDefinition } from '../types/graphics';

const STORAGE_KEYS = {
  presets: 'livelayer.presets',
  brand: 'livelayer.brand',
  recent: 'livelayer.recent',
  scriptureCache: 'livelayer.scriptureCache',
  chapterVerseCache: 'livelayer.chapterVerseCache',
  lastRealtimeMessage: 'livelayer:lastMessage'
};

const DEFAULT_THEME: TemplateDefinition['theme'] = {
  primaryColor: '#f8fafc',
  accentColor: '#0d2095',
  backgroundColor: 'transparent',
  surfaceColor: '#07106a',
  accent2Color: '#1284ff'
};
const THEME_KEYS = ['primaryColor', 'accentColor', 'backgroundColor', 'surfaceColor', 'accent2Color', 'logoAssetId'] as const;

function safeReadJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function safeWrite(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors for now
  }
}

export function loadPresets() {
  return loadGraphicList(STORAGE_KEYS.presets);
}

export function savePresets(presets: GraphicInstance[]) {
  safeWrite(STORAGE_KEYS.presets, presets);
}

export function loadRecentGraphics() {
  return loadGraphicList(STORAGE_KEYS.recent);
}

export function saveRecentGraphics(recent: GraphicInstance[]) {
  safeWrite(STORAGE_KEYS.recent, recent);
}

export function loadBrandOverrides() {
  const raw = safeReadJson(STORAGE_KEYS.brand);
  return {
    ...DEFAULT_THEME,
    ...parseTheme(raw)
  };
}

export function defaultBrandTheme(): TemplateDefinition['theme'] {
  return { ...DEFAULT_THEME };
}

export function saveBrandOverrides(theme: TemplateDefinition['theme']) {
  safeWrite(STORAGE_KEYS.brand, theme);
}

export function clearAllData() {
  try {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore errors during cleanup
  }
}

function loadGraphicList(key: string): GraphicInstance[] {
  const raw = safeReadJson(key);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isGraphicInstance);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function parseTheme(value: unknown): Partial<TemplateDefinition['theme']> {
  if (!isRecord(value)) return {};
  const theme: Partial<TemplateDefinition['theme']> = {};
  for (const key of THEME_KEYS) {
    const next = value[key];
    if (typeof next === 'string') {
      theme[key] = next;
    }
  }
  return theme;
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
