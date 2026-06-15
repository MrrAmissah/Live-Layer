import type { LayoutSettings } from './layout';

export type TemplateFieldType = 'text' | 'textarea' | 'color' | 'url';

export interface TemplateField {
  id: string;
  label: string;
  type: TemplateFieldType;
  placeholder?: string;
  optional?: boolean;
  rows?: number;
}

export interface TemplateTheme {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor?: string;
  /** Secondary accent (stripes/keylines) for output graphics. Optional + defaulted, so older stored presets stay valid. */
  accent2Color?: string;
  /** Optional theme-level logo reference; templates currently keep logoAssetId in values for preset compatibility. */
  logoAssetId?: string;
}

export interface TemplateAnimation {
  in: 'fade' | 'slide' | 'grow';
  out: 'fade' | 'slide' | 'shrink';
}

export interface TemplateDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  fields: TemplateField[];
  defaultValues: Record<string, string>;
  theme: TemplateTheme;
  animation?: TemplateAnimation;
}

export interface GraphicInstance {
  id: string;
  templateId: string;
  presetName?: string;
  values: Record<string, string>;
  theme: Partial<TemplateTheme>;
  assetRefs?: Record<string, string>;
  personId?: string;
  layout?: LayoutSettings;
  animationOverride?: Partial<TemplateAnimation>;
  durationSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export type RealtimeMessageType =
  | 'SHOW_GRAPHIC'
  | 'HIDE_GRAPHIC'
  | 'CLEAR_ALL'
  | 'UPDATE_PREVIEW'
  | 'LOAD_PRESET'
  | 'SET_THEME';

export interface ShowGraphicMessage {
  id: string;
  type: 'SHOW_GRAPHIC';
  payload: GraphicInstance;
  timestamp: number;
}

export interface HideGraphicMessage {
  id: string;
  type: 'HIDE_GRAPHIC';
  payload: { id: string };
  timestamp: number;
}

export interface ClearAllMessage {
  id: string;
  type: 'CLEAR_ALL';
  payload: Record<string, never>;
  timestamp: number;
}

export interface UpdatePreviewMessage {
  id: string;
  type: 'UPDATE_PREVIEW';
  payload: GraphicInstance;
  timestamp: number;
}

export interface LoadPresetMessage {
  id: string;
  type: 'LOAD_PRESET';
  payload: GraphicInstance;
  timestamp: number;
}

export interface SetThemeMessage {
  id: string;
  type: 'SET_THEME';
  payload: TemplateTheme;
  timestamp: number;
}

export type RealtimeMessage =
  | ShowGraphicMessage
  | HideGraphicMessage
  | ClearAllMessage
  | UpdatePreviewMessage
  | LoadPresetMessage
  | SetThemeMessage;
