import { GraphicInstance, TemplateDefinition } from '../types/graphics';

const STORAGE_KEYS = {
  presets: 'livelayer.presets',
  brand: 'livelayer.brand',
  recent: 'livelayer.recent'
};

function safeRead<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : defaultValue;
  } catch {
    return defaultValue;
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
  return safeRead<GraphicInstance[]>(STORAGE_KEYS.presets, []);
}

export function savePresets(presets: GraphicInstance[]) {
  safeWrite(STORAGE_KEYS.presets, presets);
}

export function loadRecentGraphics() {
  return safeRead<GraphicInstance[]>(STORAGE_KEYS.recent, []);
}

export function saveRecentGraphics(recent: GraphicInstance[]) {
  safeWrite(STORAGE_KEYS.recent, recent);
}

export function loadBrandOverrides() {
  return safeRead<TemplateDefinition['theme']>(STORAGE_KEYS.brand, {
    primaryColor: '#f8fafc',
    accentColor: '#fbbf24',
    backgroundColor: 'transparent'
  });
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
